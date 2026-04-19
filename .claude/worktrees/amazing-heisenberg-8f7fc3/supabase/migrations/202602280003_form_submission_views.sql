begin;

create table if not exists public.org_form_submission_views (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  form_id uuid not null references public.org_forms(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  sort_index integer not null default 0,
  visibility_scope text not null check (visibility_scope in ('private', 'forms_readers', 'specific_admin')),
  target_user_id uuid references auth.users(id) on delete set null,
  config_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_form_submission_views_target_required check (
    (visibility_scope = 'specific_admin' and target_user_id is not null)
    or (visibility_scope <> 'specific_admin' and target_user_id is null)
  )
);

create index if not exists org_form_submission_views_org_form_sort_idx
  on public.org_form_submission_views (org_id, form_id, sort_index asc, created_at asc);

create index if not exists org_form_submission_views_target_idx
  on public.org_form_submission_views (target_user_id, created_at desc);

drop trigger if exists org_form_submission_views_set_updated_at on public.org_form_submission_views;
create trigger org_form_submission_views_set_updated_at
before update on public.org_form_submission_views
for each row execute procedure public.set_updated_at();

alter table public.org_form_submission_views enable row level security;

drop policy if exists org_form_submission_views_read on public.org_form_submission_views;
create policy org_form_submission_views_read on public.org_form_submission_views
  for select
  using (
    (
      public.has_org_permission(org_id, 'forms.read')
      or public.has_org_permission(org_id, 'forms.write')
    )
    and (
      created_by_user_id = auth.uid()
      or visibility_scope = 'forms_readers'
      or (visibility_scope = 'specific_admin' and target_user_id = auth.uid())
    )
  );

drop policy if exists org_form_submission_views_insert on public.org_form_submission_views;
create policy org_form_submission_views_insert on public.org_form_submission_views
  for insert
  with check (
    (
      public.has_org_permission(org_id, 'forms.read')
      or public.has_org_permission(org_id, 'forms.write')
    )
    and created_by_user_id = auth.uid()
  );

drop policy if exists org_form_submission_views_update on public.org_form_submission_views;
create policy org_form_submission_views_update on public.org_form_submission_views
  for update
  using (
    (
      public.has_org_permission(org_id, 'forms.read')
      or public.has_org_permission(org_id, 'forms.write')
    )
    and created_by_user_id = auth.uid()
  )
  with check (
    (
      public.has_org_permission(org_id, 'forms.read')
      or public.has_org_permission(org_id, 'forms.write')
    )
    and created_by_user_id = auth.uid()
  );

drop policy if exists org_form_submission_views_delete on public.org_form_submission_views;
create policy org_form_submission_views_delete on public.org_form_submission_views
  for delete
  using (
    (
      public.has_org_permission(org_id, 'forms.read')
      or public.has_org_permission(org_id, 'forms.write')
    )
    and created_by_user_id = auth.uid()
  );

commit;
