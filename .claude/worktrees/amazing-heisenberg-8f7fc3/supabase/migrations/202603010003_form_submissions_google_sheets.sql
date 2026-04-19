begin;

alter table public.org_form_submissions
  add column if not exists admin_notes text,
  add column if not exists sync_rev bigint not null default 0;

create table if not exists public.org_form_google_sheet_integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  form_id uuid not null references public.org_forms(id) on delete cascade,
  spreadsheet_id text not null,
  spreadsheet_url text not null,
  status text not null default 'active' check (status in ('active', 'disabled', 'error')),
  last_synced_at timestamptz,
  last_error text,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, form_id),
  unique (spreadsheet_id)
);

create table if not exists public.org_form_google_sheet_outbox (
  id bigserial primary key,
  org_id uuid not null references public.orgs(id) on delete cascade,
  form_id uuid not null references public.org_forms(id) on delete cascade,
  submission_id uuid,
  entry_id uuid,
  event_type text not null check (
    event_type in (
      'submission_inserted',
      'submission_updated',
      'submission_deleted',
      'entry_inserted',
      'entry_updated',
      'entry_deleted'
    )
  ),
  attempt_count integer not null default 0,
  locked_at timestamptz,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.org_form_google_sheet_sync_runs (
  id bigserial primary key,
  org_id uuid not null references public.orgs(id) on delete cascade,
  form_id uuid not null references public.org_forms(id) on delete cascade,
  integration_id uuid references public.org_form_google_sheet_integrations(id) on delete set null,
  trigger_source text not null check (trigger_source in ('manual', 'webhook', 'cron', 'outbox')),
  status text not null default 'running' check (status in ('running', 'ok', 'failed', 'partial')),
  inbound_updates_count integer not null default 0,
  inbound_creates_count integer not null default 0,
  outbound_rows_count integer not null default 0,
  conflicts_count integer not null default 0,
  error_count integer not null default 0,
  notes text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists org_form_google_sheet_integrations_org_form_idx
  on public.org_form_google_sheet_integrations (org_id, form_id);

create index if not exists org_form_google_sheet_integrations_status_idx
  on public.org_form_google_sheet_integrations (status, updated_at desc);

create index if not exists org_form_google_sheet_outbox_pending_idx
  on public.org_form_google_sheet_outbox (processed_at, locked_at, created_at);

create index if not exists org_form_google_sheet_outbox_org_form_idx
  on public.org_form_google_sheet_outbox (org_id, form_id, created_at);

create index if not exists org_form_google_sheet_sync_runs_org_form_started_idx
  on public.org_form_google_sheet_sync_runs (org_id, form_id, started_at desc);

create index if not exists org_form_google_sheet_sync_runs_status_started_idx
  on public.org_form_google_sheet_sync_runs (status, started_at desc);

create or replace function public.bump_form_submission_sync_rev()
returns trigger
language plpgsql
as $$
begin
  if (
    new.status is distinct from old.status
    or new.admin_notes is distinct from old.admin_notes
    or new.answers_json is distinct from old.answers_json
    or new.metadata_json is distinct from old.metadata_json
  ) then
    new.sync_rev = old.sync_rev + 1;
  else
    new.sync_rev = old.sync_rev;
  end if;

  return new;
end;
$$;

drop trigger if exists org_form_submissions_sync_rev on public.org_form_submissions;
create trigger org_form_submissions_sync_rev
before update on public.org_form_submissions
for each row execute procedure public.bump_form_submission_sync_rev();

create or replace function public.enqueue_form_submission_sheet_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payload_org_id uuid;
  payload_form_id uuid;
  payload_submission_id uuid;
  payload_event_type text;
begin
  if tg_op = 'INSERT' then
    payload_org_id := new.org_id;
    payload_form_id := new.form_id;
    payload_submission_id := new.id;
    payload_event_type := 'submission_inserted';
  elsif tg_op = 'UPDATE' then
    if (
      new.status is not distinct from old.status
      and new.admin_notes is not distinct from old.admin_notes
      and new.answers_json is not distinct from old.answers_json
      and new.metadata_json is not distinct from old.metadata_json
      and new.sync_rev is not distinct from old.sync_rev
    ) then
      return new;
    end if;

    payload_org_id := new.org_id;
    payload_form_id := new.form_id;
    payload_submission_id := new.id;
    payload_event_type := 'submission_updated';
  else
    payload_org_id := old.org_id;
    payload_form_id := old.form_id;
    payload_submission_id := old.id;
    payload_event_type := 'submission_deleted';
  end if;

  insert into public.org_form_google_sheet_outbox (
    org_id,
    form_id,
    submission_id,
    event_type
  ) values (
    payload_org_id,
    payload_form_id,
    payload_submission_id,
    payload_event_type
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists org_form_submissions_google_sheet_outbox on public.org_form_submissions;
create trigger org_form_submissions_google_sheet_outbox
after insert or update or delete on public.org_form_submissions
for each row execute procedure public.enqueue_form_submission_sheet_event();

create or replace function public.enqueue_form_submission_entry_sheet_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payload_submission_id uuid;
  payload_entry_id uuid;
  payload_event_type text;
  parent_org_id uuid;
  parent_form_id uuid;
begin
  if tg_op = 'INSERT' then
    payload_submission_id := new.submission_id;
    payload_entry_id := new.id;
    payload_event_type := 'entry_inserted';
  elsif tg_op = 'UPDATE' then
    if new.answers_json is not distinct from old.answers_json then
      return new;
    end if;

    payload_submission_id := new.submission_id;
    payload_entry_id := new.id;
    payload_event_type := 'entry_updated';
  else
    payload_submission_id := old.submission_id;
    payload_entry_id := old.id;
    payload_event_type := 'entry_deleted';
  end if;

  select submission.org_id, submission.form_id
  into parent_org_id, parent_form_id
  from public.org_form_submissions submission
  where submission.id = payload_submission_id
  limit 1;

  if parent_org_id is null or parent_form_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  insert into public.org_form_google_sheet_outbox (
    org_id,
    form_id,
    submission_id,
    entry_id,
    event_type
  ) values (
    parent_org_id,
    parent_form_id,
    payload_submission_id,
    payload_entry_id,
    payload_event_type
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists org_form_submission_entries_google_sheet_outbox on public.org_form_submission_entries;
create trigger org_form_submission_entries_google_sheet_outbox
after insert or update or delete on public.org_form_submission_entries
for each row execute procedure public.enqueue_form_submission_entry_sheet_event();

create or replace function public.lock_org_form_google_sheet_outbox(input_limit integer default 50)
returns setof public.org_form_google_sheet_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidate_rows as (
    select outbox.id
    from public.org_form_google_sheet_outbox outbox
    where outbox.processed_at is null
      and (outbox.locked_at is null or outbox.locked_at < now() - interval '5 minutes')
    order by outbox.created_at asc, outbox.id asc
    limit greatest(coalesce(input_limit, 50), 1)
    for update skip locked
  ),
  updated_rows as (
    update public.org_form_google_sheet_outbox outbox
    set
      locked_at = now(),
      attempt_count = outbox.attempt_count + 1,
      updated_at = now()
    where outbox.id in (select candidate_rows.id from candidate_rows)
    returning outbox.*
  )
  select updated_rows.*
  from updated_rows;
end;
$$;

revoke all on function public.lock_org_form_google_sheet_outbox(integer) from public;
grant execute on function public.lock_org_form_google_sheet_outbox(integer) to service_role;

drop trigger if exists org_form_google_sheet_integrations_set_updated_at on public.org_form_google_sheet_integrations;
create trigger org_form_google_sheet_integrations_set_updated_at
before update on public.org_form_google_sheet_integrations
for each row execute procedure public.set_updated_at();

drop trigger if exists org_form_google_sheet_outbox_set_updated_at on public.org_form_google_sheet_outbox;
create trigger org_form_google_sheet_outbox_set_updated_at
before update on public.org_form_google_sheet_outbox
for each row execute procedure public.set_updated_at();

alter table public.org_form_google_sheet_integrations enable row level security;
alter table public.org_form_google_sheet_outbox enable row level security;
alter table public.org_form_google_sheet_sync_runs enable row level security;

drop policy if exists org_form_google_sheet_integrations_read on public.org_form_google_sheet_integrations;
create policy org_form_google_sheet_integrations_read on public.org_form_google_sheet_integrations
  for select
  using (public.has_org_permission(org_id, 'forms.write'));

drop policy if exists org_form_google_sheet_integrations_write on public.org_form_google_sheet_integrations;
create policy org_form_google_sheet_integrations_write on public.org_form_google_sheet_integrations
  for all
  using (public.has_org_permission(org_id, 'forms.write'))
  with check (public.has_org_permission(org_id, 'forms.write'));

drop policy if exists org_form_google_sheet_outbox_service_role on public.org_form_google_sheet_outbox;
create policy org_form_google_sheet_outbox_service_role on public.org_form_google_sheet_outbox
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists org_form_google_sheet_sync_runs_read on public.org_form_google_sheet_sync_runs;
create policy org_form_google_sheet_sync_runs_read on public.org_form_google_sheet_sync_runs
  for select
  using (public.has_org_permission(org_id, 'forms.write'));

drop policy if exists org_form_google_sheet_sync_runs_service_role_write on public.org_form_google_sheet_sync_runs;
create policy org_form_google_sheet_sync_runs_service_role_write on public.org_form_google_sheet_sync_runs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

commit;
