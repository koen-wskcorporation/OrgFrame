-- Prevent duplicate `facility_map_nodes` rows per space.
--
-- Without this, the seeder (or any racy create flow) can insert a second
-- node for the same space, and the editor renders both polygons stacked
-- on top of each other. There's no application-level reason to have two
-- map nodes for one space — every space is a single shape on its
-- facility's canvas.
--
-- Step 1: collapse any existing duplicates, keeping the most recently
-- updated one (it's the most likely to have user-positioned geometry).
-- Step 2: add a UNIQUE constraint so it can't happen again.

begin;

with ranked as (
  select
    id,
    space_id,
    row_number() over (
      partition by space_id
      order by updated_at desc, created_at desc, id
    ) as rn
  from facilities.facility_map_nodes
)
delete from facilities.facility_map_nodes n
using ranked r
where n.id = r.id and r.rn > 1;

alter table facilities.facility_map_nodes
  drop constraint if exists facility_map_nodes_space_id_unique;

alter table facilities.facility_map_nodes
  add constraint facility_map_nodes_space_id_unique unique (space_id);

commit;
