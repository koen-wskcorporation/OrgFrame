alter table public.orgs
  add column if not exists features_json jsonb not null default '{}'::jsonb;

update public.orgs
set features_json = '{}'::jsonb
where features_json is null;
