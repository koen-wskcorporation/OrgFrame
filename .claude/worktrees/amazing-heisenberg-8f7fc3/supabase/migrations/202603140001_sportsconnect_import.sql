begin;

-- Extend parent contact fields on existing user profiles.
do $$
begin
  if to_regclass('public.user_profiles') is not null then
    alter table public.user_profiles
      add column if not exists phone_primary text,
      add column if not exists phone_secondary text,
      add column if not exists phone_other text,
      add column if not exists street_1 text,
      add column if not exists street_2 text,
      add column if not exists city text,
      add column if not exists state text,
      add column if not exists postal_code text;
  end if;
end
$$;

alter table public.players
  add column if not exists allergies text,
  add column if not exists physical_conditions text,
  add column if not exists insurance_company text,
  add column if not exists insurance_policy_holder text;

-- Order ledger foundation (import-first, no checkout flow yet).
create table if not exists public.org_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  source_system text not null default 'sportsconnect',
  source_order_id text not null,
  source_order_no text,
  source_payment_status text,
  order_status text,
  order_date timestamptz,
  order_time_stamp timestamptz,
  billing_first_name text,
  billing_last_name text,
  billing_address text,
  total_amount numeric(12, 2),
  total_paid_amount numeric(12, 2),
  balance_amount numeric(12, 2),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, source_system, source_order_id)
);

create table if not exists public.org_order_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  order_id uuid not null references public.org_orders(id) on delete cascade,
  source_line_key text not null,
  description text,
  source_program_name text,
  source_division_name text,
  source_team_name text,
  player_id uuid references public.players(id) on delete set null,
  program_id uuid references public.programs(id) on delete set null,
  division_node_id uuid references public.program_nodes(id) on delete set null,
  team_node_id uuid references public.program_nodes(id) on delete set null,
  amount numeric(12, 2),
  amount_paid numeric(12, 2),
  balance_amount numeric(12, 2),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, source_line_key)
);

create table if not exists public.org_order_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  order_id uuid not null references public.org_orders(id) on delete cascade,
  source_payment_key text not null,
  payment_status text,
  payment_date timestamptz,
  payment_amount numeric(12, 2),
  paid_registration_fee numeric(12, 2),
  paid_cc_fee numeric(12, 2),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, source_payment_key)
);

alter table public.org_form_submissions
  add column if not exists order_id uuid references public.org_orders(id) on delete set null,
  add column if not exists source_payment_status text;

create table if not exists public.sportsconnect_import_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'dry_run' check (status in ('dry_run', 'ready', 'committed', 'failed')),
  source_filename text,
  source_timezone text not null default 'America/Detroit',
  row_count integer not null default 0,
  summary_json jsonb not null default '{}'::jsonb,
  mapping_json jsonb not null default '{}'::jsonb,
  error_text text,
  committed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sportsconnect_import_rows (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.sportsconnect_import_runs(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  row_number integer not null,
  row_hash text not null,
  raw_row_json jsonb not null,
  normalized_row_json jsonb not null,
  issues_json jsonb not null default '[]'::jsonb,
  warnings_json jsonb not null default '[]'::jsonb,
  applied boolean not null default false,
  applied_at timestamptz,
  created_entity_ids_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, row_number)
);

create table if not exists public.sportsconnect_import_applied_rows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  run_id uuid not null references public.sportsconnect_import_runs(id) on delete cascade,
  run_row_id uuid not null references public.sportsconnect_import_rows(id) on delete cascade,
  row_hash text not null,
  applied_by_user_id uuid references auth.users(id) on delete set null,
  auth_user_id uuid references auth.users(id) on delete set null,
  player_id uuid references public.players(id) on delete set null,
  program_id uuid references public.programs(id) on delete set null,
  division_node_id uuid references public.program_nodes(id) on delete set null,
  team_node_id uuid references public.program_nodes(id) on delete set null,
  order_id uuid references public.org_orders(id) on delete set null,
  submission_id uuid references public.org_form_submissions(id) on delete set null,
  registration_id uuid references public.program_registrations(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, row_hash)
);

create index if not exists org_orders_org_created_idx
  on public.org_orders (org_id, created_at desc);
create index if not exists org_orders_org_source_idx
  on public.org_orders (org_id, source_system, source_order_id);
create index if not exists org_orders_org_payment_status_idx
  on public.org_orders (org_id, source_payment_status, created_at desc);
create index if not exists org_orders_source_order_no_idx
  on public.org_orders (org_id, source_order_no);
create index if not exists org_orders_source_order_id_json_idx
  on public.org_orders (org_id, (metadata_json ->> 'sourceOrderId'));

create index if not exists org_order_items_order_idx
  on public.org_order_items (order_id, created_at asc);
create index if not exists org_order_items_org_player_idx
  on public.org_order_items (org_id, player_id, created_at desc);

create index if not exists org_order_payments_order_idx
  on public.org_order_payments (order_id, payment_date desc);
create index if not exists org_order_payments_org_status_idx
  on public.org_order_payments (org_id, payment_status, payment_date desc);

create index if not exists org_form_submissions_order_idx
  on public.org_form_submissions (order_id, created_at desc);
