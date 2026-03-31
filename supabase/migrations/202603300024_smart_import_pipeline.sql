begin;

create schema if not exists imports;

-- Remove legacy SportsConnect importer artifacts.
drop table if exists imports.sportsconnect_import_applied_rows cascade;
drop table if exists imports.sportsconnect_import_rows cascade;
drop table if exists imports.sportsconnect_import_runs cascade;
drop table if exists public.sportsconnect_import_applied_rows cascade;
drop table if exists public.sportsconnect_import_rows cascade;
drop table if exists public.sportsconnect_import_runs cascade;

create table if not exists imports.import_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  profile_key text not null check (profile_key in ('people_roster', 'program_structure', 'commerce_orders')),
  status text not null default 'queued' check (status in ('queued', 'processing', 'awaiting_conflicts', 'resolving_conflicts', 'ready_to_apply', 'applying', 'completed', 'failed', 'cancelled')),
  progress numeric(5, 2) not null default 0,
  source_bucket text,
  source_path text,
  source_filename text,
  source_mime text,
  source_size_bytes bigint,
  row_count integer not null default 0,
  summary_json jsonb not null default '{}'::jsonb,
  error_text text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists imports.import_rows (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references imports.import_runs(id) on delete cascade,
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  profile_key text not null check (profile_key in ('people_roster', 'program_structure', 'commerce_orders')),
  row_number integer not null,
  row_hash text not null,
  raw_row_json jsonb not null,
  normalized_row_json jsonb not null,
  validation_status text not null default 'valid' check (validation_status in ('valid', 'invalid', 'skipped')),
  validation_errors text[] not null default '{}'::text[],
  match_status text not null default 'direct' check (match_status in ('direct', 'conflict', 'unmatched', 'resolved', 'applied')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, row_number)
);

create table if not exists imports.import_conflicts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references imports.import_runs(id) on delete cascade,
  row_id uuid not null references imports.import_rows(id) on delete cascade,
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  profile_key text not null check (profile_key in ('people_roster', 'program_structure', 'commerce_orders')),
  conflict_type text not null,
  imported_payload_json jsonb not null default '{}'::jsonb,
  candidate_records_json jsonb not null default '[]'::jsonb,
  ai_suggestion_json jsonb,
  ai_confidence numeric(4, 3),
  ai_prompt text,
  resolution_state text not null default 'pending_ai' check (resolution_state in ('pending_ai', 'needs_review', 'auto_applied', 'manual_resolved', 'dismissed')),
  resolution_json jsonb,
  resolved_by_user_id uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists imports.import_decisions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  run_id uuid not null references imports.import_runs(id) on delete cascade,
  row_id uuid references imports.import_rows(id) on delete set null,
  conflict_id uuid references imports.import_conflicts(id) on delete set null,
  decision_source text not null check (decision_source in ('auto', 'manual', 'system')),
  decision_action text not null check (decision_action in ('insert', 'update', 'skip')),
  confidence numeric(4, 3),
  rationale text,
  decision_payload_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists imports.import_apply_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  run_id uuid not null references imports.import_runs(id) on delete cascade,
  row_id uuid references imports.import_rows(id) on delete set null,
  conflict_id uuid references imports.import_conflicts(id) on delete set null,
  profile_key text not null check (profile_key in ('people_roster', 'program_structure', 'commerce_orders')),
  idempotency_key text not null,
  target_schema text,
  target_table text,
  target_record_id text,
  apply_action text not null check (apply_action in ('insert', 'update', 'skip')),
  status text not null check (status in ('applied', 'skipped', 'failed')),
  message text,
  created_at timestamptz not null default now(),
  unique (org_id, idempotency_key)
);

create index if not exists import_runs_org_status_updated_idx
  on imports.import_runs (org_id, status, updated_at desc);

create index if not exists import_runs_org_created_idx
  on imports.import_runs (org_id, created_at desc);

create index if not exists import_rows_run_row_idx
  on imports.import_rows (run_id, row_number);

