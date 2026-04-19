-- messaging schema: multi-tenant outbound email infrastructure.
-- Each org can authenticate its own sending domain (SendGrid Domain Auth),
-- maintain its own suppression list, track quotas, and see per-send events.

create schema if not exists messaging;
grant usage on schema messaging to service_role;

-- Sending domains authenticated per-org via SendGrid Domain Authentication.
-- One org can register multiple domains; exactly one may be marked primary.
create table if not exists messaging.org_email_domains (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  domain text not null check (char_length(domain) between 3 and 255),
  sendgrid_domain_id bigint,
  dns_records jsonb not null default '[]'::jsonb,
  dkim_verified boolean not null default false,
  spf_verified boolean not null default false,
  verified_at timestamptz,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, domain)
);

create unique index if not exists org_email_domains_primary_per_org_idx
  on messaging.org_email_domains (org_id) where is_primary;

-- From-identity per org. Until a domain is verified, org mail ships through
-- the platform fallback subdomain (see EMAIL_DEFAULT_TENANT_DOMAIN env var)
-- with reply_to set to the org.
create table if not exists messaging.org_email_identities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  from_email text not null check (char_length(from_email) between 3 and 320),
  from_name text not null check (char_length(from_name) between 1 and 200),
  reply_to text check (reply_to is null or char_length(reply_to) <= 320),
  domain_id uuid references messaging.org_email_domains(id) on delete set null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, from_email)
);

create unique index if not exists org_email_identities_default_per_org_idx
  on messaging.org_email_identities (org_id) where is_default;

-- Per-org suppression list. A contact unsubscribing from Org A must not block
-- mail from Org B, so this is scoped per org (not global like SendGrid's).
create table if not exists messaging.suppressions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  email_lower text not null check (char_length(email_lower) between 3 and 320),
  reason text not null check (reason in ('unsubscribe', 'bounce', 'spam_report', 'manual', 'invalid')),
  source text,
  created_at timestamptz not null default now(),
  unique (org_id, email_lower)
);

create index if not exists suppressions_org_reason_idx
  on messaging.suppressions (org_id, reason);

-- Audit log: one row per outbound attempt.
create table if not exists messaging.sends (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  identity_id uuid references messaging.org_email_identities(id) on delete set null,
  contact_id uuid,
  to_email text not null,
  from_email text not null,
  subject text not null,
  template_key text,
  category text,
  status text not null check (status in ('queued', 'sent', 'failed', 'suppressed', 'quota_exceeded')),
  sendgrid_message_id text,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sends_org_created_idx
  on messaging.sends (org_id, created_at desc);

create index if not exists sends_sendgrid_message_id_idx
  on messaging.sends (sendgrid_message_id) where sendgrid_message_id is not null;

-- Event stream from SendGrid Event Webhook. Keyed back to `sends` via
-- sendgrid_message_id (SG's sg_message_id) and to org via customArgs.
create table if not exists messaging.events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references orgs.orgs(id) on delete set null,
  send_id uuid references messaging.sends(id) on delete set null,
  sg_event_id text,
  sg_message_id text,
  event_type text not null,
  email text,
  occurred_at timestamptz not null,
  raw jsonb not null,
  created_at timestamptz not null default now(),
  unique (sg_event_id)
);

create index if not exists events_org_occurred_idx
  on messaging.events (org_id, occurred_at desc);

create index if not exists events_send_idx
  on messaging.events (send_id);

-- Rolling daily quota per org. Default cap is set application-side; rows
-- are created lazily on first send of the day.
create table if not exists messaging.org_send_quotas (
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  period_date date not null,
  sent_count integer not null default 0,
  daily_cap integer not null default 1000,
  updated_at timestamptz not null default now(),
  primary key (org_id, period_date)
);

-- RLS: all these tables are server-role-only. No direct anon/authenticated
-- access — callers go through server actions that validate org membership.
alter table messaging.org_email_domains enable row level security;
alter table messaging.org_email_identities enable row level security;
alter table messaging.suppressions enable row level security;
alter table messaging.sends enable row level security;
alter table messaging.events enable row level security;
alter table messaging.org_send_quotas enable row level security;

-- Atomic quota increment helper: returns true if within cap and reserves a slot,
-- false if cap exceeded. Used by the send pipeline before dispatch.
create or replace function messaging.try_reserve_send_slot(
  p_org_id uuid,
  p_default_cap integer default 1000
) returns boolean
language plpgsql
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_sent integer;
  v_cap integer;
begin
  insert into messaging.org_send_quotas (org_id, period_date, daily_cap)
  values (p_org_id, v_today, p_default_cap)
  on conflict (org_id, period_date) do nothing;

  update messaging.org_send_quotas
  set sent_count = sent_count + 1,
      updated_at = now()
  where org_id = p_org_id
    and period_date = v_today
    and sent_count < daily_cap
  returning sent_count, daily_cap into v_sent, v_cap;

  return v_sent is not null;
end;
$$;

grant execute on function messaging.try_reserve_send_slot(uuid, integer) to service_role;
