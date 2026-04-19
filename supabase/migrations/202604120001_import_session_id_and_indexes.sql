begin;

alter table imports.import_runs
  add column if not exists import_session_id uuid;

create index if not exists import_runs_org_session_created_idx
  on imports.import_runs (org_id, import_session_id, created_at desc)
  where import_session_id is not null;

commit;
