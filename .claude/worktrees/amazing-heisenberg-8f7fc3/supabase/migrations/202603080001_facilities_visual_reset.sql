begin;

create extension if not exists btree_gist;

-- Remove legacy facilities allocation triggers/functions before table replacement.
drop trigger if exists calendar_occurrence_facility_allocations_hierarchy_conflicts on public.calendar_occurrence_facility_allocations;
drop trigger if exists calendar_occurrence_facility_allocations_hydrate_window on public.calendar_occurrence_facility_allocations;
drop trigger if exists calendar_occurrence_facility_allocations_set_updated_at on public.calendar_occurrence_facility_allocations;
drop trigger if exists calendar_occurrences_sync_allocations on public.calendar_occurrences;
drop trigger if exists calendar_occurrences_sync_facility_allocation_window on public.calendar_occurrences;
drop function if exists public.ensure_calendar_allocation_hierarchy_conflicts();
drop function if exists public.hydrate_calendar_allocation_window();
drop function if exists public.sync_calendar_allocation_window_from_occurrence();
drop function if exists public.space_is_ancestor(uuid, uuid, uuid);

drop table if exists public.calendar_occurrence_facility_allocations cascade;
drop table if exists public.facility_space_configurations cascade;
drop table if exists public.facility_reservation_exceptions cascade;
drop table if exists public.facility_reservations cascade;
drop table if exists public.facility_reservation_rules cascade;
drop table if exists public.facility_spaces cascade;
drop table if exists public.facility_nodes cascade;
drop table if exists public.facilities cascade;

create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null,
  slug text not null,
  facility_type text not null default 'complex' check (
    facility_type in ('park', 'complex', 'building', 'campus', 'field_cluster', 'gym', 'indoor', 'custom')
  ),
  status text not null default 'open' check (status in ('open', 'closed', 'archived')),
  timezone text not null default 'UTC',
  metadata_json jsonb not null default '{}'::jsonb,
  sort_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug)
);

create index facilities_org_sort_idx on public.facilities (org_id, sort_index, created_at);
create index facilities_org_status_idx on public.facilities (org_id, status, sort_index, created_at);

drop trigger if exists facilities_set_updated_at on public.facilities;
create trigger facilities_set_updated_at before update on public.facilities for each row execute procedure public.set_updated_at();

create table public.facility_nodes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  facility_id uuid not null references public.facilities(id) on delete cascade,
  parent_node_id uuid references public.facility_nodes(id) on delete set null,
  name text not null,
  slug text not null,
  node_kind text not null default 'custom' check (
    node_kind in (
      'facility',
      'zone',
      'building',
      'section',
      'field',
      'court',
      'diamond',
      'rink',
      'room',
      'amenity',
      'parking',
      'support_area',
      'custom'
    )
  ),
  status text not null default 'open' check (status in ('open', 'closed', 'archived')),
  is_bookable boolean not null default true,
  capacity integer check (capacity is null or capacity >= 0),
  layout_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  sort_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (facility_id, slug)
);

create index facility_nodes_org_facility_idx on public.facility_nodes (org_id, facility_id, sort_index, created_at);
create index facility_nodes_parent_idx on public.facility_nodes (parent_node_id);
create index facility_nodes_org_status_idx on public.facility_nodes (org_id, status, sort_index, created_at);

drop trigger if exists facility_nodes_set_updated_at on public.facility_nodes;
create trigger facility_nodes_set_updated_at before update on public.facility_nodes for each row execute procedure public.set_updated_at();

alter table public.program_teams
  drop constraint if exists program_teams_home_facility_id_fkey;

alter table public.program_teams
  add constraint program_teams_home_facility_id_fkey
  foreign key (home_facility_id) references public.facilities(id) on delete set null;

create table public.calendar_occurrence_facility_allocations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  occurrence_id uuid not null references public.calendar_occurrences(id) on delete cascade,
  node_id uuid not null references public.facility_nodes(id) on delete cascade,
  starts_at_utc timestamptz not null,
  ends_at_utc timestamptz not null,
  is_active boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (occurrence_id, node_id),
  constraint calendar_occurrence_facility_allocations_window_valid check (ends_at_utc > starts_at_utc)
);

create index calendar_occurrence_facility_allocations_org_node_time_idx
  on public.calendar_occurrence_facility_allocations (org_id, node_id, starts_at_utc, is_active);

create index calendar_occurrence_facility_allocations_org_occurrence_idx
  on public.calendar_occurrence_facility_allocations (org_id, occurrence_id, is_active);

drop trigger if exists calendar_occurrence_facility_allocations_set_updated_at on public.calendar_occurrence_facility_allocations;
create trigger calendar_occurrence_facility_allocations_set_updated_at
  before update on public.calendar_occurrence_facility_allocations
  for each row execute procedure public.set_updated_at();

create or replace function public.hydrate_calendar_node_allocation_window()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  occurrence_row record;
  node_row record;
