begin;

alter table people.profile_links
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

commit;
