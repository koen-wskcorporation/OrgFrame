-- Unified grid canvas v1 hard cutover tables.

create table if not exists public.facility_layout_nodes_v1 (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  entity_id uuid not null,
  parent_id uuid null,
  kind text not null,
  shape_type text not null check (shape_type in ('rectangle', 'polygon')),
  points_json jsonb not null default '[]'::jsonb,
  x numeric not null,
  y numeric not null,
  width numeric not null,
  height numeric not null,
  z_index integer not null default 1,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, entity_id)
);

create index if not exists facility_layout_nodes_v1_org_idx on public.facility_layout_nodes_v1 (org_id, z_index, entity_id);
create index if not exists facility_layout_nodes_v1_parent_idx on public.facility_layout_nodes_v1 (org_id, parent_id);

create table if not exists public.program_layout_nodes_v1 (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  entity_id uuid not null,
  parent_id uuid null,
  kind text not null,
  shape_type text not null check (shape_type in ('rectangle', 'polygon')),
  points_json jsonb not null default '[]'::jsonb,
  x numeric not null,
  y numeric not null,
  width numeric not null,
  height numeric not null,
  z_index integer not null default 1,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, entity_id)
);

create index if not exists program_layout_nodes_v1_org_idx on public.program_layout_nodes_v1 (org_id, z_index, entity_id);
create index if not exists program_layout_nodes_v1_parent_idx on public.program_layout_nodes_v1 (org_id, parent_id);

create table if not exists public.allocation_layout_nodes_v1 (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  entity_id uuid not null,
  parent_id uuid null,
  kind text not null,
  shape_type text not null check (shape_type in ('rectangle', 'polygon')),
  points_json jsonb not null default '[]'::jsonb,
  x numeric not null,
  y numeric not null,
  width numeric not null,
  height numeric not null,
  z_index integer not null default 1,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, entity_id)
);

create index if not exists allocation_layout_nodes_v1_org_idx on public.allocation_layout_nodes_v1 (org_id, z_index, entity_id);
create index if not exists allocation_layout_nodes_v1_parent_idx on public.allocation_layout_nodes_v1 (org_id, parent_id);

create or replace function public._canvas_snap(value numeric)
returns numeric
language sql
immutable
as $$
  select round(value / 25.0) * 25.0;
$$;

create or replace function public._canvas_rect_points(x numeric, y numeric, width numeric, height numeric)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_array(
    jsonb_build_object('x', x, 'y', y),
    jsonb_build_object('x', x + width, 'y', y),
    jsonb_build_object('x', x + width, 'y', y + height),
    jsonb_build_object('x', x, 'y', y + height)
  );
$$;

-- Facility backfill: normalize and snap floor-plan geometry into v1 rows.
insert into public.facility_layout_nodes_v1 (
  org_id,
  entity_id,
  parent_id,
  kind,
  shape_type,
  points_json,
  x,
  y,
  width,
  height,
  z_index,
  status
)
select
  space.org_id,
  space.id,
  space.parent_space_id,
  space.space_kind::text,
  case
    when jsonb_typeof(floorplan -> 'points') = 'array' and jsonb_array_length(floorplan -> 'points') >= 3 then 'polygon'
    else 'rectangle'
  end,
  case
    when jsonb_typeof(floorplan -> 'points') = 'array' and jsonb_array_length(floorplan -> 'points') >= 3 then (
      select jsonb_agg(
        jsonb_build_object(
          'x', public._canvas_snap(coalesce((point ->> 'x')::numeric, snapped_x)),
          'y', public._canvas_snap(coalesce((point ->> 'y')::numeric, snapped_y))
        )
      )
      from jsonb_array_elements(floorplan -> 'points') point
    )
    else public._canvas_rect_points(snapped_x, snapped_y, snapped_w, snapped_h)
  end,
  snapped_x,
  snapped_y,
  snapped_w,
  snapped_h,
  greatest(1, coalesce(space.sort_index, 1)),
  space.status::text
