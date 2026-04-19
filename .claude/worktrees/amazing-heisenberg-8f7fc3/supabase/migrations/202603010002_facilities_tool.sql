begin;

create extension if not exists btree_gist;

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
          'events.write',
          'facilities.read',
          'facilities.write'
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

create table if not exists public.facility_spaces (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  parent_space_id uuid references public.facility_spaces(id) on delete set null,
  name text not null,
  slug text not null,
  space_kind text not null default 'custom' check (space_kind in ('building', 'room', 'field', 'court', 'custom')),
  status text not null default 'open' check (status in ('open', 'closed', 'archived')),
  is_bookable boolean not null default true,
  timezone text not null default 'UTC',
  capacity integer check (capacity is null or capacity >= 0),
  metadata_json jsonb not null default '{}'::jsonb,
  sort_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug)
);

create index if not exists facility_spaces_org_parent_idx on public.facility_spaces (org_id, parent_space_id, sort_index, created_at);
create index if not exists facility_spaces_org_status_idx on public.facility_spaces (org_id, status, sort_index, created_at);
create index if not exists facility_spaces_parent_idx on public.facility_spaces (parent_space_id);

drop trigger if exists facility_spaces_set_updated_at on public.facility_spaces;
create trigger facility_spaces_set_updated_at before update on public.facility_spaces for each row execute procedure public.set_updated_at();

create table if not exists public.facility_reservation_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  space_id uuid not null references public.facility_spaces(id) on delete cascade,
  mode text not null check (mode in ('single_date', 'multiple_specific_dates', 'repeating_pattern', 'continuous_date_range', 'custom_advanced')),
  reservation_kind text not null default 'booking' check (reservation_kind in ('booking', 'blackout')),
  default_status text not null default 'pending' check (default_status in ('pending', 'approved', 'rejected', 'cancelled')),
  public_label text,
  internal_notes text,
  timezone text not null,
  start_date date,
  end_date date,
  start_time time,
  end_time time,
  interval_count integer not null default 1 check (interval_count > 0),
  interval_unit text check (interval_unit in ('day', 'week', 'month')),
  by_weekday smallint[],
  by_monthday smallint[],
  end_mode text not null default 'until_date' check (end_mode in ('never', 'until_date', 'after_occurrences')),
  until_date date,
  max_occurrences integer check (max_occurrences is null or max_occurrences > 0),
  event_id uuid references public.org_events(id) on delete set null,
  program_id uuid references public.programs(id) on delete set null,
  conflict_override boolean not null default false,
  sort_index integer not null default 0,
  is_active boolean not null default true,
  config_json jsonb not null default '{}'::jsonb,
  rule_hash text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint facility_reservation_rules_date_window_valid check (
    start_date is null or end_date is null or start_date <= end_date
  )
);

create index if not exists facility_reservation_rules_org_space_idx on public.facility_reservation_rules (org_id, space_id, sort_index, created_at);
create index if not exists facility_reservation_rules_org_active_idx on public.facility_reservation_rules (org_id, is_active, updated_at desc);

drop trigger if exists facility_reservation_rules_set_updated_at on public.facility_reservation_rules;
create trigger facility_reservation_rules_set_updated_at before update on public.facility_reservation_rules for each row execute procedure public.set_updated_at();

create table if not exists public.facility_reservations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  space_id uuid not null references public.facility_spaces(id) on delete cascade,
  source_rule_id uuid references public.facility_reservation_rules(id) on delete set null,
  source_key text not null,
  reservation_kind text not null default 'booking' check (reservation_kind in ('booking', 'blackout')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  timezone text not null,
  local_date date not null,
  local_start_time time,
  local_end_time time,
  starts_at_utc timestamptz not null,
  ends_at_utc timestamptz not null,
  public_label text,
  internal_notes text,
  event_id uuid references public.org_events(id) on delete set null,
  program_id uuid references public.programs(id) on delete set null,
  conflict_override boolean not null default false,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, source_key),
  constraint facility_reservations_window_valid check (ends_at_utc > starts_at_utc)
);

create index if not exists facility_reservations_org_space_time_idx on public.facility_reservations (org_id, space_id, starts_at_utc, status);
create index if not exists facility_reservations_org_time_idx on public.facility_reservations (org_id, starts_at_utc, created_at);
create index if not exists facility_reservations_rule_idx on public.facility_reservations (source_rule_id, starts_at_utc) where source_rule_id is not null;
create index if not exists facility_reservations_program_idx on public.facility_reservations (program_id, starts_at_utc) where program_id is not null;
create index if not exists facility_reservations_event_idx on public.facility_reservations (event_id, starts_at_utc) where event_id is not null;

