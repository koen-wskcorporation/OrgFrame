begin;

-- 1) Move lingering facility event FKs off legacy_org_events to canonical calendar_items.
alter table if exists public.facility_reservation_rules
  drop constraint if exists facility_reservation_rules_event_id_fkey;

alter table if exists public.facility_reservations
  drop constraint if exists facility_reservations_event_id_fkey;

alter table if exists public.facility_reservation_rules
  add constraint facility_reservation_rules_event_id_fkey
  foreign key (event_id) references public.calendar_items(id) on delete set null;

alter table if exists public.facility_reservations
  add constraint facility_reservations_event_id_fkey
  foreign key (event_id) references public.calendar_items(id) on delete set null;

-- 2) Drop legacy physical tables that were kept during transitional migrations.
-- Keep compatibility views (org_pages, program_nodes, calendar_entries, etc.) for now,
-- because app code still references them.
drop table if exists public.legacy_org_page_blocks cascade;
drop table if exists public.legacy_org_pages cascade;
drop table if exists public.legacy_org_site_pages cascade;
drop table if exists public.legacy_org_nav_items cascade;
drop table if exists public.legacy_org_site_structure_nodes cascade;

drop table if exists public.legacy_calendar_entries cascade;
drop table if exists public.legacy_calendar_rules cascade;
drop table if exists public.legacy_calendar_occurrences cascade;
drop table if exists public.legacy_calendar_rule_exceptions cascade;
drop table if exists public.legacy_calendar_rule_facility_allocations cascade;
drop table if exists public.legacy_calendar_occurrence_facility_allocations cascade;
drop table if exists public.legacy_calendar_occurrence_teams cascade;
drop table if exists public.legacy_calendar_sources cascade;

drop table if exists public.legacy_org_events cascade;

commit;