begin
  select id, org_id, starts_at_utc, ends_at_utc, status
  into occurrence_row
  from public.calendar_occurrences occurrence
  where occurrence.id = new.occurrence_id
  limit 1;

  if occurrence_row.id is null then
    raise exception 'CALENDAR_OCCURRENCE_NOT_FOUND';
  end if;

  select id, org_id
  into node_row
  from public.facility_nodes node
  where node.id = new.node_id
  limit 1;

  if node_row.id is null then
    raise exception 'FACILITY_NODE_NOT_FOUND';
  end if;

  if new.org_id is null then
    new.org_id = occurrence_row.org_id;
  end if;

  if new.org_id <> occurrence_row.org_id or new.org_id <> node_row.org_id then
    raise exception 'CALENDAR_ALLOCATION_ORG_MISMATCH';
  end if;

  new.starts_at_utc = occurrence_row.starts_at_utc;
  new.ends_at_utc = occurrence_row.ends_at_utc;
  new.is_active = occurrence_row.status = 'scheduled';

  return new;
end;
$$;

create trigger calendar_occurrence_facility_allocations_hydrate_window
  before insert or update on public.calendar_occurrence_facility_allocations
  for each row
  execute procedure public.hydrate_calendar_node_allocation_window();

create or replace function public.sync_calendar_node_allocation_window_from_occurrence()
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
    updated_by = coalesce(new.updated_by, allocation.updated_by)
  where allocation.occurrence_id = new.id;

  return new;
end;
$$;

drop trigger if exists calendar_occurrences_sync_facility_allocation_window on public.calendar_occurrences;
create trigger calendar_occurrences_sync_facility_allocation_window
  after update of starts_at_utc, ends_at_utc, status on public.calendar_occurrences
  for each row
  execute procedure public.sync_calendar_node_allocation_window_from_occurrence();

create or replace function public.facility_node_is_ancestor(target_org_id uuid, ancestor_node_id uuid, descendant_node_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive lineage as (
    select child.id, child.parent_node_id
    from public.facility_nodes child
    where child.org_id = target_org_id
      and child.id = descendant_node_id
    union all
    select parent.id, parent.parent_node_id
    from public.facility_nodes parent
    join lineage on lineage.parent_node_id = parent.id
    where parent.org_id = target_org_id
  )
  select exists (
    select 1
    from lineage
    where id = ancestor_node_id
      and ancestor_node_id <> descendant_node_id
  );
$$;

create or replace function public.ensure_calendar_node_allocation_hierarchy_conflicts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conflicting_allocation_id uuid;
begin
  if new.is_active = false then
    return new;
  end if;

  select allocation.id
  into conflicting_allocation_id
  from public.calendar_occurrence_facility_allocations allocation
  where allocation.org_id = new.org_id
    and allocation.is_active = true
    and allocation.occurrence_id <> new.occurrence_id
    and allocation.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    and tstzrange(allocation.starts_at_utc, allocation.ends_at_utc, '[)') && tstzrange(new.starts_at_utc, new.ends_at_utc, '[)')
    and (
      allocation.node_id = new.node_id
      or public.facility_node_is_ancestor(new.org_id, new.node_id, allocation.node_id)
      or public.facility_node_is_ancestor(new.org_id, allocation.node_id, new.node_id)
    )
  limit 1;

  if conflicting_allocation_id is not null then
    raise exception 'CALENDAR_OCCURRENCE_FACILITY_ALLOCATIONS_HIERARCHY_CONFLICT';
  end if;

  return new;
end;
$$;

create trigger calendar_occurrence_facility_allocations_hierarchy_conflicts
  before insert or update on public.calendar_occurrence_facility_allocations
  for each row
  execute procedure public.ensure_calendar_node_allocation_hierarchy_conflicts();

alter table public.facilities enable row level security;
alter table public.facility_nodes enable row level security;
alter table public.calendar_occurrence_facility_allocations enable row level security;

drop policy if exists facilities_select on public.facilities;
create policy facilities_select on public.facilities
  for select
  using (
    public.has_org_permission(org_id, 'spaces.read')
    or public.has_org_permission(org_id, 'spaces.write')
    or (status in ('open', 'closed'))
  );

drop policy if exists facilities_write on public.facilities;
create policy facilities_write on public.facilities
  for all
  using (public.has_org_permission(org_id, 'spaces.write'))
  with check (public.has_org_permission(org_id, 'spaces.write'));

drop policy if exists facility_nodes_select on public.facility_nodes;
create policy facility_nodes_select on public.facility_nodes
  for select
  using (
    public.has_org_permission(org_id, 'spaces.read')
    or public.has_org_permission(org_id, 'spaces.write')
    or (status in ('open', 'closed'))
  );

drop policy if exists facility_nodes_write on public.facility_nodes;
create policy facility_nodes_write on public.facility_nodes
  for all
  using (public.has_org_permission(org_id, 'spaces.write'))
  with check (public.has_org_permission(org_id, 'spaces.write'));

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

commit;
