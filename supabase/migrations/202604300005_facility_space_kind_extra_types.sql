-- Extend the facilities.spaces space_kind check constraint with new typed
-- options that drive iconography in the UI (bathrooms, parking lots, etc.).
-- Existing values stay valid; nothing else changes.

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
      'custom',
      'bathroom',
      'parking_lot',
      'lobby',
      'office',
      'kitchen',
      'storage'
    )
  );
