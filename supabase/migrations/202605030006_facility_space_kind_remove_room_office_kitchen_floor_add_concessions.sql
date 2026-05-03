-- Trim the `facilities.spaces.space_kind` set to the kinds the editor
-- actually surfaces, and add `concessions` for food/beverage stands.
--
-- Removed: floor, room, office, kitchen — these were placeholders that
-- never had a clear UX role. Buildings nest spaces directly; "room" was
-- redundant with "custom"; office and kitchen are out of scope for the
-- facilities-bookable model.
--
-- Any existing rows on the removed kinds are migrated to 'custom' so
-- the new CHECK constraint accepts them. Run BEFORE dropping the old
-- constraint or the UPDATE itself would fail the check.

begin;

update facilities.spaces
   set space_kind = 'custom'
 where space_kind in ('floor', 'room', 'office', 'kitchen');

alter table facilities.spaces
  drop constraint if exists spaces_space_kind_check;

alter table facilities.spaces
  add constraint spaces_space_kind_check
  check (
    space_kind in (
      'building',
      'field',
      'court',
      'pavilion',
      'concessions',
      'lobby',
      'bathroom',
      'storage',
      'parking_lot',
      'custom'
    )
  );

-- Force `is_bookable=false` for kinds that are intrinsically not
-- bookable. Mirrors the application-level rule in
-- `KIND_BOOKABILITY` so the database can never hold a contradictory
-- row (e.g. a bathroom marked bookable from a stale migration).
update facilities.spaces
   set is_bookable = false
 where space_kind in ('lobby', 'bathroom', 'storage', 'parking_lot')
   and is_bookable = true;

commit;
