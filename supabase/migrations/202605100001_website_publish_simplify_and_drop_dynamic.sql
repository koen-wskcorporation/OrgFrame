begin;

-- Website manager: collapse `show_in_menu` into `is_published`.
--
-- The website-manager UI used to expose two visibility toggles per nav
-- entry: published-or-not (affects whether the public route renders) and
-- show-in-menu (affects whether the link appears in navigation). They were
-- almost always set in lockstep, the distinction confused users, and the
-- new manager only exposes a single "Status" chip.
--
-- (1) Backfill existing rows so the two columns agree. Going forward every
-- create/update path forces them to the same value, so this runs once.
update site.blocks
   set show_in_menu = is_published
 where row_kind = 'structure_item'
   and show_in_menu is distinct from is_published;

-- (2) Retire legacy "type = 'dynamic'" structure items. Dynamic content
-- now lives inside regular pages via dedicated blocks (program_catalog,
-- events, teams_directory, facility_space_list) at reserved slugs, so
-- the old auto-expanding placeholders have nothing to bind to anymore.
delete from site.blocks
 where row_kind = 'structure_item'
   and type = 'dynamic';

commit;