create index if not exists import_rows_org_profile_hash_idx
  on imports.import_rows (org_id, profile_key, row_hash);

create index if not exists import_rows_run_match_idx
  on imports.import_rows (run_id, match_status, row_number);

create index if not exists import_conflicts_org_unresolved_idx
  on imports.import_conflicts (org_id, run_id, resolution_state, created_at)
  where resolution_state in ('pending_ai', 'needs_review');

create index if not exists import_decisions_run_created_idx
  on imports.import_decisions (run_id, created_at desc);

create index if not exists import_apply_log_run_created_idx
  on imports.import_apply_log (run_id, created_at desc);

alter table imports.import_runs enable row level security;
alter table imports.import_rows enable row level security;
alter table imports.import_conflicts enable row level security;
alter table imports.import_decisions enable row level security;
alter table imports.import_apply_log enable row level security;

drop policy if exists import_runs_read on imports.import_runs;
create policy import_runs_read on imports.import_runs
  for select
  using (
    public.has_org_permission(org_id, 'org.manage.read')
    or created_by_user_id = auth.uid()
  );

drop policy if exists import_runs_write on imports.import_runs;
create policy import_runs_write on imports.import_runs
  for all
  using (
    public.has_org_permission(org_id, 'org.manage.read')
    or created_by_user_id = auth.uid()
  )
  with check (
    public.has_org_permission(org_id, 'org.manage.read')
    or created_by_user_id = auth.uid()
  );

drop policy if exists import_rows_read on imports.import_rows;
create policy import_rows_read on imports.import_rows
  for select
  using (
    public.has_org_permission(org_id, 'org.manage.read')
    or exists (
      select 1
      from imports.import_runs run
      where run.id = import_rows.run_id
        and run.created_by_user_id = auth.uid()
    )
  );

drop policy if exists import_rows_write on imports.import_rows;
create policy import_rows_write on imports.import_rows
  for all
  using (public.has_org_permission(org_id, 'org.manage.read'))
  with check (public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists import_conflicts_read on imports.import_conflicts;
create policy import_conflicts_read on imports.import_conflicts
  for select
  using (
    public.has_org_permission(org_id, 'org.manage.read')
    or exists (
      select 1
      from imports.import_runs run
      where run.id = import_conflicts.run_id
        and run.created_by_user_id = auth.uid()
    )
  );

drop policy if exists import_conflicts_write on imports.import_conflicts;
create policy import_conflicts_write on imports.import_conflicts
  for all
  using (public.has_org_permission(org_id, 'org.manage.read'))
  with check (public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists import_decisions_read on imports.import_decisions;
create policy import_decisions_read on imports.import_decisions
  for select
  using (
    public.has_org_permission(org_id, 'org.manage.read')
    or created_by_user_id = auth.uid()
  );

drop policy if exists import_decisions_write on imports.import_decisions;
create policy import_decisions_write on imports.import_decisions
  for all
  using (public.has_org_permission(org_id, 'org.manage.read'))
  with check (public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists import_apply_log_read on imports.import_apply_log;
create policy import_apply_log_read on imports.import_apply_log
  for select
  using (public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists import_apply_log_write on imports.import_apply_log;
create policy import_apply_log_write on imports.import_apply_log
  for all
  using (public.has_org_permission(org_id, 'org.manage.read'))
  with check (public.has_org_permission(org_id, 'org.manage.read'));

drop trigger if exists import_runs_set_updated_at on imports.import_runs;
create trigger import_runs_set_updated_at
before update on imports.import_runs
for each row execute procedure public.set_updated_at();

drop trigger if exists import_rows_set_updated_at on imports.import_rows;
create trigger import_rows_set_updated_at
before update on imports.import_rows
for each row execute procedure public.set_updated_at();

drop trigger if exists import_conflicts_set_updated_at on imports.import_conflicts;
create trigger import_conflicts_set_updated_at
before update on imports.import_conflicts
for each row execute procedure public.set_updated_at();

commit;
