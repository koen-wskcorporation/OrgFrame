begin;

update public.org_custom_roles custom_role
set
  permissions = (
    select array_agg(distinct permission order by permission)
    from unnest(
      coalesce(custom_role.permissions, '{}'::text[])
      || array['events.read', 'events.write']::text[]
    ) as permission
  ),
  updated_at = now()
where true;

create or replace function public.has_org_permission(target_org_id uuid, required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with membership as (
    select membership.role
    from public.org_memberships membership
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
          'events.write'
        ]::text[]
        when 'member' then array[
          'org.dashboard.read',
          'org.branding.read',
          'org.pages.read'
        ]::text[]
        else coalesce(
          (
            select custom_role.permissions
            from public.org_custom_roles custom_role
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
set search_path = public
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
    )
    else false
  end;
$$;

create table if not exists public.org_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  title text not null,
  summary text,
  location text,
  timezone text not null default 'UTC',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  is_all_day boolean not null default false,
  all_day_start_date date,
  all_day_end_date date,
  starts_at_utc timestamptz not null,
  ends_at_utc timestamptz not null,
  settings_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_events_window_valid check (ends_at_utc > starts_at_utc),
  constraint org_events_all_day_shape check (
    (
      is_all_day
      and all_day_start_date is not null
      and all_day_end_date is not null
      and all_day_start_date <= all_day_end_date
    )
    or (
      not is_all_day
      and all_day_start_date is null
      and all_day_end_date is null
    )
  )
);

create index if not exists org_events_org_status_starts_idx on public.org_events (org_id, status, starts_at_utc);
create index if not exists org_events_org_starts_idx on public.org_events (org_id, starts_at_utc);
create index if not exists org_events_org_updated_idx on public.org_events (org_id, updated_at desc);
create index if not exists org_events_org_all_day_start_idx on public.org_events (org_id, all_day_start_date) where is_all_day;

drop trigger if exists org_events_set_updated_at on public.org_events;
create trigger org_events_set_updated_at before update on public.org_events for each row execute procedure public.set_updated_at();

alter table public.org_events enable row level security;

drop policy if exists org_events_public_or_read on public.org_events;
create policy org_events_public_or_read on public.org_events
  for select
  using (
    status = 'published'
    or public.has_org_permission(org_id, 'events.read')
    or public.has_org_permission(org_id, 'events.write')
  );

drop policy if exists org_events_write on public.org_events;
create policy org_events_write on public.org_events
  for all
  using (public.has_org_permission(org_id, 'events.write'))
  with check (public.has_org_permission(org_id, 'events.write'));

commit;
