begin;

-- Remove compatibility view layer; app code now targets canonical tables directly.
drop view if exists public.program_nodes;
drop view if exists public.org_pages;
drop view if exists public.org_page_blocks;
drop view if exists public.org_nav_items;
drop view if exists public.org_site_structure_nodes;

drop view if exists public.calendar_entries;
drop view if exists public.calendar_rules;
drop view if exists public.calendar_occurrences;
drop view if exists public.calendar_rule_exceptions;
drop view if exists public.calendar_rule_facility_allocations;
drop view if exists public.calendar_occurrence_facility_allocations;
drop view if exists public.calendar_occurrence_teams;
drop view if exists public.calendar_sources;
drop view if exists public.calendar_lens_saved_views;
drop view if exists public.org_events;

drop view if exists public.org_user_inbox_items;
drop view if exists public.facility_nodes;

commit;
