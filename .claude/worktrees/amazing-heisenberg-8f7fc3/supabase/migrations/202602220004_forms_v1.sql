begin;

create table if not exists public.org_forms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  form_kind text not null default 'generic' check (form_kind in ('generic', 'program_registration')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  program_id uuid references public.programs(id) on delete set null,
  target_mode text not null default 'choice' check (target_mode in ('locked', 'choice')),
  locked_program_node_id uuid references public.program_nodes(id) on delete set null,
  schema_json jsonb not null default '{}'::jsonb,
  ui_json jsonb not null default '{}'::jsonb,
  settings_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug),
  constraint org_forms_registration_requires_program check (
    (form_kind = 'program_registration' and program_id is not null)
    or (form_kind = 'generic')
  ),
  constraint org_forms_locked_target_requires_node check (
    (target_mode = 'locked' and locked_program_node_id is not null)
    or (target_mode = 'choice')
  )
);

create table if not exists public.org_form_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  form_id uuid not null references public.org_forms(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  snapshot_json jsonb not null,
  published_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (form_id, version_number)
);

create table if not exists public.org_form_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  form_id uuid not null references public.org_forms(id) on delete cascade,
  version_id uuid not null references public.org_form_versions(id) on delete restrict,
  submitted_by_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'submitted' check (status in ('submitted', 'in_review', 'approved', 'rejected', 'waitlisted', 'cancelled')),
  answers_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.org_form_submission_entries (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.org_form_submissions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  program_node_id uuid references public.program_nodes(id) on delete set null,
  answers_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (submission_id, player_id)
);

