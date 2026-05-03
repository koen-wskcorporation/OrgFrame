-- Add 'pavilion' to the `facilities.spaces.space_kind` check constraint.
-- Pavilions are a distinct outdoor structure (covered, semi-open, often
-- bookable as a unit) that didn't fit cleanly under "building" or "room".
-- Existing values stay valid; this only widens the allowed set.

alter table facilities.spaces
  drop constraint if exists spaces_space_kind_check;

alter table facilities.spaces
  add constraint spaces_space_kind_check
  check (
    space_kind in (
      'building',
      'floor',
      'room',
      'field',
      'court',
      'pavilion',
      'custom',
      'bathroom',
      'parking_lot',
      'lobby',
      'office',
      'kitchen',
      'storage'
    )
  );
