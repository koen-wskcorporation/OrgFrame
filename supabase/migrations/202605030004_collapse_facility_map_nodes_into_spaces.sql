-- Collapse `facility_map_nodes` into `spaces`.
--
-- Every space has exactly one polygon on its facility's canvas, forever
-- (1:1 by design — there is no use case for two map shapes per space).
-- Modeling that as a separate table created an entire class of bugs:
-- duplicate rows for the same space_id, FK races on optimistic create,
-- a "seeder" that inserted defaults whenever the join was missing, and
-- ON CONFLICT logic that depended on a UNIQUE constraint that was sometimes
-- present and sometimes not.
--
-- After this migration:
--   - `facilities.spaces.map_points_json` holds the polygon vertices
--     (jsonb array of {x, y, smooth?: bool}). NULL = "not yet placed."
--   - `facilities.spaces.map_z_index`     holds layering order. Defaults
--     to the space's `sort_index` if NULL.
--   - `facility_map_nodes` is dropped, along with all its triggers,
--     functions, indexes, and the validation function it shipped with.
--
-- Geometry bounds, corner_radius, and node-status (which always mirrored
-- the space's status) are NOT persisted — they are derived at read time
-- from points and the parent space.

begin;

-- 1. New columns on spaces. Both nullable: NULL means "no map shape yet."
alter table facilities.spaces
  add column if not exists map_points_json jsonb,
  add column if not exists map_z_index integer;

-- 2. Validation: when set, points must be a JSON array of >=3 vertices,
--    each an object with numeric `x` and `y`. Mirrors the old
--    `is_valid_map_points` function the dropped table used.
create or replace function facilities.is_valid_map_points(points jsonb)
returns boolean
language sql
immutable
as $$
  select
    jsonb_typeof(points) = 'array'
    and jsonb_array_length(points) >= 3
    and not exists (
      select 1
      from jsonb_array_elements(points) as point
      where jsonb_typeof(point) <> 'object'
        or jsonb_typeof(point -> 'x') <> 'number'
        or jsonb_typeof(point -> 'y') <> 'number'
    );
$$;

alter table facilities.spaces
  drop constraint if exists spaces_map_points_valid;
alter table facilities.spaces
  add constraint spaces_map_points_valid
  check (map_points_json is null or facilities.is_valid_map_points(map_points_json));

-- 3. Migrate existing geometry: for every space that has at least one
--    facility_map_nodes row, take the most recently updated row's points
--    and z_index. (`facility_map_nodes` is being dropped, so we only need
--    the winning row.)
do $$
begin
  if to_regclass('facilities.facility_map_nodes') is not null then
    with ranked as (
      select
        space_id,
        points_json,
        z_index,
        row_number() over (
          partition by space_id
          order by updated_at desc, created_at desc, id
        ) as rn
      from facilities.facility_map_nodes
    ),
    winning as (
      select space_id, points_json, z_index
      from ranked
      where rn = 1
    )
    update facilities.spaces s
       set map_points_json = w.points_json,
           map_z_index    = w.z_index
      from winning w
     where w.space_id = s.id;
  end if;
end
$$;

-- 4. Drop the old table and everything tied to it.
drop table if exists facilities.facility_map_nodes cascade;
drop function if exists facilities.normalize_facility_map_node() cascade;

commit;
