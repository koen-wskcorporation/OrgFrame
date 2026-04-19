-- Constrain orgs.orgs.org_type to a known set of values to support
-- school districts, travel/rec leagues, camps, etc. The column was
-- introduced as free text in 202603090001_org_onboarding_fields.sql
-- and the orgs table was relocated to the `orgs` schema in
-- 202603300018_remove_core_schema_and_split_orgs_people.sql.
--
-- Replaces the 202604180004 attempt, which referenced the pre-reorg
-- `public.orgs` and failed to apply.

update orgs.orgs
set org_type = null
where org_type is not null
  and org_type not in (
    'club',
    'school_district',
    'travel_league',
    'rec_league',
    'tournament_organizer',
    'camp',
    'other'
  );

alter table orgs.orgs
  drop constraint if exists orgs_org_type_check;

alter table orgs.orgs
  add constraint orgs_org_type_check check (
    org_type is null or org_type in (
      'club',
      'school_district',
      'travel_league',
      'rec_league',
      'tournament_organizer',
      'camp',
      'other'
    )
  );

create index if not exists orgs_org_type_idx on orgs.orgs (org_type);