create index if not exists org_form_submissions_source_payment_status_idx
  on public.org_form_submissions (org_id, source_payment_status, created_at desc);

create index if not exists sportsconnect_import_runs_org_created_idx
  on public.sportsconnect_import_runs (org_id, created_at desc);
create index if not exists sportsconnect_import_runs_org_status_idx
  on public.sportsconnect_import_runs (org_id, status, created_at desc);
create index if not exists sportsconnect_import_rows_run_idx
  on public.sportsconnect_import_rows (run_id, row_number);
create index if not exists sportsconnect_import_rows_org_hash_idx
  on public.sportsconnect_import_rows (org_id, row_hash);
create index if not exists sportsconnect_import_rows_run_applied_idx
  on public.sportsconnect_import_rows (run_id, applied, row_number);
create index if not exists sportsconnect_import_applied_org_created_idx
  on public.sportsconnect_import_applied_rows (org_id, created_at desc);
create index if not exists sportsconnect_import_applied_org_player_idx
  on public.sportsconnect_import_applied_rows (org_id, player_id, created_at desc);

alter table public.org_orders enable row level security;
alter table public.org_order_items enable row level security;
alter table public.org_order_payments enable row level security;

alter table public.sportsconnect_import_runs enable row level security;
alter table public.sportsconnect_import_rows enable row level security;
alter table public.sportsconnect_import_applied_rows enable row level security;

drop policy if exists org_orders_read on public.org_orders;
create policy org_orders_read on public.org_orders
  for select
  using (
    public.has_org_permission(org_id, 'forms.read')
    or public.has_org_permission(org_id, 'forms.write')
    or public.has_org_permission(org_id, 'org.manage.read')
  );

drop policy if exists org_orders_write on public.org_orders;
create policy org_orders_write on public.org_orders
  for all
  using (public.has_org_permission(org_id, 'org.manage.read'))
  with check (public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists org_order_items_read on public.org_order_items;
create policy org_order_items_read on public.org_order_items
  for select
  using (
    public.has_org_permission(org_id, 'forms.read')
    or public.has_org_permission(org_id, 'forms.write')
    or public.has_org_permission(org_id, 'org.manage.read')
  );

drop policy if exists org_order_items_write on public.org_order_items;
create policy org_order_items_write on public.org_order_items
  for all
  using (public.has_org_permission(org_id, 'org.manage.read'))
  with check (public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists org_order_payments_read on public.org_order_payments;
create policy org_order_payments_read on public.org_order_payments
  for select
  using (
    public.has_org_permission(org_id, 'forms.read')
    or public.has_org_permission(org_id, 'forms.write')
    or public.has_org_permission(org_id, 'org.manage.read')
  );

drop policy if exists org_order_payments_write on public.org_order_payments;
create policy org_order_payments_write on public.org_order_payments
  for all
  using (public.has_org_permission(org_id, 'org.manage.read'))
  with check (public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists sportsconnect_import_runs_read on public.sportsconnect_import_runs;
create policy sportsconnect_import_runs_read on public.sportsconnect_import_runs
  for select
  using (public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists sportsconnect_import_runs_write on public.sportsconnect_import_runs;
create policy sportsconnect_import_runs_write on public.sportsconnect_import_runs
  for all
  using (public.has_org_permission(org_id, 'org.manage.read'))
  with check (public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists sportsconnect_import_rows_read on public.sportsconnect_import_rows;
create policy sportsconnect_import_rows_read on public.sportsconnect_import_rows
  for select
  using (public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists sportsconnect_import_rows_write on public.sportsconnect_import_rows;
create policy sportsconnect_import_rows_write on public.sportsconnect_import_rows
  for all
  using (public.has_org_permission(org_id, 'org.manage.read'))
  with check (public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists sportsconnect_import_applied_rows_read on public.sportsconnect_import_applied_rows;
create policy sportsconnect_import_applied_rows_read on public.sportsconnect_import_applied_rows
  for select
  using (public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists sportsconnect_import_applied_rows_write on public.sportsconnect_import_applied_rows;
create policy sportsconnect_import_applied_rows_write on public.sportsconnect_import_applied_rows
  for all
  using (public.has_org_permission(org_id, 'org.manage.read'))
  with check (public.has_org_permission(org_id, 'org.manage.read'));

drop trigger if exists org_orders_set_updated_at on public.org_orders;
create trigger org_orders_set_updated_at
before update on public.org_orders
for each row execute procedure public.set_updated_at();

drop trigger if exists org_order_items_set_updated_at on public.org_order_items;
create trigger org_order_items_set_updated_at
before update on public.org_order_items
for each row execute procedure public.set_updated_at();

drop trigger if exists org_order_payments_set_updated_at on public.org_order_payments;
create trigger org_order_payments_set_updated_at
before update on public.org_order_payments
for each row execute procedure public.set_updated_at();

drop trigger if exists sportsconnect_import_runs_set_updated_at on public.sportsconnect_import_runs;
create trigger sportsconnect_import_runs_set_updated_at
before update on public.sportsconnect_import_runs
for each row execute procedure public.set_updated_at();

commit;
