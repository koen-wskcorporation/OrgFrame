-- Add canvas geometry columns to programs.divisions for the program map editor.
-- Nulls indicate "not yet placed on the map" — the editor will auto-grid these on first open.
-- Mirrors the pattern used by facilities.spaces (map_points / map_z_index) but with
-- explicit x/y/w/h since program nodes are always rectangles.

begin;

alter table programs.divisions
  add column if not exists map_x integer,
  add column if not exists map_y integer,
  add column if not exists map_width integer,
  add column if not exists map_height integer,
  add column if not exists map_z_index integer not null default 0;

-- Either all four bounds columns are set, or none are. Prevents partial geometry rows.
alter table programs.divisions
  drop constraint if exists divisions_map_bounds_all_or_none;
alter table programs.divisions
  add constraint divisions_map_bounds_all_or_none check (
    (map_x is null and map_y is null and map_width is null and map_height is null)
    or (map_x is not null and map_y is not null and map_width is not null and map_height is not null)
  );

alter table programs.divisions
  drop constraint if exists divisions_map_size_positive;
alter table programs.divisions
  add constraint divisions_map_size_positive check (
    map_width is null or (map_width > 0 and map_height > 0)
  );

create index if not exists divisions_program_map_z_idx
  on programs.divisions (program_id, map_z_index);

notify pgrst, 'reload schema';

commit;
