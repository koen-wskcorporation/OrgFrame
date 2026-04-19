begin;

create table if not exists public.org_comm_channel_integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  channel_type public.org_comm_channel_type not null,
  provider text not null default 'meta',
  provider_account_id text not null,
  provider_account_name text,
  status text not null default 'active' check (status in ('active', 'disconnected', 'error')),
  connected_by_user_id uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_type, provider_account_id)
);

create unique index if not exists org_comm_channel_integrations_org_channel_provider_idx
  on public.org_comm_channel_integrations (org_id, channel_type, provider_account_id);
create index if not exists org_comm_channel_integrations_org_status_idx
  on public.org_comm_channel_integrations (org_id, status, updated_at desc);
create index if not exists org_comm_channel_integrations_org_channel_idx
  on public.org_comm_channel_integrations (org_id, channel_type, updated_at desc);

create table if not exists public.org_comm_channel_integration_secrets (
  integration_id uuid primary key references public.org_comm_channel_integrations(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  encrypted_access_token text not null,
  token_hint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, integration_id)
);

create index if not exists org_comm_channel_integration_secrets_org_idx
  on public.org_comm_channel_integration_secrets (org_id);

drop trigger if exists org_comm_channel_integrations_set_updated_at on public.org_comm_channel_integrations;
create trigger org_comm_channel_integrations_set_updated_at
before update on public.org_comm_channel_integrations
for each row execute procedure public.set_updated_at();

drop trigger if exists org_comm_channel_integration_secrets_set_updated_at on public.org_comm_channel_integration_secrets;
create trigger org_comm_channel_integration_secrets_set_updated_at
before update on public.org_comm_channel_integration_secrets
for each row execute procedure public.set_updated_at();

alter table public.org_comm_channel_integrations enable row level security;
alter table public.org_comm_channel_integration_secrets enable row level security;

drop policy if exists org_comm_channel_integrations_select on public.org_comm_channel_integrations;
create policy org_comm_channel_integrations_select on public.org_comm_channel_integrations
  for select
  using (
    public.has_org_permission(org_id, 'communications.read')
    or public.has_org_permission(org_id, 'communications.write')
  );

drop policy if exists org_comm_channel_integrations_write on public.org_comm_channel_integrations;
create policy org_comm_channel_integrations_write on public.org_comm_channel_integrations
  for all
  using (public.has_org_permission(org_id, 'communications.write'))
  with check (public.has_org_permission(org_id, 'communications.write'));

-- Secrets table intentionally has no policies; only service-role paths may access it.

commit;
