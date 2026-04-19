begin;

create table if not exists public.org_space_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  key text not null,
  label text not null,
  description text,
  visual_mode text not null default 'none' check (visual_mode in ('floorplan', 'map', 'none')),
  default_bookable boolean not null default true,
  default_conflict_mode text not null default 'inherit_block' check (default_conflict_mode in ('inherit_block', 'independent')),
  is_system boolean not null default false,
  sort_index integer not null default 0,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key)
);

create index if not exists org_space_types_org_idx on public.org_space_types (org_id, sort_index, created_at);

drop trigger if exists org_space_types_set_updated_at on public.org_space_types;
create trigger org_space_types_set_updated_at before update on public.org_space_types for each row execute procedure public.set_updated_at();

create or replace function public.seed_org_space_types(target_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_org_id is null then
    return;
  end if;

  insert into public.org_space_types (
    org_id,
    key,
    label,
    description,
    visual_mode,
    default_bookable,
    default_conflict_mode,
    is_system,
    sort_index
  )
  values
    (target_org_id, 'building', 'Building', 'Indoor building container.', 'floorplan', false, 'inherit_block', true, 10),
    (target_org_id, 'campus', 'Campus', 'Multi-structure site container.', 'map', false, 'inherit_block', true, 20),
    (target_org_id, 'park', 'Public Park', 'Outdoor public park or rec site.', 'map', false, 'inherit_block', true, 30),
    (target_org_id, 'rink', 'Rink', 'Ice or inline rink area.', 'map', true, 'inherit_block', true, 40),
    (target_org_id, 'meeting_venue', 'Meeting Venue', 'Board/committee meeting venue.', 'none', true, 'inherit_block', true, 50),
    (target_org_id, 'floor', 'Floor', 'Indoor floor level.', 'floorplan', false, 'inherit_block', true, 60),
    (target_org_id, 'room', 'Room', 'Bookable room.', 'none', true, 'inherit_block', true, 70),
    (target_org_id, 'field', 'Field', 'Field of play.', 'map', true, 'inherit_block', true, 80),
    (target_org_id, 'court', 'Court', 'Court of play.', 'map', true, 'inherit_block', true, 90),
    (target_org_id, 'zone', 'Zone', 'Sub-area or zone.', 'map', true, 'inherit_block', true, 100),
    (target_org_id, 'custom', 'Custom', 'Organization-defined custom type.', 'none', true, 'inherit_block', true, 110)
  on conflict (org_id, key) do update
    set
      label = excluded.label,
      description = excluded.description,
      visual_mode = excluded.visual_mode,
      default_bookable = excluded.default_bookable,
      default_conflict_mode = excluded.default_conflict_mode,
      is_system = excluded.is_system,
      sort_index = excluded.sort_index;
end;
$$;

select public.seed_org_space_types(org.id) from public.orgs org;

create or replace function public.on_org_created_seed_space_types()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_org_space_types(new.id);
  return new;
end;
$$;

drop trigger if exists orgs_seed_space_types on public.orgs;
create trigger orgs_seed_space_types
  after insert on public.orgs
  for each row
  execute procedure public.on_org_created_seed_space_types();

-- Compatibility guard for environments where legacy facilities tables were removed
-- before this migration was recorded. These stubs allow out-of-order replay and are
-- replaced by the next visual reset migration.
create table if not exists public.facility_spaces (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  parent_space_id uuid references public.facility_spaces(id) on delete set null,
  name text not null default 'Legacy Space',
  slug text not null default 'legacy-space',
  space_kind text not null default 'custom',
  status text not null default 'open',
  is_bookable boolean not null default true,
  timezone text not null default 'UTC',
  capacity integer,
  status_labels_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  geometry_json jsonb not null default '{}'::jsonb,
  floorplan_json jsonb not null default '{}'::jsonb,
  sort_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.facility_reservation_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.facility_reservations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.facility_reservation_exceptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.facility_space_configurations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calendar_occurrence_facility_allocations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  occurrence_id uuid,
  space_id uuid,
  configuration_id uuid,
  starts_at_utc timestamptz not null default now(),
  ends_at_utc timestamptz not null default now() + interval '1 hour',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.facility_spaces
  add column if not exists space_type_key text,
  add column if not exists structural_role text,
  add column if not exists conflict_mode text,
  add column if not exists geometry_kind text,
  add column if not exists geometry_json jsonb not null default '{}'::jsonb,
  add column if not exists floorplan_json jsonb not null default '{}'::jsonb;

update public.facility_spaces
set
  space_type_key = coalesce(
    space_type_key,
    case space_kind
      when 'building' then 'building'
      when 'floor' then 'floor'
      when 'room' then 'room'
      when 'field' then 'field'
      when 'court' then 'court'
      else 'custom'
    end
  ),
  structural_role = coalesce(
    structural_role,
    case space_kind
      when 'building' then 'site'
      when 'floor' then 'level'
      when 'room' then 'space'
      when 'field' then 'area'
      when 'court' then 'area'
      else 'space'
    end
  ),
  conflict_mode = coalesce(conflict_mode, 'inherit_block'),
  floorplan_json = case
    when floorplan_json = '{}'::jsonb then coalesce(metadata_json -> 'floorPlan', '{}'::jsonb)
    else floorplan_json
  end;

-- Convert legacy point geometry into canonical polygon payloads.
update public.facility_spaces
set
  geometry_kind = 'polygon',
  geometry_json = jsonb_build_object(
    'coordinateSpace',
    'geospatial',
    'path',
    jsonb_build_array(geometry_json -> 'point'),
    'closed',
    false
  )
where geometry_kind = 'point'
  and jsonb_typeof(geometry_json -> 'point') = 'object';

-- Convert legacy floor plan placement to canonical rect geometry.
update public.facility_spaces
set
  geometry_kind = 'rect',
  geometry_json = jsonb_build_object(
    'coordinateSpace',
    'planar',
    'x',
    round((floorplan_json ->> 'x')::numeric),
    'y',
    round((floorplan_json ->> 'y')::numeric),
    'width',
    greatest(75, round((floorplan_json ->> 'width')::numeric)),
    'height',
    greatest(50, round((floorplan_json ->> 'height')::numeric))
  )
where geometry_kind is null
  and jsonb_typeof(floorplan_json) = 'object'
  and coalesce(floorplan_json ->> 'x', '') ~ '^-?\\d+(\\.\\d+)?$'
  and coalesce(floorplan_json ->> 'y', '') ~ '^-?\\d+(\\.\\d+)?$'
  and coalesce(floorplan_json ->> 'width', '') ~ '^-?\\d+(\\.\\d+)?$'
  and coalesce(floorplan_json ->> 'height', '') ~ '^-?\\d+(\\.\\d+)?$';

-- Convert legacy parent-level map nodes into real child spaces.
with parent_overlay_nodes as (
  select
    parent.org_id,
    parent.id as parent_space_id,
    parent.slug as parent_slug,
    parent.name as parent_name,
    parent.status,
    parent.is_bookable,
    parent.timezone,
    parent.status_labels_json,
    parent.sort_index as parent_sort_index,
    node.value as node_json,
    node.ordinality as node_index
  from public.facility_spaces parent
  cross join lateral jsonb_array_elements(coalesce(parent.geometry_json -> 'nodes', '[]'::jsonb)) with ordinality as node(value, ordinality)
  where jsonb_typeof(parent.geometry_json -> 'nodes') = 'array'
)
insert into public.facility_spaces (
  org_id,
  parent_space_id,
  name,
  slug,
  space_kind,
  space_type_key,
  structural_role,
  conflict_mode,
  geometry_kind,
  geometry_json,
  floorplan_json,
  status,
  is_bookable,
  timezone,
  capacity,
  metadata_json,
  status_labels_json,
  sort_index
)
select
  overlay.org_id,
  overlay.parent_space_id,
  coalesce(nullif(trim(overlay.node_json ->> 'label'), ''), overlay.parent_name || ' node ' || overlay.node_index::text) as name,
  (
    left(
      regexp_replace(
        lower(coalesce(nullif(trim(overlay.node_json ->> 'label'), ''), overlay.parent_slug || '-node-' || overlay.node_index::text)),
        '[^a-z0-9]+',
        '-',
        'g'
      ),
      96
    ) || '-' || substr(md5(overlay.parent_space_id::text || ':' || overlay.node_index::text), 1, 8)
  ) as slug,
  'custom'::text as space_kind,
  'custom'::text as space_type_key,
  'space'::text as structural_role,
  'inherit_block'::text as conflict_mode,
  'polygon'::text as geometry_kind,
  jsonb_build_object(
    'coordinateSpace',
    'geospatial',
    'path',
    coalesce(overlay.node_json -> 'path', '[]'::jsonb),
    'closed',
    true
  ) as geometry_json,
  '{}'::jsonb as floorplan_json,
  overlay.status,
  coalesce(overlay.is_bookable, true),
  overlay.timezone,
  null::integer as capacity,
  '{}'::jsonb as metadata_json,
  coalesce(overlay.status_labels_json, '{}'::jsonb),
  coalesce(overlay.parent_sort_index, 0) + overlay.node_index::integer
from parent_overlay_nodes overlay
where jsonb_typeof(coalesce(overlay.node_json -> 'path', '[]'::jsonb)) = 'array';

-- Ensure all polygon rows have explicit coordinate space metadata.
update public.facility_spaces
set geometry_json = geometry_json || jsonb_build_object(
  'coordinateSpace',
  case
    when jsonb_typeof(geometry_json -> 'path') = 'array'
      and jsonb_array_length(geometry_json -> 'path') > 0
      and jsonb_typeof((geometry_json -> 'path') -> 0) = 'object'
      and ((geometry_json -> 'path') -> 0 ? 'lat')
      and ((geometry_json -> 'path') -> 0 ? 'lng') then 'geospatial'
    else 'planar'
  end
)
where geometry_kind = 'polygon'
  and not (geometry_json ? 'coordinateSpace');

-- Remove legacy layout payloads after migration to canonical geometry fields.
update public.facility_spaces
set
  geometry_json = geometry_json - 'point' - 'nodes',
  floorplan_json = '{}'::jsonb,
  metadata_json = metadata_json - 'floorPlan';

alter table public.facility_spaces
  alter column space_type_key set not null,
  alter column structural_role set not null,
  alter column conflict_mode set not null;

alter table public.facility_spaces
  drop constraint if exists facility_spaces_space_type_key_fk;

alter table public.facility_spaces
  add constraint facility_spaces_space_type_key_fk
  foreign key (org_id, space_type_key) references public.org_space_types(org_id, key) on update cascade on delete restrict;

alter table public.facility_spaces
  drop constraint if exists facility_spaces_structural_role_check;

alter table public.facility_spaces
  add constraint facility_spaces_structural_role_check
  check (structural_role in ('site', 'level', 'area', 'space', 'zone'));

alter table public.facility_spaces
  drop constraint if exists facility_spaces_conflict_mode_check;

alter table public.facility_spaces
  add constraint facility_spaces_conflict_mode_check
  check (conflict_mode in ('inherit_block', 'independent'));

alter table public.facility_spaces
  drop constraint if exists facility_spaces_geometry_kind_check;

alter table public.facility_spaces
  add constraint facility_spaces_geometry_kind_check
  check (geometry_kind is null or geometry_kind in ('rect', 'polygon'));

truncate table
  public.facility_reservation_exceptions,
  public.facility_reservations,
  public.facility_reservation_rules;

update public.org_custom_roles custom_role
set
  permissions = (
    select array_agg(distinct permission order by permission)
    from unnest(
      coalesce(custom_role.permissions, '{}'::text[])
      || case
        when coalesce(custom_role.permissions, '{}'::text[]) && array['facilities.read']::text[] then array['spaces.read']::text[]
        else array[]::text[]
      end
      || case
        when coalesce(custom_role.permissions, '{}'::text[]) && array['facilities.write']::text[] then array['spaces.write']::text[]
        else array[]::text[]
      end
    ) as permission
  ),
  updated_at = now()
where coalesce(custom_role.permissions, '{}'::text[]) && array['facilities.read', 'facilities.write', 'spaces.read', 'spaces.write']::text[];

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
          'calendar.read',
          'calendar.write',
          'facilities.read',
          'facilities.write',
          'spaces.read',
          'spaces.write',
          'communications.read',
          'communications.write'
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
      or public.has_org_permission(target_org_id, 'facilities.write')
      or public.has_org_permission(target_org_id, 'spaces.write')
      or public.has_org_permission(target_org_id, 'communications.write')
    )
    else false
  end;
$$;

drop policy if exists facility_spaces_select on public.facility_spaces;
create policy facility_spaces_select on public.facility_spaces
  for select
  using (
    public.has_org_permission(org_id, 'spaces.read')
    or public.has_org_permission(org_id, 'spaces.write')
    or (
      status in ('open', 'closed')
      and status <> 'archived'
    )
  );

drop policy if exists facility_spaces_write on public.facility_spaces;
create policy facility_spaces_write on public.facility_spaces
  for all
  using (public.has_org_permission(org_id, 'spaces.write'))
  with check (public.has_org_permission(org_id, 'spaces.write'));

drop policy if exists facility_reservation_rules_select on public.facility_reservation_rules;
create policy facility_reservation_rules_select on public.facility_reservation_rules
  for select
  using (
    public.has_org_permission(org_id, 'spaces.read')
    or public.has_org_permission(org_id, 'spaces.write')
  );

drop policy if exists facility_reservation_rules_write on public.facility_reservation_rules;
create policy facility_reservation_rules_write on public.facility_reservation_rules
  for all
  using (public.has_org_permission(org_id, 'spaces.write'))
  with check (public.has_org_permission(org_id, 'spaces.write'));

drop policy if exists facility_reservations_select on public.facility_reservations;
create policy facility_reservations_select on public.facility_reservations
  for select
  using (
    public.has_org_permission(org_id, 'spaces.read')
    or public.has_org_permission(org_id, 'spaces.write')
  );

drop policy if exists facility_reservations_write on public.facility_reservations;
create policy facility_reservations_write on public.facility_reservations
  for all
  using (public.has_org_permission(org_id, 'spaces.write'))
  with check (public.has_org_permission(org_id, 'spaces.write'));

drop policy if exists facility_reservation_exceptions_select on public.facility_reservation_exceptions;
create policy facility_reservation_exceptions_select on public.facility_reservation_exceptions
  for select
  using (
    public.has_org_permission(org_id, 'spaces.read')
    or public.has_org_permission(org_id, 'spaces.write')
  );

drop policy if exists facility_reservation_exceptions_write on public.facility_reservation_exceptions;
create policy facility_reservation_exceptions_write on public.facility_reservation_exceptions
  for all
  using (public.has_org_permission(org_id, 'spaces.write'))
  with check (public.has_org_permission(org_id, 'spaces.write'));

drop policy if exists facility_space_configurations_select on public.facility_space_configurations;
create policy facility_space_configurations_select on public.facility_space_configurations
  for select
  using (
    public.has_org_permission(org_id, 'spaces.read')
    or public.has_org_permission(org_id, 'spaces.write')
    or public.has_org_permission(org_id, 'calendar.read')
    or public.has_org_permission(org_id, 'calendar.write')
  );

drop policy if exists facility_space_configurations_write on public.facility_space_configurations;
create policy facility_space_configurations_write on public.facility_space_configurations
  for all
  using (
    public.has_org_permission(org_id, 'spaces.write')
    or public.has_org_permission(org_id, 'calendar.write')
  )
  with check (
    public.has_org_permission(org_id, 'spaces.write')
    or public.has_org_permission(org_id, 'calendar.write')
  );

create or replace function public.space_is_ancestor(target_org_id uuid, ancestor_space_id uuid, descendant_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive lineage as (
    select child.id, child.parent_space_id
    from public.facility_spaces child
    where child.org_id = target_org_id
      and child.id = descendant_space_id
    union all
    select parent.id, parent.parent_space_id
    from public.facility_spaces parent
    join lineage on lineage.parent_space_id = parent.id
    where parent.org_id = target_org_id
  )
  select exists (
    select 1
    from lineage
    where id = ancestor_space_id
      and ancestor_space_id <> descendant_space_id
  );
$$;

create or replace function public.ensure_calendar_allocation_hierarchy_conflicts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_space public.facility_spaces%rowtype;
  conflicting_allocation_id uuid;
begin
  if new.is_active = false then
    return new;
  end if;

  select *
  into next_space
  from public.facility_spaces space
  where space.id = new.space_id
    and space.org_id = new.org_id
  limit 1;

  if next_space.id is null then
    raise exception 'FACILITY_SPACE_NOT_FOUND';
  end if;

  select allocation.id
  into conflicting_allocation_id
  from public.calendar_occurrence_facility_allocations allocation
  join public.facility_spaces existing_space
    on existing_space.id = allocation.space_id
   and existing_space.org_id = allocation.org_id
  where allocation.org_id = new.org_id
    and allocation.is_active = true
    and allocation.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    and tstzrange(allocation.starts_at_utc, allocation.ends_at_utc, '[)') && tstzrange(new.starts_at_utc, new.ends_at_utc, '[)')
    and (
      (
        allocation.space_id = new.space_id
        and allocation.configuration_id = new.configuration_id
      )
      or (
        (next_space.conflict_mode = 'inherit_block' or existing_space.conflict_mode = 'inherit_block')
        and (
          public.space_is_ancestor(new.org_id, new.space_id, allocation.space_id)
          or public.space_is_ancestor(new.org_id, allocation.space_id, new.space_id)
        )
      )
    )
  limit 1;

  if conflicting_allocation_id is not null then
    raise exception 'CALENDAR_OCCURRENCE_FACILITY_ALLOCATIONS_HIERARCHY_CONFLICT';
  end if;

  return new;
end;
$$;

drop trigger if exists calendar_occurrence_facility_allocations_hierarchy_conflicts on public.calendar_occurrence_facility_allocations;
create trigger calendar_occurrence_facility_allocations_hierarchy_conflicts
  before insert or update on public.calendar_occurrence_facility_allocations
  for each row
  execute procedure public.ensure_calendar_allocation_hierarchy_conflicts();

alter table public.org_space_types enable row level security;

drop policy if exists org_space_types_select on public.org_space_types;
create policy org_space_types_select on public.org_space_types
  for select
  using (
    public.has_org_permission(org_id, 'spaces.read')
    or public.has_org_permission(org_id, 'spaces.write')
  );

drop policy if exists org_space_types_write on public.org_space_types;
create policy org_space_types_write on public.org_space_types
  for all
  using (public.has_org_permission(org_id, 'spaces.write'))
  with check (public.has_org_permission(org_id, 'spaces.write'));

commit;
