begin;

create table if not exists imports.import_platforms (
  key text primary key,
  label text not null,
  description text not null default '',
  logo_asset_path text,
  supports_api_pull boolean not null default false,
  supports_file_upload boolean not null default true,
  requires_oauth boolean not null default false,
  oauth_provider text,
  api_version text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table imports.import_platforms enable row level security;

drop policy if exists import_platforms_read on imports.import_platforms;
create policy import_platforms_read on imports.import_platforms
  for select
  using (true);

drop policy if exists import_platforms_write on imports.import_platforms;
create policy import_platforms_write on imports.import_platforms
  for all
  using (false)
  with check (false);

drop trigger if exists import_platforms_set_updated_at on imports.import_platforms;
create trigger import_platforms_set_updated_at
before update on imports.import_platforms
for each row execute procedure public.set_updated_at();

insert into imports.import_platforms (
  key,
  label,
  description,
  logo_asset_path,
  supports_api_pull,
  supports_file_upload,
  requires_oauth,
  oauth_provider,
  api_version,
  is_active
)
values
  ('spreadsheet', 'Spreadsheet (Custom)', 'CSV/XLSX exports from Google Sheets, Excel, or other custom sources.', '/brand/platforms/spreadsheet.svg', false, true, false, null, null, true),
  ('sportsconnect', 'Sports Connect', 'Exports from Sports Connect registration and roster tools.', '/brand/platforms/sportsconnect.svg', false, true, false, null, null, true),
  ('sportsengine', 'SportsEngine', 'Connect SportsEngine via OAuth and pull roster/program data directly.', '/brand/platforms/sportsengine.svg', true, true, true, 'sportsengine', 'v1', true),
  ('stack_sports', 'Stack Sports', 'Program and roster exports from Stack Sports.', '/brand/platforms/stack-sports.svg', false, true, false, null, null, true),
  ('other', 'Other Platform', 'Any other source file; choose fields and rows before import.', '/brand/platforms/other.svg', false, true, false, null, null, true)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  logo_asset_path = excluded.logo_asset_path,
  supports_api_pull = excluded.supports_api_pull,
  supports_file_upload = excluded.supports_file_upload,
  requires_oauth = excluded.requires_oauth,
  oauth_provider = excluded.oauth_provider,
  api_version = excluded.api_version,
  is_active = excluded.is_active,
  updated_at = now();

create table if not exists imports.org_platform_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  platform_key text not null references imports.import_platforms(key) on delete cascade,
  status text not null default 'active' check (status in ('active', 'disconnected', 'error')),
  provider_account_id text,
  provider_account_name text,
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_type text,
  scope text,
  token_expires_at timestamptz,
  connected_by_user_id uuid references auth.users(id) on delete set null,
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, platform_key)
);

create index if not exists org_platform_connections_org_platform_idx
  on imports.org_platform_connections (org_id, platform_key);

alter table imports.org_platform_connections enable row level security;

drop policy if exists org_platform_connections_read on imports.org_platform_connections;
create policy org_platform_connections_read on imports.org_platform_connections
  for select
  using (public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists org_platform_connections_write on imports.org_platform_connections;
create policy org_platform_connections_write on imports.org_platform_connections
  for all
  using (public.has_org_permission(org_id, 'org.manage.read'))
  with check (public.has_org_permission(org_id, 'org.manage.read'));

drop trigger if exists org_platform_connections_set_updated_at on imports.org_platform_connections;
create trigger org_platform_connections_set_updated_at
before update on imports.org_platform_connections
for each row execute procedure public.set_updated_at();

alter table imports.import_runs
  add column if not exists source_platform_key text references imports.import_platforms(key);

update imports.import_runs
set source_platform_key = 'other'
where source_platform_key is null;

alter table imports.import_runs
  alter column source_platform_key set default 'other';

alter table imports.import_runs
  alter column source_platform_key set not null;

create index if not exists import_runs_org_source_platform_created_idx
  on imports.import_runs (org_id, source_platform_key, created_at desc);

commit;
