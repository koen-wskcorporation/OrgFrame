-- Drop the server-side trigger that silently snapped every facility map node
-- (and every polygon point) to a 24-unit grid on insert/update. The client
-- now controls snap behavior based on whether the active facility uses a
-- satellite background — outdoor facilities place spaces against real
-- imagery at fractional coordinates, and the trigger was destroying those
-- coords every time the user saved.
--
-- We still keep `updated_at` fresh via a much smaller trigger so that read
-- timestamps stay accurate.

drop trigger if exists facility_map_nodes_normalize on facilities.facility_map_nodes;
drop function if exists facilities.normalize_facility_map_node() cascade;

-- Replacement: just bump updated_at. Coordinates are persisted verbatim.
create or replace function facilities.touch_facility_map_node_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists facility_map_nodes_touch_updated_at on facilities.facility_map_nodes;

create trigger facility_map_nodes_touch_updated_at
before insert or update on facilities.facility_map_nodes
for each row execute function facilities.touch_facility_map_node_updated_at();

-- The check `corner_radius = 12` is also legacy — it forces every node back
-- to the old radius even though the client now renders with 4. Drop it so
-- saves don't fail on nodes the client persists with the new radius. (We
-- could re-add a sane bound later if needed.)
alter table facilities.facility_map_nodes
  drop constraint if exists facility_map_nodes_corner_radius_check;
