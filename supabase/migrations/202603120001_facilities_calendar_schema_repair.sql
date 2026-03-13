-- Repair migration: restores facilities + calendar tables in public schema.
-- Use when prior migration history drift left these tables missing, misplaced, or stubbed.
begin;

create extension if not exists btree_gist;

-- Move facilities/calendar tables back into public if they were created in a non-public schema.
do $$
declare
  table_name text;
  source_schema text;
begin
  foreach table_name in array array[
    'facility_spaces',
    'facility_reservation_rules',
    'facility_reservations',
    'facility_reservation_exceptions',
    'facility_space_configurations',
    'calendar_entries',
    'calendar_rules',
    'calendar_occurrences',
    'calendar_rule_exceptions',
    'calendar_occurrence_facility_allocations',
    'calendar_occurrence_teams',
    'org_user_inbox_items'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is null then
      select ns.nspname
      into source_schema
      from pg_class cls
      join pg_namespace ns on ns.oid = cls.relnamespace
      where cls.relkind = 'r'
        and cls.relname = table_name
        and ns.nspname not in ('public', 'pg_catalog', 'information_schema', 'pg_toast')
      order by ns.nspname
      limit 1;

      if source_schema is not null then
        execute format('alter table %I.%I set schema public', source_schema, table_name);
      end if;
    end if;
  end loop;
end
$$;

-- If legacy node-allocation shape exists, replace it with space/configuration allocation shape.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'calendar_occurrence_facility_allocations'
      and column_name = 'node_id'
  ) then
    drop trigger if exists calendar_occurrence_facility_allocations_hierarchy_conflicts on public.calendar_occurrence_facility_allocations;
    drop trigger if exists calendar_occurrence_facility_allocations_hydrate_window on public.calendar_occurrence_facility_allocations;
    drop trigger if exists calendar_occurrence_facility_allocations_set_updated_at on public.calendar_occurrence_facility_allocations;
    drop trigger if exists calendar_occurrences_sync_facility_allocation_window on public.calendar_occurrences;
    drop function if exists public.ensure_calendar_node_allocation_hierarchy_conflicts();
    drop function if exists public.hydrate_calendar_node_allocation_window();
    drop function if exists public.sync_calendar_node_allocation_window_from_occurrence();
    drop function if exists public.facility_node_is_ancestor(uuid, uuid, uuid);
    drop table if exists public.calendar_occurrence_facility_allocations cascade;
  end if;
end
$$;

-- Remove stub tables if they were created by compatibility guards (missing core columns).
do $$
begin
  if to_regclass('public.facility_space_configurations') is not null
    and not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'facility_space_configurations'
        and column_name = 'space_id'
    ) then
    drop table public.facility_space_configurations cascade;
  end if;

  if to_regclass('public.facility_reservation_rules') is not null
    and not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'facility_reservation_rules'
        and column_name = 'space_id'
    ) then
    drop table public.facility_reservation_rules cascade;
  end if;

  if to_regclass('public.facility_reservations') is not null
    and not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'facility_reservations'
        and column_name = 'space_id'
    ) then
    drop table public.facility_reservations cascade;
  end if;

  if to_regclass('public.facility_reservation_exceptions') is not null
    and not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'facility_reservation_exceptions'
        and column_name = 'rule_id'
    ) then
    drop table public.facility_reservation_exceptions cascade;
  end if;
end
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
  status_labels_json jsonb not null default '{}'::jsonb,
  sort_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug)
);

alter table public.facility_spaces
  add column if not exists status_labels_json jsonb not null default '{}'::jsonb;

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

create table if not exists public.calendar_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  entry_type text not null check (entry_type in ('event', 'practice', 'game')),
  title text not null,
  summary text,
  visibility text not null default 'internal' check (visibility in ('internal', 'published')),
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled', 'archived')),
  host_team_id uuid references public.program_teams(id) on delete set null,
  default_timezone text not null default 'UTC',
  settings_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_entries_practice_host_required check (
    (entry_type = 'practice' and host_team_id is not null)
    or (entry_type <> 'practice')
  )
);

