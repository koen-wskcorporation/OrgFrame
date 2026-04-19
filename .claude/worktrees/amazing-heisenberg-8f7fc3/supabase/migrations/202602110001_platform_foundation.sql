create extension if not exists pgcrypto;

create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.org_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'manager', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create table if not exists public.org_tool_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  tool_id text not null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, tool_id)
);

create table if not exists public.org_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  tool_id text not null,
  event_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists org_events_org_created_idx on public.org_events (org_id, created_at desc);
create index if not exists org_events_entity_idx on public.org_events (org_id, entity_type, entity_id);

do $$
begin
  if not exists (select 1 from pg_type where typname = 'sponsor_submission_status') then
    create type public.sponsor_submission_status as enum ('submitted', 'approved', 'rejected', 'paid');
  end if;
end
$$;

create table if not exists public.sponsor_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  company_name text not null,
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  website text,
  message text,
  logo_path text,
  status public.sponsor_submission_status not null default 'submitted',
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sponsor_submissions_org_created_idx on public.sponsor_submissions (org_id, created_at desc);
create index if not exists sponsor_submissions_org_status_idx on public.sponsor_submissions (org_id, status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orgs_set_updated_at on public.orgs;
create trigger orgs_set_updated_at before update on public.orgs for each row execute procedure public.set_updated_at();

drop trigger if exists org_memberships_set_updated_at on public.org_memberships;
create trigger org_memberships_set_updated_at before update on public.org_memberships for each row execute procedure public.set_updated_at();

drop trigger if exists org_tool_settings_set_updated_at on public.org_tool_settings;
create trigger org_tool_settings_set_updated_at before update on public.org_tool_settings for each row execute procedure public.set_updated_at();

drop trigger if exists sponsor_submissions_set_updated_at on public.sponsor_submissions;
create trigger sponsor_submissions_set_updated_at before update on public.sponsor_submissions for each row execute procedure public.set_updated_at();

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.org_memberships membership
    where membership.org_id = target_org_id
      and membership.user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(target_org_id uuid, minimum_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with ranked_membership as (
    select
      case membership.role
        when 'member' then 1
        when 'manager' then 2
        when 'admin' then 3
        when 'owner' then 4
        else 0
      end as user_rank,
      case minimum_role
        when 'member' then 1
        when 'manager' then 2
        when 'admin' then 3
        when 'owner' then 4
        else 99
      end as required_rank
    from public.org_memberships membership
    where membership.org_id = target_org_id
      and membership.user_id = auth.uid()
    limit 1
  )
  select exists (
    select 1
    from ranked_membership
    where user_rank >= required_rank
  );
$$;

alter table public.orgs enable row level security;
alter table public.org_memberships enable row level security;
alter table public.org_tool_settings enable row level security;
alter table public.org_events enable row level security;
alter table public.sponsor_submissions enable row level security;

-- Public org metadata is required for public sponsor entrypoints.
drop policy if exists orgs_public_read on public.orgs;
create policy orgs_public_read on public.orgs
  for select
  using (true);

drop policy if exists org_memberships_read_self_or_admin on public.org_memberships;
create policy org_memberships_read_self_or_admin on public.org_memberships
  for select
  using (user_id = auth.uid() or public.has_org_role(org_id, 'admin'));

drop policy if exists org_tool_settings_member_read on public.org_tool_settings;
create policy org_tool_settings_member_read on public.org_tool_settings
  for select
  using (public.is_org_member(org_id));

drop policy if exists org_tool_settings_admin_write on public.org_tool_settings;
create policy org_tool_settings_admin_write on public.org_tool_settings
  for all
  using (public.has_org_role(org_id, 'admin'))
  with check (public.has_org_role(org_id, 'admin'));

drop policy if exists org_events_member_read on public.org_events;
create policy org_events_member_read on public.org_events
  for select
  using (public.is_org_member(org_id));

drop policy if exists org_events_member_insert on public.org_events;
create policy org_events_member_insert on public.org_events
  for insert
  with check (public.is_org_member(org_id));

drop policy if exists sponsor_submissions_member_read on public.sponsor_submissions;
create policy sponsor_submissions_member_read on public.sponsor_submissions
  for select
  using (public.is_org_member(org_id));

drop policy if exists sponsor_submissions_member_insert on public.sponsor_submissions;
create policy sponsor_submissions_member_insert on public.sponsor_submissions
  for insert
  with check (public.is_org_member(org_id));

drop policy if exists sponsor_submissions_manager_update on public.sponsor_submissions;
create policy sponsor_submissions_manager_update on public.sponsor_submissions
  for update
  using (public.has_org_role(org_id, 'manager'))
  with check (public.has_org_role(org_id, 'manager'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sponsor-assets', 'sponsor-assets', false, 10485760, array['image/png', 'image/jpeg', 'image/svg+xml'])
on conflict (id) do nothing;

drop policy if exists sponsor_assets_read_member on storage.objects;
create policy sponsor_assets_read_member on storage.objects
  for select
  using (
    bucket_id = 'sponsor-assets'
    and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
    and public.is_org_member((split_part(name, '/', 1))::uuid)
  );

drop policy if exists sponsor_assets_manage_manager on storage.objects;
create policy sponsor_assets_manage_manager on storage.objects
  for all
  using (
    bucket_id = 'sponsor-assets'
    and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
    and public.has_org_role((split_part(name, '/', 1))::uuid, 'manager')
  )
  with check (
    bucket_id = 'sponsor-assets'
    and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
    and public.has_org_role((split_part(name, '/', 1))::uuid, 'manager')
  );
