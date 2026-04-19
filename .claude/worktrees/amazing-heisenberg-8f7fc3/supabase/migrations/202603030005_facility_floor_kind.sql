alter table public.facility_spaces
  drop constraint if exists facility_spaces_space_kind_check;

alter table public.facility_spaces
  add constraint facility_spaces_space_kind_check
  check (space_kind in ('building', 'floor', 'room', 'field', 'court', 'custom'));
