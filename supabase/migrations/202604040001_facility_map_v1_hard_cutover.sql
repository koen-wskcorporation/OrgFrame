-- Facility map v1 hard cutover.
-- This migration removes legacy map/canvas persistence and introduces a facility-only map model.

begin;

-- Remove legacy/public compatibility map views when present.
do $$
declare
  target record;
  kind "char";
begin
  for target in
    select *
    from (
      values
        ('public', 'facility_layout_nodes_v1'),
        ('public', 'program_layout_nodes_v1'),
        ('public', 'allocation_layout_nodes_v1'),
        ('public', 'facility_layout_nodes'),
        ('public', 'facility_nodes'),
        ('public', 'program_nodes')
    ) as refs(schema_name, object_name)
  loop
    select c.relkind
    into kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = target.schema_name
      and c.relname = target.object_name
    limit 1;

    if kind in ('v', 'm') then
      execute format('drop view if exists %I.%I', target.schema_name, target.object_name);
    end if;
  end loop;
end
$$;

-- Remove legacy map tables from prior canvas systems.
drop table if exists public.facility_layout_nodes_v1 cascade;
drop table if exists public.program_layout_nodes_v1 cascade;
drop table if exists public.allocation_layout_nodes_v1 cascade;
drop table if exists public.facility_layout_nodes cascade;

-- Remove legacy map helper functions if they exist.
drop function if exists public._canvas_snap(numeric) cascade;
drop function if exists public._canvas_rect_points(numeric, numeric, numeric, numeric) cascade;

-- Drop and recreate trigger/function for deterministic snapping.
do $$
begin
  if to_regclass('facilities.facility_map_nodes') is not null then
    execute 'drop trigger if exists facility_map_nodes_normalize on facilities.facility_map_nodes';
  end if;
end
$$;
drop function if exists facilities.normalize_facility_map_node() cascade;
drop function if exists facilities.is_valid_map_points(jsonb) cascade;

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

create table if not exists facilities.facility_map_nodes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  space_id uuid not null,
  parent_space_id uuid null,
  shape_type text not null check (shape_type in ('rectangle', 'polygon')),
  points_json jsonb not null,
  x numeric not null,
  y numeric not null,
  width numeric not null,
  height numeric not null,
  z_index integer not null default 1,
  corner_radius numeric not null default 12,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, space_id),
  check (width >= 24 and height >= 24),
  check (corner_radius = 12),
  check (facilities.is_valid_map_points(points_json))
);

create index if not exists facility_map_nodes_org_idx on facilities.facility_map_nodes (org_id, z_index, space_id);
create index if not exists facility_map_nodes_parent_idx on facilities.facility_map_nodes (org_id, parent_space_id);

-- Add FK constraints only when facilities.spaces exists in this environment.
do $$
begin
  if to_regclass('facilities.spaces') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'facility_map_nodes_space_id_fkey'
        and conrelid = 'facilities.facility_map_nodes'::regclass
    ) then
      alter table facilities.facility_map_nodes
        add constraint facility_map_nodes_space_id_fkey
        foreign key (space_id) references facilities.spaces(id) on delete cascade;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'facility_map_nodes_parent_space_id_fkey'
        and conrelid = 'facilities.facility_map_nodes'::regclass
    ) then
      alter table facilities.facility_map_nodes
        add constraint facility_map_nodes_parent_space_id_fkey
        foreign key (parent_space_id) references facilities.spaces(id) on delete set null;
    end if;
  end if;
end
$$;

create or replace function facilities.normalize_facility_map_node()
returns trigger
language plpgsql
as $$
begin
  new.x := round(new.x / 24.0) * 24.0;
  new.y := round(new.y / 24.0) * 24.0;
  new.width := greatest(24, round(new.width / 24.0) * 24.0);
  new.height := greatest(24, round(new.height / 24.0) * 24.0);
  new.corner_radius := 12;

  if new.shape_type = 'rectangle' then
    new.points_json := jsonb_build_array(
      jsonb_build_object('x', new.x, 'y', new.y),
      jsonb_build_object('x', new.x + new.width, 'y', new.y),
      jsonb_build_object('x', new.x + new.width, 'y', new.y + new.height),
      jsonb_build_object('x', new.x, 'y', new.y + new.height)
    );
  else
    new.points_json := (
      select jsonb_agg(
        jsonb_build_object(
          'x', round(((point ->> 'x')::numeric) / 24.0) * 24.0,
          'y', round(((point ->> 'y')::numeric) / 24.0) * 24.0
        )
      )
      from jsonb_array_elements(new.points_json) point
    );
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger facility_map_nodes_normalize
before insert or update on facilities.facility_map_nodes
for each row execute function facilities.normalize_facility_map_node();

-- Strip legacy floorplan geometry from facilities.spaces so old geometry cannot be read.
do $$
begin
  if to_regclass('facilities.spaces') is not null then
    update facilities.spaces
    set metadata_json = coalesce(metadata_json, '{}'::jsonb) - 'floorPlan'
    where coalesce(metadata_json, '{}'::jsonb) ? 'floorPlan';
  end if;
end
$$;

commit;