create index if not exists calendar_entries_org_status_idx on public.calendar_entries (org_id, status, created_at desc);
create index if not exists calendar_entries_org_type_visibility_idx on public.calendar_entries (org_id, entry_type, visibility, created_at desc);
create index if not exists calendar_entries_host_team_idx on public.calendar_entries (host_team_id, updated_at desc) where host_team_id is not null;

drop trigger if exists calendar_entries_set_updated_at on public.calendar_entries;
create trigger calendar_entries_set_updated_at before update on public.calendar_entries for each row execute procedure public.set_updated_at();

create table if not exists public.calendar_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  entry_id uuid not null references public.calendar_entries(id) on delete cascade,
  mode text not null check (mode in ('single_date', 'multiple_specific_dates', 'repeating_pattern', 'continuous_date_range', 'custom_advanced')),
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
  sort_index integer not null default 0,
  is_active boolean not null default true,
  config_json jsonb not null default '{}'::jsonb,
  rule_hash text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_rules_date_window_valid check (
    start_date is null or end_date is null or start_date <= end_date
  )
);

create index if not exists calendar_rules_org_entry_idx on public.calendar_rules (org_id, entry_id, sort_index, created_at);
create index if not exists calendar_rules_org_active_idx on public.calendar_rules (org_id, is_active, updated_at desc);

drop trigger if exists calendar_rules_set_updated_at on public.calendar_rules;
create trigger calendar_rules_set_updated_at before update on public.calendar_rules for each row execute procedure public.set_updated_at();

create table if not exists public.calendar_occurrences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  entry_id uuid not null references public.calendar_entries(id) on delete cascade,
  source_rule_id uuid references public.calendar_rules(id) on delete set null,
  source_type text not null check (source_type in ('single', 'rule', 'override')),
  source_key text not null,
  timezone text not null,
  local_date date not null,
  local_start_time time,
  local_end_time time,
  starts_at_utc timestamptz not null,
  ends_at_utc timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, source_key),
  constraint calendar_occurrences_window_valid check (ends_at_utc > starts_at_utc)
);

create index if not exists calendar_occurrences_org_time_idx on public.calendar_occurrences (org_id, starts_at_utc, status);
create index if not exists calendar_occurrences_entry_time_idx on public.calendar_occurrences (entry_id, starts_at_utc, status);
create index if not exists calendar_occurrences_rule_idx on public.calendar_occurrences (source_rule_id, starts_at_utc) where source_rule_id is not null;

drop trigger if exists calendar_occurrences_set_updated_at on public.calendar_occurrences;
create trigger calendar_occurrences_set_updated_at before update on public.calendar_occurrences for each row execute procedure public.set_updated_at();

create table if not exists public.calendar_rule_exceptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  rule_id uuid not null references public.calendar_rules(id) on delete cascade,
  source_key text not null,
  kind text not null check (kind in ('skip', 'override')),
  override_occurrence_id uuid references public.calendar_occurrences(id) on delete set null,
  payload_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, rule_id, source_key)
);

create index if not exists calendar_rule_exceptions_rule_idx on public.calendar_rule_exceptions (rule_id, source_key);

drop trigger if exists calendar_rule_exceptions_set_updated_at on public.calendar_rule_exceptions;
create trigger calendar_rule_exceptions_set_updated_at before update on public.calendar_rule_exceptions for each row execute procedure public.set_updated_at();

create table if not exists public.facility_space_configurations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  space_id uuid not null references public.facility_spaces(id) on delete cascade,
  name text not null,
  slug text not null,
  capacity_teams integer check (capacity_teams is null or capacity_teams > 0),
  is_active boolean not null default true,
  sort_index integer not null default 0,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, slug)
);

create index if not exists facility_space_configurations_org_space_idx on public.facility_space_configurations (org_id, space_id, sort_index, created_at);

drop trigger if exists facility_space_configurations_set_updated_at on public.facility_space_configurations;
create trigger facility_space_configurations_set_updated_at before update on public.facility_space_configurations for each row execute procedure public.set_updated_at();

