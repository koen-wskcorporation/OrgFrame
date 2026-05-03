-- Split facilities into their own table.
--
-- Until now, top-level facilities (parent_space_id IS NULL) lived in
-- `facilities.spaces` alongside the spaces inside them. That conflated
-- two genuinely different concepts:
--   * a Facility is a real-world venue (org-customizable status defs,
--     geo anchor for the satellite layer, environment, etc.)
--   * a Space is a shape on a Facility's map (status, polygon, etc.)
--
-- This migration:
--   1. Creates `facilities.facilities` with facility-specific columns.
--   2. Adds `facility_id` to `facilities.spaces`.
--   3. Copies every top-level `spaces` row into `facilities.facilities`
--      with the same id, then back-fills `facility_id` on every space
--      from its root ancestor.
--   4. Deletes the top-level rows from `facilities.spaces`.
--   5. Switches the unique slug constraint on `spaces` to be scoped by
--      facility (so two facilities can each have a "field-1") and
--      enforces facility-scoped slugs on `facilities.facilities`.

begin;

create schema if not exists facilities;

-- 1) New facilities table.
create table if not exists facilities.facilities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  name text not null,
  slug text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  timezone text not null default 'UTC',
  /** Indoor facilities render on the design grid only; outdoor enables the satellite layer. */
  environment text not null default 'outdoor' check (environment in ('indoor', 'outdoor')),
  /** Lat/lng anchor used as canvas (0,0) when the satellite layer is on. */
  geo_anchor_lat double precision null,
  geo_anchor_lng double precision null,
  geo_address text null,
  geo_show_map boolean not null default false,
  metadata_json jsonb not null default '{}'::jsonb,
  sort_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug)
);

create index if not exists facilities_org_idx on facilities.facilities (org_id, sort_index, created_at);

-- 2) Add facility_id to spaces.
alter table facilities.spaces
  add column if not exists facility_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'spaces_facility_id_fkey'
      and conrelid = 'facilities.spaces'::regclass
  ) then
    alter table facilities.spaces
      add constraint spaces_facility_id_fkey
      foreign key (facility_id) references facilities.facilities(id) on delete cascade;
  end if;
end
$$;

-- 3a) Promote every top-level space into a facility row (same id).
insert into facilities.facilities (
  id, org_id, name, slug, status, timezone, environment,
  geo_anchor_lat, geo_anchor_lng, geo_address, geo_show_map,
  metadata_json, sort_index, created_at, updated_at
)
select
  s.id,
  s.org_id,
  s.name,
  s.slug,
  case when s.status = 'archived' then 'archived' else 'active' end,
  s.timezone,
  case when (s.metadata_json->>'environment') = 'indoor' then 'indoor' else 'outdoor' end,
  case when (s.metadata_json->>'geoAnchorLat') ~ '^-?[0-9]+(\.[0-9]+)?$'
       then (s.metadata_json->>'geoAnchorLat')::double precision else null end,
  case when (s.metadata_json->>'geoAnchorLng') ~ '^-?[0-9]+(\.[0-9]+)?$'
       then (s.metadata_json->>'geoAnchorLng')::double precision else null end,
  s.metadata_json->>'geoAddress',
  coalesce((s.metadata_json->>'geoShowMap')::boolean, false),
  s.metadata_json - 'environment' - 'geoAnchorLat' - 'geoAnchorLng' - 'geoAddress' - 'geoShowMap',
  s.sort_index,
  s.created_at,
  s.updated_at
from facilities.spaces s
where s.parent_space_id is null
on conflict (id) do nothing;

-- 3b) Backfill facility_id on every non-top-level space by walking up
-- to its root ancestor. Recursive CTE seeded by top-level rows.
with recursive tree as (
  select id, parent_space_id, id as root_id
  from facilities.spaces
  where parent_space_id is null
  union all
  select s.id, s.parent_space_id, t.root_id
  from facilities.spaces s
  join tree t on s.parent_space_id = t.id
)
update facilities.spaces s
set facility_id = t.root_id
from tree t
where s.id = t.id
  and s.parent_space_id is not null
  and s.facility_id is null;

-- 4) Drop the top-level rows from spaces — they live in facilities now.
-- The FK on facility_map_nodes uses on-delete-cascade against spaces, so
-- nodes pointing at top-level "facilities" go too (they were never valid
-- shapes on a canvas anyway).
delete from facilities.spaces where parent_space_id is null;

-- 4b) Drop any orphan spaces whose parent chain never reached a top-level
-- row (parent_space_id pointed at something that no longer exists, or
-- formed a cycle). They could not be associated with a facility, and we
-- can't enforce the NOT NULL below until they're gone.
delete from facilities.spaces where facility_id is null;

-- 5) Make facility_id required on spaces from now on.
alter table facilities.spaces
  alter column facility_id set not null;

-- 6) Rework the unique-slug constraint:
--   * facilities.facilities: (org_id, slug) — already unique.
--   * facilities.spaces: was (org_id, slug). Switch to (facility_id, slug)
--     so different facilities can each have a "field-1".
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'spaces_org_id_slug_key'
      and conrelid = 'facilities.spaces'::regclass
  ) then
    alter table facilities.spaces drop constraint spaces_org_id_slug_key;
  end if;
end
$$;

create unique index if not exists spaces_facility_slug_unique
  on facilities.spaces (facility_id, slug);

create index if not exists spaces_facility_idx on facilities.spaces (facility_id, parent_space_id);

commit;