alter table public.facility_reservations
  drop constraint if exists facility_reservations_no_overlap;

alter table public.facility_reservations
  add constraint facility_reservations_no_overlap
  exclude using gist (
    space_id with =,
    tstzrange(starts_at_utc, ends_at_utc, '[)') with &&
  )
  where (
    status in ('pending', 'approved')
    and conflict_override = false
  );

drop trigger if exists facility_reservations_set_updated_at on public.facility_reservations;
create trigger facility_reservations_set_updated_at before update on public.facility_reservations for each row execute procedure public.set_updated_at();

create table if not exists public.facility_reservation_exceptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  rule_id uuid not null references public.facility_reservation_rules(id) on delete cascade,
  source_key text not null,
  kind text not null check (kind in ('skip', 'override')),
  override_reservation_id uuid references public.facility_reservations(id) on delete set null,
  payload_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, rule_id, source_key)
);

create index if not exists facility_reservation_exceptions_rule_idx on public.facility_reservation_exceptions (rule_id, source_key);
create index if not exists facility_reservation_exceptions_org_idx on public.facility_reservation_exceptions (org_id, created_at);

drop trigger if exists facility_reservation_exceptions_set_updated_at on public.facility_reservation_exceptions;
create trigger facility_reservation_exceptions_set_updated_at before update on public.facility_reservation_exceptions for each row execute procedure public.set_updated_at();

alter table public.facility_spaces enable row level security;
alter table public.facility_reservation_rules enable row level security;
alter table public.facility_reservations enable row level security;
alter table public.facility_reservation_exceptions enable row level security;

drop policy if exists facility_spaces_select on public.facility_spaces;
create policy facility_spaces_select on public.facility_spaces
  for select
  using (
    public.has_org_permission(org_id, 'facilities.read')
    or public.has_org_permission(org_id, 'facilities.write')
    or (
      status in ('open', 'closed')
      and status <> 'archived'
    )
  );

drop policy if exists facility_spaces_write on public.facility_spaces;
create policy facility_spaces_write on public.facility_spaces
  for all
  using (public.has_org_permission(org_id, 'facilities.write'))
  with check (public.has_org_permission(org_id, 'facilities.write'));

drop policy if exists facility_reservation_rules_select on public.facility_reservation_rules;
create policy facility_reservation_rules_select on public.facility_reservation_rules
  for select
  using (
    public.has_org_permission(org_id, 'facilities.read')
    or public.has_org_permission(org_id, 'facilities.write')
  );

drop policy if exists facility_reservation_rules_write on public.facility_reservation_rules;
create policy facility_reservation_rules_write on public.facility_reservation_rules
  for all
  using (public.has_org_permission(org_id, 'facilities.write'))
  with check (public.has_org_permission(org_id, 'facilities.write'));

drop policy if exists facility_reservations_select on public.facility_reservations;
create policy facility_reservations_select on public.facility_reservations
  for select
  using (
    public.has_org_permission(org_id, 'facilities.read')
    or public.has_org_permission(org_id, 'facilities.write')
    or (
      status in ('pending', 'approved')
      and public_label is not null
      and exists (
        select 1
        from public.facility_spaces space
        where space.id = facility_reservations.space_id
          and space.status in ('open', 'closed')
      )
    )
  );

drop policy if exists facility_reservations_write on public.facility_reservations;
create policy facility_reservations_write on public.facility_reservations
  for all
  using (public.has_org_permission(org_id, 'facilities.write'))
  with check (public.has_org_permission(org_id, 'facilities.write'));

drop policy if exists facility_reservation_exceptions_select on public.facility_reservation_exceptions;
create policy facility_reservation_exceptions_select on public.facility_reservation_exceptions
  for select
  using (
    public.has_org_permission(org_id, 'facilities.read')
    or public.has_org_permission(org_id, 'facilities.write')
  );

drop policy if exists facility_reservation_exceptions_write on public.facility_reservation_exceptions;
create policy facility_reservation_exceptions_write on public.facility_reservation_exceptions
  for all
  using (public.has_org_permission(org_id, 'facilities.write'))
  with check (public.has_org_permission(org_id, 'facilities.write'));

commit;