create table if not exists public.calendar_occurrence_facility_allocations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  occurrence_id uuid not null references public.calendar_occurrences(id) on delete cascade,
  space_id uuid not null references public.facility_spaces(id) on delete cascade,
  configuration_id uuid not null references public.facility_space_configurations(id) on delete restrict,
  lock_mode text not null default 'exclusive' check (lock_mode in ('exclusive', 'shared_invite_only')),
  allow_shared boolean not null default false,
  starts_at_utc timestamptz not null,
  ends_at_utc timestamptz not null,
  is_active boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (occurrence_id),
  constraint calendar_occurrence_facility_allocations_window_valid check (ends_at_utc > starts_at_utc)
);

alter table public.calendar_occurrence_facility_allocations
  add column if not exists lock_mode text,
  add column if not exists allow_shared boolean,
  add column if not exists metadata_json jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

update public.calendar_occurrence_facility_allocations
set
  lock_mode = coalesce(lock_mode, 'exclusive'),
  allow_shared = coalesce(allow_shared, false),
  metadata_json = coalesce(metadata_json, '{}'::jsonb)
where lock_mode is null
  or allow_shared is null
  or metadata_json is null;

alter table public.calendar_occurrence_facility_allocations
  alter column lock_mode set default 'exclusive',
  alter column lock_mode set not null,
  alter column allow_shared set default false,
  alter column allow_shared set not null,
  alter column metadata_json set default '{}'::jsonb,
  alter column metadata_json set not null;

create index if not exists calendar_occurrence_facility_allocations_org_space_time_idx
  on public.calendar_occurrence_facility_allocations (org_id, space_id, configuration_id, starts_at_utc, is_active);

drop trigger if exists calendar_occurrence_facility_allocations_set_updated_at on public.calendar_occurrence_facility_allocations;
create trigger calendar_occurrence_facility_allocations_set_updated_at before update on public.calendar_occurrence_facility_allocations for each row execute procedure public.set_updated_at();

alter table public.calendar_occurrence_facility_allocations
  drop constraint if exists calendar_occurrence_facility_allocations_no_overlap;

alter table public.calendar_occurrence_facility_allocations
  add constraint calendar_occurrence_facility_allocations_no_overlap
  exclude using gist (
    space_id with =,
    configuration_id with =,
    tstzrange(starts_at_utc, ends_at_utc, '[)') with &&
  )
  where (is_active = true);

create or replace function public.hydrate_calendar_allocation_window()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  occurrence_row record;
  configuration_row record;
begin
  select id, org_id, starts_at_utc, ends_at_utc, status
  into occurrence_row
  from public.calendar_occurrences occurrence
  where occurrence.id = new.occurrence_id
  limit 1;

  if occurrence_row.id is null then
    raise exception 'CALENDAR_OCCURRENCE_NOT_FOUND';
  end if;

  select id, org_id, space_id
  into configuration_row
  from public.facility_space_configurations configuration
  where configuration.id = new.configuration_id
  limit 1;

  if configuration_row.id is null then
    raise exception 'FACILITY_CONFIGURATION_NOT_FOUND';
  end if;

  if new.space_id <> configuration_row.space_id then
    raise exception 'FACILITY_CONFIGURATION_SPACE_MISMATCH';
  end if;

  if new.org_id is null then
    new.org_id = occurrence_row.org_id;
  end if;

  if new.org_id <> occurrence_row.org_id or new.org_id <> configuration_row.org_id then
    raise exception 'CALENDAR_ALLOCATION_ORG_MISMATCH';
  end if;

  new.starts_at_utc = occurrence_row.starts_at_utc;
  new.ends_at_utc = occurrence_row.ends_at_utc;
  new.is_active = occurrence_row.status = 'scheduled';

  return new;
end;
$$;

drop trigger if exists calendar_occurrence_facility_allocations_hydrate_window on public.calendar_occurrence_facility_allocations;
create trigger calendar_occurrence_facility_allocations_hydrate_window
  before insert or update on public.calendar_occurrence_facility_allocations
  for each row
  execute procedure public.hydrate_calendar_allocation_window();