from (
  select
    sp.*,
    coalesce(sp.metadata_json -> 'floorPlan', '{}'::jsonb) as floorplan,
    public._canvas_snap(coalesce((sp.metadata_json -> 'floorPlan' ->> 'x')::numeric, 25 + (row_number() over (partition by sp.org_id order by sp.sort_index, sp.id) - 1) % 6 * 200)) as snapped_x,
    public._canvas_snap(coalesce((sp.metadata_json -> 'floorPlan' ->> 'y')::numeric, 25 + ((row_number() over (partition by sp.org_id order by sp.sort_index, sp.id) - 1) / 6) * 150)) as snapped_y,
    greatest(25::numeric, public._canvas_snap(coalesce((sp.metadata_json -> 'floorPlan' ->> 'width')::numeric, 200))) as snapped_w,
    greatest(25::numeric, public._canvas_snap(coalesce((sp.metadata_json -> 'floorPlan' ->> 'height')::numeric, 125))) as snapped_h
  from facilities.spaces sp
) space
where space.status <> 'archived'
on conflict (org_id, entity_id) do update
set
  parent_id = excluded.parent_id,
  kind = excluded.kind,
  shape_type = excluded.shape_type,
  points_json = excluded.points_json,
  x = excluded.x,
  y = excluded.y,
  width = excluded.width,
  height = excluded.height,
  z_index = excluded.z_index,
  status = excluded.status,
  updated_at = now();

-- Program backfill: seed canonical rectangles, strategy renderer handles lane/column placement.
insert into public.program_layout_nodes_v1 (
  org_id,
  entity_id,
  parent_id,
  kind,
  shape_type,
  points_json,
  x,
  y,
  width,
  height,
  z_index,
  status
)
select
  program.org_id,
  node.id,
  node.parent_id,
  node.node_kind::text,
  'rectangle',
  public._canvas_rect_points(0, 0, 300, 100),
  0,
  0,
  300,
  100,
  greatest(1, coalesce(node.sort_index, 1)),
  'active'
from programs.program_structure_nodes node
join programs.programs program on program.id = node.program_id
on conflict (org_id, entity_id) do update
set
  parent_id = excluded.parent_id,
  kind = excluded.kind,
  shape_type = excluded.shape_type,
  points_json = excluded.points_json,
  x = excluded.x,
  y = excluded.y,
  width = excluded.width,
  height = excluded.height,
  z_index = excluded.z_index,
  status = excluded.status,
  updated_at = now();

-- Allocation backfill: deterministic lane seeds by org/space.
insert into public.allocation_layout_nodes_v1 (
  org_id,
  entity_id,
  parent_id,
  kind,
  shape_type,
  points_json,
  x,
  y,
  width,
  height,
  z_index,
  status
)
select
  alloc.org_id,
  alloc.space_id,
  null,
  'space',
  'rectangle',
  public._canvas_rect_points(public._canvas_snap(25 + (alloc.row_idx - 1) % 4 * 300), public._canvas_snap(50 + ((alloc.row_idx - 1) / 4) * 100), 250, 75),
  public._canvas_snap(25 + (alloc.row_idx - 1) % 4 * 300),
  public._canvas_snap(50 + ((alloc.row_idx - 1) / 4) * 100),
  250,
  75,
  alloc.row_idx,
  'active'
from (
  select
    allocation.org_id,
    allocation.space_id,
    row_number() over (partition by allocation.org_id order by allocation.space_id) as row_idx
  from calendar.calendar_item_space_allocations allocation
  group by allocation.org_id, allocation.space_id
) alloc
on conflict (org_id, entity_id) do update
set
  parent_id = excluded.parent_id,
  kind = excluded.kind,
  shape_type = excluded.shape_type,
  points_json = excluded.points_json,
  x = excluded.x,
  y = excluded.y,
  width = excluded.width,
  height = excluded.height,
  z_index = excluded.z_index,
  status = excluded.status,
  updated_at = now();

drop function if exists public._canvas_rect_points(numeric, numeric, numeric, numeric);
drop function if exists public._canvas_snap(numeric);
