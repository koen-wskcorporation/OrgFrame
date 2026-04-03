begin;

create table if not exists commerce.payment_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  slug text not null,
  title text not null,
  description text,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd',
  is_active boolean not null default true,
  success_message text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slug)
);

create index if not exists payment_links_org_active_idx
  on commerce.payment_links (org_id, is_active, created_at desc);

create table if not exists commerce.payment_link_payments (
  id uuid primary key default gen_random_uuid(),
  payment_link_id uuid not null references commerce.payment_links(id) on delete cascade,
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  stripe_checkout_session_id text not null,
  stripe_payment_intent_id text,
  status text not null default 'open' check (status in ('open', 'complete', 'expired', 'failed')),
  payer_email text,
  amount_total_cents integer,
  currency text,
  paid_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stripe_checkout_session_id)
);

create index if not exists payment_link_payments_org_created_idx
  on commerce.payment_link_payments (org_id, created_at desc);

alter table commerce.payment_links enable row level security;
alter table commerce.payment_link_payments enable row level security;

drop policy if exists payment_links_public_read_active on commerce.payment_links;
create policy payment_links_public_read_active on commerce.payment_links
  for select
  using (is_active = true or public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists payment_links_manage_write on commerce.payment_links;
create policy payment_links_manage_write on commerce.payment_links
  for all
  using (public.has_org_permission(org_id, 'org.manage.read'))
  with check (public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists payment_link_payments_manage_read on commerce.payment_link_payments;
create policy payment_link_payments_manage_read on commerce.payment_link_payments
  for select
  using (public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists payment_link_payments_no_client_write on commerce.payment_link_payments;
create policy payment_link_payments_no_client_write on commerce.payment_link_payments
  for all
  using (false)
  with check (false);

drop trigger if exists payment_links_set_updated_at on commerce.payment_links;
create trigger payment_links_set_updated_at
before update on commerce.payment_links
for each row execute procedure public.set_updated_at();

drop trigger if exists payment_link_payments_set_updated_at on commerce.payment_link_payments;
create trigger payment_link_payments_set_updated_at
before update on commerce.payment_link_payments
for each row execute procedure public.set_updated_at();

commit;
