begin;

create table if not exists public.org_custom_domains (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  domain text not null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'failed')),
  verification_token text not null,
  verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id),
  unique (domain)
);

create index if not exists org_custom_domains_status_updated_idx
  on public.org_custom_domains (status, updated_at desc);

create index if not exists org_custom_domains_org_idx
  on public.org_custom_domains (org_id);

create unique index if not exists org_custom_domains_domain_lower_unique
  on public.org_custom_domains (lower(domain));

drop trigger if exists org_custom_domains_set_updated_at on public.org_custom_domains;
create trigger org_custom_domains_set_updated_at
before update on public.org_custom_domains
for each row execute procedure public.set_updated_at();

create or replace function public.resolve_org_slug_for_domain(target_domain text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select org.slug
  from public.org_custom_domains domain
  join public.orgs org on org.id = domain.org_id
  where domain.status = 'verified'
    and lower(domain.domain) = lower(trim(target_domain))
  limit 1;
$$;

revoke all on function public.resolve_org_slug_for_domain(text) from public;
grant execute on function public.resolve_org_slug_for_domain(text) to anon;
grant execute on function public.resolve_org_slug_for_domain(text) to authenticated;

alter table public.org_custom_domains enable row level security;

drop policy if exists org_custom_domains_manage_read on public.org_custom_domains;
create policy org_custom_domains_manage_read on public.org_custom_domains
  for select
  using (public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists org_custom_domains_manage_insert on public.org_custom_domains;
create policy org_custom_domains_manage_insert on public.org_custom_domains
  for insert
  with check (public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists org_custom_domains_manage_update on public.org_custom_domains;
create policy org_custom_domains_manage_update on public.org_custom_domains
  for update
  using (public.has_org_permission(org_id, 'org.manage.read'))
  with check (public.has_org_permission(org_id, 'org.manage.read'));

drop policy if exists org_custom_domains_manage_delete on public.org_custom_domains;
create policy org_custom_domains_manage_delete on public.org_custom_domains
  for delete
  using (public.has_org_permission(org_id, 'org.manage.read'));

commit;