create or replace function public.sync_calendar_allocation_window_from_occurrence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.calendar_occurrence_facility_allocations allocation
  set
    starts_at_utc = new.starts_at_utc,
    ends_at_utc = new.ends_at_utc,
    is_active = new.status = 'scheduled',
    updated_at = now()
  where allocation.occurrence_id = new.id;

  return new;
end;
$$;

drop trigger if exists calendar_occurrences_sync_allocations on public.calendar_occurrences;
create trigger calendar_occurrences_sync_allocations
  after update of starts_at_utc, ends_at_utc, status on public.calendar_occurrences
  for each row
  execute procedure public.sync_calendar_allocation_window_from_occurrence();

create table if not exists public.calendar_occurrence_teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  occurrence_id uuid not null references public.calendar_occurrences(id) on delete cascade,
  team_id uuid not null references public.program_teams(id) on delete cascade,
  role text not null check (role in ('host', 'participant')),
  invite_status text not null default 'accepted' check (invite_status in ('accepted', 'pending', 'declined', 'left')),
  invited_by_user_id uuid references auth.users(id) on delete set null,
  invited_at timestamptz,
  responded_by_user_id uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (occurrence_id, team_id)
);

create unique index if not exists calendar_occurrence_teams_host_unique_idx
  on public.calendar_occurrence_teams (occurrence_id)
  where role = 'host' and invite_status = 'accepted';

create index if not exists calendar_occurrence_teams_team_idx on public.calendar_occurrence_teams (team_id, occurrence_id, invite_status);

drop trigger if exists calendar_occurrence_teams_set_updated_at on public.calendar_occurrence_teams;
create trigger calendar_occurrence_teams_set_updated_at before update on public.calendar_occurrence_teams for each row execute procedure public.set_updated_at();

create table if not exists public.org_user_inbox_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null,
  title text not null,
  body text,
  href text,
  payload_json jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  read_at timestamptz,
  is_archived boolean not null default false,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists org_user_inbox_items_recipient_created_idx on public.org_user_inbox_items (recipient_user_id, created_at desc);
create index if not exists org_user_inbox_items_org_created_idx on public.org_user_inbox_items (org_id, created_at desc);

