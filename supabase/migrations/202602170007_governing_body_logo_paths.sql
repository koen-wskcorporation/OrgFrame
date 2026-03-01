alter table public.governing_bodies
  add column if not exists logo_path text;

update public.governing_bodies
set logo_path = coalesce(
  nullif(regexp_replace(coalesce(logo_url, ''), '^.*/', ''), ''),
  slug || '-seal.svg'
)
where logo_path is null;

alter table public.governing_bodies
  alter column logo_path set not null;
