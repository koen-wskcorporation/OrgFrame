begin;

-- ----------------------------------------------------------------------------
-- orgs.custom_roles — per-org custom role definitions and their permission
-- arrays. Lives in the `orgs` schema (no `public` schema in this app).
-- Drop any older variants first so this migration is idempotent across resets.
-- ----------------------------------------------------------------------------

drop table if exists public.org_custom_roles cascade;
drop table if exists core.org_custom_roles cascade;
drop table if exists orgs.org_custom_roles cascade;

create table if not exists orgs.custom_roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  role_key text not null,
  label text not null,
  permissions text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, role_key)
);

create index if not exists custom_roles_org_idx on orgs.custom_roles (org_id, role_key);

alter table orgs.custom_roles
  drop constraint if exists custom_roles_role_key_check;
alter table orgs.custom_roles
  add constraint custom_roles_role_key_check
  check (role_key ~ '^[a-z][a-z0-9-]{1,31}$');

alter table orgs.custom_roles
  drop constraint if exists custom_roles_reserved_keys_check;
alter table orgs.custom_roles
  add constraint custom_roles_reserved_keys_check
  check (role_key not in ('admin', 'member', 'manager', 'owner', 'user', 'participant'));

drop trigger if exists custom_roles_set_updated_at on orgs.custom_roles;
create trigger custom_roles_set_updated_at
before update on orgs.custom_roles
for each row execute procedure public.set_updated_at();

-- ----------------------------------------------------------------------------
-- has_org_permission: built-in roles plus a fallback to orgs.custom_roles for
-- everything else. "participant" was redundant with "member" and is collapsed
-- into the "member" branch.
-- ----------------------------------------------------------------------------

create or replace function public.has_org_permission(target_org_id uuid, required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, orgs
as $$
  with membership as (
    select membership.role
    from orgs.memberships membership
    where membership.org_id = target_org_id
      and membership.user_id = auth.uid()
    limit 1
  ),
  role_permissions as (
    select
      case
        when membership.role in ('admin', 'owner') then array[
          'org.dashboard.read',
          'org.manage.read',
          'org.branding.read',
          'org.branding.write',
          'org.pages.read',
          'org.pages.write',
          'programs.read',
          'programs.write',
          'forms.read',
          'forms.write',
          'events.read',
          'events.write',
          'facilities.read',
          'facilities.write',
          'calendar.read',
          'calendar.write',
          'communications.read',
          'communications.write',
          'people.read',
          'people.write',
          'data.read',
          'data.write'
        ]::text[]
        when membership.role in ('member', 'user', 'participant') then array[
          'org.dashboard.read',
          'org.branding.read',
          'org.pages.read',
          'programs.read',
          'forms.read',
          'events.read',
          'calendar.read',
          'facilities.read',
          'communications.read',
          'people.read',
          'data.read'
        ]::text[]
        when membership.role = 'manager' then array[
          'org.dashboard.read',
          'org.manage.read',
          'org.branding.read',
          'org.pages.read',
          'org.pages.write',
          'programs.read',
          'programs.write',
          'forms.read',
          'forms.write',
          'calendar.read',
          'calendar.write',
          'events.read',
          'events.write',
          'people.read',
          'data.read'
        ]::text[]
        else coalesce(
          (
            select custom_role.permissions
            from orgs.custom_roles custom_role
            where custom_role.org_id = target_org_id
              and custom_role.role_key = membership.role
            limit 1
          ),
          array[]::text[]
        )
      end as permissions
    from membership
  )
  select exists (
    select 1
    from role_permissions
    where required_permission = any(role_permissions.permissions)
  );
$$;

-- Best-effort: collapse any existing 'participant' memberships into 'member'.
update orgs.memberships set role = 'member' where role = 'participant';

-- ----------------------------------------------------------------------------
-- RLS: any org member may read role definitions; only org.manage.read may CUD.
-- ----------------------------------------------------------------------------

alter table orgs.custom_roles enable row level security;

drop policy if exists custom_roles_member_read on orgs.custom_roles;
create policy custom_roles_member_read
on orgs.custom_roles
for select
using (public.is_org_member(org_id));

drop policy if exists custom_roles_manage_write on orgs.custom_roles;
create policy custom_roles_manage_write
on orgs.custom_roles
for all
using (public.has_org_permission(org_id, 'org.manage.read'))
with check (public.has_org_permission(org_id, 'org.manage.read'));

commit;
