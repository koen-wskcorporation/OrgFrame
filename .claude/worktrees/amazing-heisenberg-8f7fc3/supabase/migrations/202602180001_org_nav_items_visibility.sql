alter table public.org_nav_items
  add column if not exists is_visible boolean not null default true;
