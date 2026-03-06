begin;

create extension if not exists btree_gist;

update public.org_custom_roles custom_role
set
  permissions = (
    select array_agg(distinct permission order by permission)
    from unnest(
      coalesce(custom_role.permissions, '{}'::text[])
      || array['calendar.read', 'calendar.write']::text[]
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
          'events.write',
          'facilities.read',
          'facilities.write',
          'calendar.read',
          'calendar.write'
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
      or public.has_org_permission(target_org_id, 'calendar.write')
    )
    else false
  end;
$$;

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

alter table public.calendar_entries enable row level security;
alter table public.calendar_rules enable row level security;
alter table public.calendar_occurrences enable row level security;
alter table public.calendar_rule_exceptions enable row level security;
alter table public.facility_space_configurations enable row level security;
alter table public.calendar_occurrence_facility_allocations enable row level security;
alter table public.calendar_occurrence_teams enable row level security;
alter table public.org_user_inbox_items enable row level security;

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
