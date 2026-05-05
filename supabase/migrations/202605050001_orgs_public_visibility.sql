-- Public visibility flag for org discovery during signup.
-- Defaults to true so existing organizations remain discoverable; admins can
-- opt out by setting `is_public = false`. The existing `orgs_public_read` RLS
-- policy already grants anonymous SELECT on public.orgs, so no policy change
-- is required — the column is purely a filter applied by application queries.
alter table public.orgs
  add column if not exists is_public boolean not null default true;

create index if not exists orgs_is_public_idx
  on public.orgs (is_public)
  where is_public = true;
