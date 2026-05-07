-- Drop the `shape_type` column from `facilities.facility_map_nodes`.
--
-- Every saved shape is a polygon now — a rectangle is simply a 4-vertex
-- polygon. Carrying a separate enum was a leftover from the original
-- editor, which had branches that overwrote `points` with a default
-- bbox rectangle whenever `shape_type === 'rectangle'`. That branch is
-- already gone from the app code; this drops the column too so the DB
-- can't surprise us with a stale value.

begin;

alter table facilities.facility_map_nodes
  drop column if exists shape_type;

commit;