create table if not exists public.program_registrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete cascade,
  program_node_id uuid references public.program_nodes(id) on delete set null,
  player_id uuid not null references public.players(id) on delete cascade,
  submission_id uuid not null references public.org_form_submissions(id) on delete cascade,
  status text not null default 'submitted' check (status in ('submitted', 'in_review', 'approved', 'rejected', 'waitlisted', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists org_forms_org_status_updated_idx on public.org_forms (org_id, status, updated_at desc);
create index if not exists org_forms_org_kind_idx on public.org_forms (org_id, form_kind);
create index if not exists org_form_versions_form_published_idx on public.org_form_versions (form_id, published_at desc);
create index if not exists org_form_submissions_org_form_created_idx on public.org_form_submissions (org_id, form_id, created_at desc);
create index if not exists org_form_submissions_org_status_created_idx on public.org_form_submissions (org_id, status, created_at desc);
create index if not exists org_form_submissions_user_created_idx on public.org_form_submissions (submitted_by_user_id, created_at desc);
create index if not exists org_form_submission_entries_submission_idx on public.org_form_submission_entries (submission_id, created_at);
create index if not exists org_form_submission_entries_player_idx on public.org_form_submission_entries (player_id, created_at desc);
create index if not exists program_registrations_program_status_idx on public.program_registrations (program_id, status, created_at desc);
create index if not exists program_registrations_player_status_idx on public.program_registrations (player_id, status, created_at desc);
create unique index if not exists program_registrations_active_unique_idx
  on public.program_registrations (
    program_id,
    player_id,
    coalesce(program_node_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status in ('submitted', 'in_review', 'approved', 'waitlisted');

drop trigger if exists org_forms_set_updated_at on public.org_forms;
create trigger org_forms_set_updated_at before update on public.org_forms for each row execute procedure public.set_updated_at();

drop trigger if exists org_form_submissions_set_updated_at on public.org_form_submissions;
create trigger org_form_submissions_set_updated_at before update on public.org_form_submissions for each row execute procedure public.set_updated_at();

drop trigger if exists program_registrations_set_updated_at on public.program_registrations;
create trigger program_registrations_set_updated_at before update on public.program_registrations for each row execute procedure public.set_updated_at();

alter table public.org_forms enable row level security;
alter table public.org_form_versions enable row level security;
alter table public.org_form_submissions enable row level security;
alter table public.org_form_submission_entries enable row level security;
alter table public.program_registrations enable row level security;

drop policy if exists org_forms_public_or_read on public.org_forms;
create policy org_forms_public_or_read on public.org_forms
  for select
  using (
    status = 'published'
    or public.has_org_permission(org_id, 'forms.read')
    or public.has_org_permission(org_id, 'forms.write')
  );

drop policy if exists org_forms_write on public.org_forms;
create policy org_forms_write on public.org_forms
  for all
  using (public.has_org_permission(org_id, 'forms.write'))
  with check (public.has_org_permission(org_id, 'forms.write'));

drop policy if exists org_form_versions_public_or_read on public.org_form_versions;
create policy org_form_versions_public_or_read on public.org_form_versions
  for select
  using (
    public.has_org_permission(org_id, 'forms.read')
    or public.has_org_permission(org_id, 'forms.write')
    or exists (
      select 1
      from public.org_forms form_definition
      where form_definition.id = org_form_versions.form_id
        and form_definition.status = 'published'
    )
  );

drop policy if exists org_form_versions_write on public.org_form_versions;
create policy org_form_versions_write on public.org_form_versions
  for all
  using (public.has_org_permission(org_id, 'forms.write'))
  with check (public.has_org_permission(org_id, 'forms.write'));

drop policy if exists org_form_submissions_read on public.org_form_submissions;
create policy org_form_submissions_read on public.org_form_submissions
  for select
  using (
    submitted_by_user_id = auth.uid()
    or public.has_org_permission(org_id, 'forms.read')
    or public.has_org_permission(org_id, 'forms.write')
  );

drop policy if exists org_form_submissions_insert on public.org_form_submissions;
create policy org_form_submissions_insert on public.org_form_submissions
  for insert
  with check (
    submitted_by_user_id = auth.uid()
    and (
      public.has_org_permission(org_id, 'forms.write')
      or exists (
        select 1
        from public.org_forms form_definition
        where form_definition.id = org_form_submissions.form_id
          and form_definition.status = 'published'
      )
    )
  );

drop policy if exists org_form_submissions_update on public.org_form_submissions;
create policy org_form_submissions_update on public.org_form_submissions
  for update
  using (public.has_org_permission(org_id, 'forms.write'))
  with check (public.has_org_permission(org_id, 'forms.write'));

drop policy if exists org_form_submissions_delete on public.org_form_submissions;
create policy org_form_submissions_delete on public.org_form_submissions
  for delete
  using (public.has_org_permission(org_id, 'forms.write'));

drop policy if exists org_form_submission_entries_read on public.org_form_submission_entries;
create policy org_form_submission_entries_read on public.org_form_submission_entries
  for select
  using (
    exists (
      select 1
      from public.org_form_submissions submission
      where submission.id = org_form_submission_entries.submission_id
        and (
          submission.submitted_by_user_id = auth.uid()
          or public.has_org_permission(submission.org_id, 'forms.read')
          or public.has_org_permission(submission.org_id, 'forms.write')
        )
    )
  );

drop policy if exists org_form_submission_entries_insert on public.org_form_submission_entries;
create policy org_form_submission_entries_insert on public.org_form_submission_entries
  for insert
  with check (
    public.is_player_guardian(player_id)
    or exists (
      select 1
      from public.org_form_submissions submission
      where submission.id = org_form_submission_entries.submission_id
        and public.has_org_permission(submission.org_id, 'forms.write')
    )
  );

drop policy if exists org_form_submission_entries_update on public.org_form_submission_entries;
create policy org_form_submission_entries_update on public.org_form_submission_entries
  for update
  using (
    exists (
      select 1
      from public.org_form_submissions submission
      where submission.id = org_form_submission_entries.submission_id
        and public.has_org_permission(submission.org_id, 'forms.write')
    )
  )
  with check (
    exists (
      select 1
      from public.org_form_submissions submission
      where submission.id = org_form_submission_entries.submission_id
        and public.has_org_permission(submission.org_id, 'forms.write')
    )
  );

drop policy if exists org_form_submission_entries_delete on public.org_form_submission_entries;
create policy org_form_submission_entries_delete on public.org_form_submission_entries
  for delete
  using (
    exists (
      select 1
      from public.org_form_submissions submission
      where submission.id = org_form_submission_entries.submission_id
        and public.has_org_permission(submission.org_id, 'forms.write')
    )
  );

drop policy if exists program_registrations_read on public.program_registrations;
create policy program_registrations_read on public.program_registrations
  for select
  using (
    public.has_org_permission(org_id, 'forms.read')
    or public.has_org_permission(org_id, 'forms.write')
    or public.is_player_guardian(player_id)
  );

drop policy if exists program_registrations_insert on public.program_registrations;
create policy program_registrations_insert on public.program_registrations
  for insert
  with check (
    public.has_org_permission(org_id, 'forms.write')
    or public.is_player_guardian(player_id)
  );

drop policy if exists program_registrations_update on public.program_registrations;
create policy program_registrations_update on public.program_registrations
  for update
  using (public.has_org_permission(org_id, 'forms.write'))
  with check (public.has_org_permission(org_id, 'forms.write'));

drop policy if exists program_registrations_delete on public.program_registrations;
create policy program_registrations_delete on public.program_registrations
  for delete
  using (public.has_org_permission(org_id, 'forms.write'));

-- Expand player read policy now that program_registrations exists.
drop policy if exists players_guardian_read on public.players;
create policy players_guardian_read on public.players
  for select
  using (
    owner_user_id = auth.uid()
    or public.is_player_guardian(id)
    or exists (
      select 1
      from public.program_registrations registration
      where registration.player_id = players.id
        and public.has_org_permission(registration.org_id, 'forms.read')
    )
  );

commit;
