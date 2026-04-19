begin;

alter table if exists imports.import_runs
  add column if not exists undone_at timestamptz;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'imports.import_runs'::regclass
      and conname = 'import_runs_status_check'
  ) then
    alter table imports.import_runs
      drop constraint import_runs_status_check;
  end if;
end
$$;

alter table imports.import_runs
  add constraint import_runs_status_check
  check (status in (
    'queued',
    'processing',
    'awaiting_conflicts',
    'resolving_conflicts',
    'ready_to_apply',
    'applying',
    'completed',
    'failed',
    'cancelled',
    'undoing',
    'undone'
  ));

alter table if exists imports.import_apply_log
  add column if not exists undo_payload_json jsonb,
  add column if not exists undone_at timestamptz,
  add column if not exists undone_by_user_id uuid references auth.users(id) on delete set null;

create index if not exists import_apply_log_run_undone_idx
  on imports.import_apply_log (run_id, undone_at, created_at desc);

commit;
