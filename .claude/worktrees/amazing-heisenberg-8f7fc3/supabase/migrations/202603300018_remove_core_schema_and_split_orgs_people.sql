begin;

create schema if not exists orgs;
create schema if not exists people;
create schema if not exists ai;

-- Move core tenancy tables into orgs schema.
alter table if exists core.governing_bodies set schema orgs;
alter table if exists core.orgs set schema orgs;
alter table if exists core.org_memberships set schema orgs;
alter table if exists core.org_custom_roles set schema orgs;
alter table if exists core.org_tool_settings set schema orgs;

-- Move people profile records into people schema.
alter table if exists core.user_profiles set schema people;

-- Move audit logs into ai schema.
alter table if exists core.audit_logs set schema ai;

-- Repoint org permission helpers to new schemas.
create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, orgs
as $$
  select exists (
    select 1
    from orgs.org_memberships membership
    where membership.org_id = target_org_id
      and membership.user_id = auth.uid()
  );
$$;

create or replace function public.has_org_permission(target_org_id uuid, required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, orgs
as $$
  with membership as (
    select membership.role
    from orgs.org_memberships membership
    where membership.org_id = target_org_id
      and membership.user_id = auth.uid()
    limit 1
  ),
  role_permissions as (
    select
      case membership.role
        when 'admin' then array[
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
          'communications.write'
        ]::text[]
        when 'member' then array[
          'org.dashboard.read',
          'org.branding.read',
          'org.pages.read',
          'programs.read',
          'forms.read',
          'events.read',
          'calendar.read',
          'facilities.read',
          'communications.read'
        ]::text[]
        when 'user' then array[
          'org.dashboard.read',
          'org.branding.read',
          'org.pages.read',
          'programs.read',
          'forms.read',
          'events.read',
          'calendar.read',
          'facilities.read',
          'communications.read'
        ]::text[]
        when 'manager' then array[
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
          'events.write'
        ]::text[]
        when 'owner' then array[
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
          'communications.write'
        ]::text[]
        else coalesce(
          (
            select custom_role.permissions
            from orgs.org_custom_roles custom_role
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

create or replace function public.has_org_role(target_org_id uuid, minimum_role text)
returns boolean
language sql
stable
security definer
set search_path = public, orgs
as $$
  select case minimum_role
    when 'member' then public.has_org_permission(target_org_id, 'org.dashboard.read')
    when 'admin' then public.has_org_permission(target_org_id, 'org.manage.read')
    when 'manager' then (
      public.has_org_permission(target_org_id, 'org.manage.read')
      or public.has_org_permission(target_org_id, 'org.pages.write')
      or public.has_org_permission(target_org_id, 'programs.write')
      or public.has_org_permission(target_org_id, 'forms.write')
      or public.has_org_permission(target_org_id, 'events.write')
      or public.has_org_permission(target_org_id, 'calendar.write')
      or public.has_org_permission(target_org_id, 'facilities.write')
      or public.has_org_permission(target_org_id, 'communications.write')
    )
    else false
  end;
$$;

grant execute on function public.is_org_member(uuid) to anon, authenticated, service_role;
grant execute on function public.has_org_permission(uuid, text) to anon, authenticated, service_role;
grant execute on function public.has_org_role(uuid, text) to anon, authenticated, service_role;

-- Recreate site policies with memberships in orgs schema.
alter table if exists site.site_pages enable row level security;
alter table if exists site.site_page_blocks enable row level security;

drop policy if exists site_pages_public_read on site.site_pages;
create policy site_pages_public_read
on site.site_pages
for select
to anon, authenticated
using (status = 'published' or is_published = true);

drop policy if exists site_pages_member_read on site.site_pages;
create policy site_pages_member_read
on site.site_pages
for select
to authenticated
using (
  exists (
    select 1
    from orgs.org_memberships membership
    where membership.org_id = site_pages.org_id
      and membership.user_id = auth.uid()
  )
);

drop policy if exists site_pages_member_write on site.site_pages;
create policy site_pages_member_write
on site.site_pages
for all
to authenticated
using (
  exists (
    select 1
    from orgs.org_memberships membership
    where membership.org_id = site_pages.org_id
      and membership.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from orgs.org_memberships membership
    where membership.org_id = site_pages.org_id
      and membership.user_id = auth.uid()
  )
);

drop policy if exists site_page_blocks_public_read on site.site_page_blocks;
create policy site_page_blocks_public_read
on site.site_page_blocks
for select
to anon, authenticated
using (
  exists (
    select 1
    from site.site_pages page
    where page.id = site_page_blocks.site_page_id
      and (page.status = 'published' or page.is_published = true)
  )
);

drop policy if exists site_page_blocks_member_read on site.site_page_blocks;
create policy site_page_blocks_member_read
on site.site_page_blocks
for select
to authenticated
using (
  exists (
    select 1
    from site.site_pages page
    join orgs.org_memberships membership
      on membership.org_id = page.org_id
    where page.id = site_page_blocks.site_page_id
      and membership.user_id = auth.uid()
  )
);

drop policy if exists site_page_blocks_member_write on site.site_page_blocks;
create policy site_page_blocks_member_write
on site.site_page_blocks
for all
to authenticated
using (
  exists (
    select 1
    from site.site_pages page
    join orgs.org_memberships membership
      on membership.org_id = page.org_id
    where page.id = site_page_blocks.site_page_id
      and membership.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from site.site_pages page
    join orgs.org_memberships membership
      on membership.org_id = page.org_id
    where page.id = site_page_blocks.site_page_id
      and membership.user_id = auth.uid()
  )
);

-- Ensure roles can use orgs schema after table moves.
grant usage on schema orgs to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema orgs to anon, authenticated;
grant all privileges on all tables in schema orgs to service_role;
grant usage, select on all sequences in schema orgs to anon, authenticated, service_role;
alter default privileges in schema orgs grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema orgs grant all privileges on tables to service_role;
alter default privileges in schema orgs grant usage, select on sequences to anon, authenticated, service_role;

-- Remove core from PostgREST exposure and ensure orgs is included.
do $$
declare
  existing text := coalesce(current_setting('pgrst.db_schemas', true), 'public,storage,graphql_public');
  entry text;
  next_value text := '';
  has_orgs boolean := false;
begin
  foreach entry in array string_to_array(existing, ',') loop
    entry := btrim(entry);
    if entry = '' or entry = 'core' then
      continue;
    end if;

    if entry = 'orgs' then
      has_orgs := true;
    end if;

    if next_value = '' then
      next_value := entry;
    else
      next_value := next_value || ',' || entry;
    end if;
  end loop;

  if not has_orgs then
    if next_value = '' then
      next_value := 'orgs';
    else
      next_value := next_value || ',orgs';
    end if;
  end if;

  execute format('alter role authenticator set pgrst.db_schemas = %L', next_value);
end
$$;

notify pgrst, 'reload config';

drop schema if exists core;

commit;
