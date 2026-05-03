-- Allow multiple polygons per space on a facility map, and preserve a per-point
-- "smooth" flag through the normalization trigger so smooth-tangent vertices survive saves.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'facility_map_nodes_org_id_space_id_key'
      and conrelid = 'facilities.facility_map_nodes'::regclass
  ) then
    alter table facilities.facility_map_nodes
      drop constraint facility_map_nodes_org_id_space_id_key;
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
        case
          when (point ? 'smooth') and ((point ->> 'smooth')::boolean) is true then
            jsonb_build_object(
              'x', round(((point ->> 'x')::numeric) / 24.0) * 24.0,
              'y', round(((point ->> 'y')::numeric) / 24.0) * 24.0,
              'smooth', true
            )
          else
            jsonb_build_object(
              'x', round(((point ->> 'x')::numeric) / 24.0) * 24.0,
              'y', round(((point ->> 'y')::numeric) / 24.0) * 24.0
            )
        end
      )
      from jsonb_array_elements(new.points_json) point
    );
  end if;

  new.updated_at := now();
  return new;
end;
$$;