create or replace function public.has_team_calendar_write(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with team as (
    select team.id, team.org_id
    from public.program_teams team
    where team.id = target_team_id
    limit 1
  )
  select exists (
    select 1
    from team
    where public.has_org_permission(team.org_id, 'calendar.write')
      or public.has_org_permission(team.org_id, 'programs.write')
      or public.has_org_permission(team.org_id, 'org.manage.read')
      or exists (
        select 1
        from public.program_team_staff staff
        where staff.team_id = team.id
          and staff.user_id = auth.uid()
          and staff.role in ('head_coach', 'assistant_coach', 'manager')
      )
  );
$$;

create or replace function public.has_calendar_entry_write(target_entry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with entry as (
    select e.id, e.org_id, e.host_team_id
    from public.calendar_entries e
    where e.id = target_entry_id
    limit 1
  )
  select exists (
    select 1
    from entry
    where public.has_org_permission(entry.org_id, 'calendar.write')
      or (entry.host_team_id is not null and public.has_team_calendar_write(entry.host_team_id))
  );
$$;

alter table public.facility_spaces enable row level security;
alter table public.facility_reservation_rules enable row level security;
alter table public.facility_reservations enable row level security;
alter table public.facility_reservation_exceptions enable row level security;
alter table public.calendar_entries enable row level security;
alter table public.calendar_rules enable row level security;
alter table public.calendar_occurrences enable row level security;
alter table public.calendar_rule_exceptions enable row level security;
alter table public.facility_space_configurations enable row level security;
alter table public.calendar_occurrence_facility_allocations enable row level security;
alter table public.calendar_occurrence_teams enable row level security;
alter table public.org_user_inbox_items enable row level security;

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

drop policy if exists calendar_entries_select on public.calendar_entries;
create policy calendar_entries_select on public.calendar_entries
  for select
  using (
    public.has_org_permission(org_id, 'calendar.read')
    or public.has_org_permission(org_id, 'calendar.write')
    or (host_team_id is not null and public.has_team_calendar_write(host_team_id))
    or (visibility = 'published' and status = 'scheduled')
  );

drop policy if exists calendar_entries_write on public.calendar_entries;
create policy calendar_entries_write on public.calendar_entries
  for all
  using (
    public.has_org_permission(org_id, 'calendar.write')
    or (host_team_id is not null and public.has_team_calendar_write(host_team_id))
  )
  with check (
    public.has_org_permission(org_id, 'calendar.write')
    or (host_team_id is not null and public.has_team_calendar_write(host_team_id))
  );

drop policy if exists calendar_rules_select on public.calendar_rules;
create policy calendar_rules_select on public.calendar_rules
  for select
  using (
    public.has_org_permission(org_id, 'calendar.read')
    or public.has_org_permission(org_id, 'calendar.write')
    or public.has_calendar_entry_write(entry_id)
  );

drop policy if exists calendar_rules_write on public.calendar_rules;
create policy calendar_rules_write on public.calendar_rules
  for all
  using (public.has_calendar_entry_write(entry_id))
  with check (public.has_calendar_entry_write(entry_id));

drop policy if exists calendar_occurrences_select on public.calendar_occurrences;
create policy calendar_occurrences_select on public.calendar_occurrences
  for select
  using (
    public.has_org_permission(org_id, 'calendar.read')
    or public.has_org_permission(org_id, 'calendar.write')
    or public.has_calendar_entry_write(entry_id)
    or exists (
      select 1
      from public.calendar_entries entry
      where entry.id = calendar_occurrences.entry_id
        and entry.visibility = 'published'
        and entry.status = 'scheduled'
        and entry.entry_type in ('event', 'game')
    )
  );

drop policy if exists calendar_occurrences_write on public.calendar_occurrences;
create policy calendar_occurrences_write on public.calendar_occurrences
  for all
  using (public.has_calendar_entry_write(entry_id))
  with check (public.has_calendar_entry_write(entry_id));

drop policy if exists calendar_rule_exceptions_select on public.calendar_rule_exceptions;
create policy calendar_rule_exceptions_select on public.calendar_rule_exceptions
  for select
  using (
    public.has_org_permission(org_id, 'calendar.read')
    or public.has_org_permission(org_id, 'calendar.write')
    or exists (
      select 1
      from public.calendar_rules rule
      where rule.id = calendar_rule_exceptions.rule_id
        and public.has_calendar_entry_write(rule.entry_id)
    )
  );

drop policy if exists calendar_rule_exceptions_write on public.calendar_rule_exceptions;
create policy calendar_rule_exceptions_write on public.calendar_rule_exceptions
  for all
  using (
    exists (
      select 1
      from public.calendar_rules rule
      where rule.id = calendar_rule_exceptions.rule_id
        and public.has_calendar_entry_write(rule.entry_id)
    )
  )
  with check (
    exists (
      select 1
      from public.calendar_rules rule
      where rule.id = calendar_rule_exceptions.rule_id
        and public.has_calendar_entry_write(rule.entry_id)
    )
  );

drop policy if exists facility_space_configurations_select on public.facility_space_configurations;
create policy facility_space_configurations_select on public.facility_space_configurations
  for select
  using (
    public.has_org_permission(org_id, 'facilities.read')
    or public.has_org_permission(org_id, 'facilities.write')
    or public.has_org_permission(org_id, 'calendar.read')
    or public.has_org_permission(org_id, 'calendar.write')
  );

drop policy if exists facility_space_configurations_write on public.facility_space_configurations;
create policy facility_space_configurations_write on public.facility_space_configurations
  for all
  using (
    public.has_org_permission(org_id, 'facilities.write')
    or public.has_org_permission(org_id, 'calendar.write')
  )
  with check (
    public.has_org_permission(org_id, 'facilities.write')
    or public.has_org_permission(org_id, 'calendar.write')
  );

drop policy if exists calendar_occurrence_facility_allocations_select on public.calendar_occurrence_facility_allocations;
create policy calendar_occurrence_facility_allocations_select on public.calendar_occurrence_facility_allocations
  for select
  using (
    public.has_org_permission(org_id, 'calendar.read')
    or public.has_org_permission(org_id, 'calendar.write')
    or exists (
      select 1
      from public.calendar_occurrences occurrence
      where occurrence.id = calendar_occurrence_facility_allocations.occurrence_id
        and public.has_calendar_entry_write(occurrence.entry_id)
    )
    or exists (
      select 1
      from public.calendar_occurrences occurrence
      join public.calendar_entries entry on entry.id = occurrence.entry_id
      where occurrence.id = calendar_occurrence_facility_allocations.occurrence_id
        and entry.visibility = 'published'
        and entry.status = 'scheduled'
        and entry.entry_type in ('event', 'game')
    )
  );

drop policy if exists calendar_occurrence_facility_allocations_write on public.calendar_occurrence_facility_allocations;
create policy calendar_occurrence_facility_allocations_write on public.calendar_occurrence_facility_allocations
  for all
  using (
    exists (
      select 1
      from public.calendar_occurrences occurrence
      where occurrence.id = calendar_occurrence_facility_allocations.occurrence_id
        and public.has_calendar_entry_write(occurrence.entry_id)
    )
  )
  with check (
    exists (
      select 1
      from public.calendar_occurrences occurrence
      where occurrence.id = calendar_occurrence_facility_allocations.occurrence_id
        and public.has_calendar_entry_write(occurrence.entry_id)
    )
  );

drop policy if exists calendar_occurrence_teams_select on public.calendar_occurrence_teams;
create policy calendar_occurrence_teams_select on public.calendar_occurrence_teams
  for select
  using (
    public.has_org_permission(org_id, 'calendar.read')
    or public.has_org_permission(org_id, 'calendar.write')
    or public.has_team_calendar_write(team_id)
    or exists (
      select 1
      from public.calendar_occurrences occurrence
      where occurrence.id = calendar_occurrence_teams.occurrence_id
        and public.has_calendar_entry_write(occurrence.entry_id)
    )
  );

drop policy if exists calendar_occurrence_teams_write on public.calendar_occurrence_teams;
create policy calendar_occurrence_teams_write on public.calendar_occurrence_teams
  for all
  using (
    public.has_team_calendar_write(team_id)
    or exists (
      select 1
      from public.calendar_occurrences occurrence
      where occurrence.id = calendar_occurrence_teams.occurrence_id
        and public.has_calendar_entry_write(occurrence.entry_id)
    )
  )
  with check (
    public.has_team_calendar_write(team_id)
    or exists (
      select 1
      from public.calendar_occurrences occurrence
      where occurrence.id = calendar_occurrence_teams.occurrence_id
        and public.has_calendar_entry_write(occurrence.entry_id)
    )
  );

drop policy if exists org_user_inbox_items_select on public.org_user_inbox_items;
create policy org_user_inbox_items_select on public.org_user_inbox_items
  for select
  using (
    recipient_user_id = auth.uid()
    or public.has_org_permission(org_id, 'calendar.write')
    or public.has_org_permission(org_id, 'programs.write')
  );

drop policy if exists org_user_inbox_items_insert on public.org_user_inbox_items;
create policy org_user_inbox_items_insert on public.org_user_inbox_items
  for insert
  with check (
    public.has_org_permission(org_id, 'calendar.write')
    or public.has_org_permission(org_id, 'programs.write')
    or exists (
      select 1
      from public.program_teams team
      join public.program_team_staff staff on staff.team_id = team.id
      where team.org_id = org_user_inbox_items.org_id
        and staff.user_id = auth.uid()
        and staff.role in ('head_coach', 'assistant_coach', 'manager')
    )
  );

drop policy if exists org_user_inbox_items_update on public.org_user_inbox_items;
create policy org_user_inbox_items_update on public.org_user_inbox_items
  for update
  using (
    recipient_user_id = auth.uid()
    or public.has_org_permission(org_id, 'calendar.write')
    or public.has_org_permission(org_id, 'programs.write')
  )
  with check (
    recipient_user_id = auth.uid()
    or public.has_org_permission(org_id, 'calendar.write')
    or public.has_org_permission(org_id, 'programs.write')
  );

commit;
/*test