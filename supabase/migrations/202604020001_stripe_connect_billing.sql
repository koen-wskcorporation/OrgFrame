begin;

create table if not exists commerce.org_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  provider text not null default 'stripe' check (provider = 'stripe'),
  connect_account_id text not null,
  status text not null default 'onboarding' check (status in ('not_connected', 'onboarding', 'restricted', 'ready', 'disabled')),
  country text not null default 'US',
  default_currency text not null default 'usd',
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  requirements_currently_due_json jsonb not null default '[]'::jsonb,
  requirements_past_due_json jsonb not null default '[]'::jsonb,
  requirements_eventually_due_json jsonb not null default '[]'::jsonb,
  requirements_disabled_reason text,
  onboarding_completed_at timestamptz,
  last_synced_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id),
  unique (connect_account_id)
);

create table if not exists commerce.org_payment_tax_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  tax_classification text not null default 'nonprofit' check (tax_classification in ('nonprofit', 'for_profit', 'government', 'other')),
  legal_business_name text,
  ein_last4 text,
  tax_id_status text not null default 'uncollected' check (tax_id_status in ('uncollected', 'pending_verification', 'verified', 'unverified', 'not_required')),
  nonprofit_declared boolean not null default true,
  business_address_json jsonb not null default '{}'::jsonb,
  tax_responsibility_acknowledged_at timestamptz,
  tax_responsibility_acknowledged_by_user_id uuid references auth.users(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id)
);

create table if not exists commerce.account_payment_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'stripe' check (provider = 'stripe'),
  stripe_customer_id text not null,
  email text,
  name text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  unique (stripe_customer_id)
);

create table if not exists commerce.account_payment_methods (
  id uuid primary key default gen_random_uuid(),
  payment_profile_id uuid not null references commerce.account_payment_profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'stripe' check (provider = 'stripe'),
  stripe_payment_method_id text not null,
  method_type text,
  brand text,
  last4 text,
  exp_month integer,
  exp_year integer,
  billing_name text,
  billing_address_json jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'detached', 'deleted')),
  is_default boolean not null default false,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_profile_id, stripe_payment_method_id),
  unique (stripe_payment_method_id)
);

create unique index if not exists account_payment_methods_single_default_idx
  on commerce.account_payment_methods (payment_profile_id)
  where is_default = true and status = 'active';

create table if not exists commerce.payment_method_portability_map (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  source_payment_method_id uuid not null references commerce.account_payment_methods(id) on delete cascade,
  source_stripe_payment_method_id text not null,
  connect_account_id text not null,
  connected_account_payment_method_id text not null,
  status text not null default 'active' check (status in ('active', 'invalid')),
  last_validated_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, source_stripe_payment_method_id, connect_account_id)
);

create table if not exists commerce.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'stripe' check (provider = 'stripe'),
  event_id text not null,
  event_type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  status text not null default 'received' check (status in ('received', 'processed', 'failed')),
  error_text text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id)
);

create index if not exists org_payment_accounts_status_idx
  on commerce.org_payment_accounts (org_id, status, updated_at desc);

create index if not exists org_payment_tax_profiles_org_idx
  on commerce.org_payment_tax_profiles (org_id, updated_at desc);

create index if not exists account_payment_methods_user_idx
  on commerce.account_payment_methods (user_id, status, created_at desc);

create index if not exists portability_map_user_org_idx
  on commerce.payment_method_portability_map (user_id, org_id, status, updated_at desc);

create index if not exists payment_webhook_events_status_idx
  on commerce.payment_webhook_events (status, received_at desc);

alter table commerce.org_payment_accounts enable row level security;
alter table commerce.org_payment_tax_profiles enable row level security;
alter table commerce.account_payment_profiles enable row level security;
alter table commerce.account_payment_methods enable row level security;
alter table commerce.payment_method_portability_map enable row level security;
alter table commerce.payment_webhook_events enable row level security;

drop policy if exists org_payment_accounts_read on commerce.org_payment_accounts;
create policy org_payment_accounts_read on commerce.org_payment_accounts
  for select
  using (public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists org_payment_accounts_write on commerce.org_payment_accounts;
create policy org_payment_accounts_write on commerce.org_payment_accounts
  for all
  using (public.has_org_permission(org_id, 'org.manage.read'))
  with check (public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists org_payment_tax_profiles_read on commerce.org_payment_tax_profiles;
create policy org_payment_tax_profiles_read on commerce.org_payment_tax_profiles
  for select
  using (public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists org_payment_tax_profiles_write on commerce.org_payment_tax_profiles;
create policy org_payment_tax_profiles_write on commerce.org_payment_tax_profiles
  for all
  using (public.has_org_permission(org_id, 'org.manage.read'))
  with check (public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists account_payment_profiles_read on commerce.account_payment_profiles;
create policy account_payment_profiles_read on commerce.account_payment_profiles
  for select
  using (user_id = auth.uid());

drop policy if exists account_payment_profiles_write on commerce.account_payment_profiles;
create policy account_payment_profiles_write on commerce.account_payment_profiles
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists account_payment_methods_read on commerce.account_payment_methods;
create policy account_payment_methods_read on commerce.account_payment_methods
  for select
  using (user_id = auth.uid());

drop policy if exists account_payment_methods_write on commerce.account_payment_methods;
create policy account_payment_methods_write on commerce.account_payment_methods
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists payment_method_portability_map_read on commerce.payment_method_portability_map;
create policy payment_method_portability_map_read on commerce.payment_method_portability_map
  for select
  using (user_id = auth.uid() or public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists payment_method_portability_map_write on commerce.payment_method_portability_map;
create policy payment_method_portability_map_write on commerce.payment_method_portability_map
  for all
  using (user_id = auth.uid() or public.has_org_permission(org_id, 'org.manage.read'))
  with check (user_id = auth.uid() or public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists payment_webhook_events_no_client_access on commerce.payment_webhook_events;
create policy payment_webhook_events_no_client_access on commerce.payment_webhook_events
  for all
  using (false)
  with check (false);

drop trigger if exists org_payment_accounts_set_updated_at on commerce.org_payment_accounts;
create trigger org_payment_accounts_set_updated_at
before update on commerce.org_payment_accounts
for each row execute procedure public.set_updated_at();

drop trigger if exists org_payment_tax_profiles_set_updated_at on commerce.org_payment_tax_profiles;
create trigger org_payment_tax_profiles_set_updated_at
before update on commerce.org_payment_tax_profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists account_payment_profiles_set_updated_at on commerce.account_payment_profiles;
create trigger account_payment_profiles_set_updated_at
before update on commerce.account_payment_profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists account_payment_methods_set_updated_at on commerce.account_payment_methods;
create trigger account_payment_methods_set_updated_at
before update on commerce.account_payment_methods
for each row execute procedure public.set_updated_at();

drop trigger if exists payment_method_portability_map_set_updated_at on commerce.payment_method_portability_map;
create trigger payment_method_portability_map_set_updated_at
before update on commerce.payment_method_portability_map
for each row execute procedure public.set_updated_at();

drop trigger if exists payment_webhook_events_set_updated_at on commerce.payment_webhook_events;
create trigger payment_webhook_events_set_updated_at
before update on commerce.payment_webhook_events
for each row execute procedure public.set_updated_at();

commit;
