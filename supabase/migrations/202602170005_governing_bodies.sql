create table if not exists public.governing_bodies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  logo_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists governing_bodies_set_updated_at on public.governing_bodies;
create trigger governing_bodies_set_updated_at before update on public.governing_bodies for each row execute procedure public.set_updated_at();

alter table public.governing_bodies enable row level security;

drop policy if exists governing_bodies_public_read on public.governing_bodies;
create policy governing_bodies_public_read on public.governing_bodies
  for select
  using (true);

alter table public.orgs
  add column if not exists governing_body_id uuid references public.governing_bodies(id) on delete set null;

create index if not exists orgs_governing_body_id_idx on public.orgs (governing_body_id);

insert into public.governing_bodies (slug, name, logo_url)
values
  ('little-league', 'Little League', '/governing-bodies/little-league-seal.svg'),
  ('usssa', 'USSSA', '/governing-bodies/usssa-seal.svg'),
  ('aau', 'AAU', '/governing-bodies/aau-seal.svg')
on conflict (slug) do update
set
  name = excluded.name,
  logo_url = excluded.logo_url;
