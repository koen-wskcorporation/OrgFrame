begin;

-- Backfill column missed by 202604300003 on environments where that migration
-- was applied before the column was added to the file.
alter table facilities.spaces
  add column if not exists geo_address text null;

commit;
