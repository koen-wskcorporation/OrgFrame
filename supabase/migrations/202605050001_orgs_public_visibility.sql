-- Public visibility flag for org discovery during signup.
-- Defaults to true so existing organizations remain discoverable; admins can
-- opt out by setting `is_public = false`. The existing `orgs_public_read` RLS
-- policy already grants anonymous SELECT on orgs.orgs, so no policy change
-- is required — the column is purely a filter applied by application queries.
--
-- The orgs table was relocated to the `orgs` schema in
-- 202603300018_remove_core_schema_and_split_orgs_people.sql.
alter table orgs.orgs
  add column if not exists is_public boolean not null default true;

create index if not exists orgs_is_public_idx
  on orgs.orgs (is_public)
  where is_public = true;
