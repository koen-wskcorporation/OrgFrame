create table if not exists public.org_nav_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  parent_id uuid,
  label text not null,
  link_type text not null default 'none' check (link_type in ('none', 'internal', 'external')),
  page_slug text,
  external_url text,
  open_in_new_tab boolean not null default false,
  sort_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id),
  constraint org_nav_items_parent_fk foreign key (parent_id, org_id) references public.org_nav_items (id, org_id) on delete cascade,
  constraint org_nav_items_parent_not_self check (parent_id is null or parent_id <> id),
  constraint org_nav_items_link_shape_check check (
    (link_type = 'none' and page_slug is null and external_url is null and open_in_new_tab = false)
    or (link_type = 'internal' and page_slug is not null and external_url is null and open_in_new_tab = false)
    or (link_type = 'external' and page_slug is null and external_url is not null and char_length(trim(external_url)) > 0)
  )
);

create index if not exists org_nav_items_org_parent_sort_idx on public.org_nav_items (org_id, parent_id, sort_index);
create unique index if not exists org_nav_items_org_sort_unique on public.org_nav_items (org_id, sort_index) where parent_id is null;
create unique index if not exists org_nav_items_parent_sort_unique on public.org_nav_items (parent_id, sort_index) where parent_id is not null;

drop trigger if exists org_nav_items_set_updated_at on public.org_nav_items;
create trigger org_nav_items_set_updated_at before update on public.org_nav_items for each row execute procedure public.set_updated_at();

alter table public.org_nav_items enable row level security;

drop policy if exists org_nav_items_public_read on public.org_nav_items;
create policy org_nav_items_public_read on public.org_nav_items
  for select
  using (true);

drop policy if exists org_nav_items_pages_write_insert on public.org_nav_items;
create policy org_nav_items_pages_write_insert on public.org_nav_items
  for insert
  with check (public.has_org_permission(org_id, 'org.pages.write'));

drop policy if exists org_nav_items_pages_write_update on public.org_nav_items;
create policy org_nav_items_pages_write_update on public.org_nav_items
  for update
  using (public.has_org_permission(org_id, 'org.pages.write'))
  with check (public.has_org_permission(org_id, 'org.pages.write'));

drop policy if exists org_nav_items_pages_write_delete on public.org_nav_items;
create policy org_nav_items_pages_write_delete on public.org_nav_items
  for delete
  using (public.has_org_permission(org_id, 'org.pages.write'));
