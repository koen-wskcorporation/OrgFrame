alter table public.org_pages
  add column if not exists page_lifecycle text not null default 'permanent',
  add column if not exists temporary_window_start_utc timestamptz,
  add column if not exists temporary_window_end_utc timestamptz;

alter table public.org_pages
  drop constraint if exists org_pages_page_lifecycle_check;
alter table public.org_pages
  add constraint org_pages_page_lifecycle_check check (page_lifecycle in ('permanent', 'temporary'));

create table if not exists public.org_site_structure_nodes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  parent_id uuid null references public.org_site_structure_nodes(id) on delete cascade,
  sort_index int not null default 0,
  label text not null,
  node_kind text not null,
  page_slug text null,
  external_url text null,
  page_lifecycle text not null default 'permanent',
  source_type text not null default 'none',
  source_scope_json jsonb not null default '{}'::jsonb,
  generation_rules_json jsonb not null default '{}'::jsonb,
  child_behavior text not null default 'manual',
  route_behavior_json jsonb not null default '{}'::jsonb,
  label_behavior text not null default 'manual',
  temporary_window_start_utc timestamptz null,
  temporary_window_end_utc timestamptz null,
  is_clickable boolean not null default true,
  is_visible boolean not null default true,
  is_system_node boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.org_site_structure_nodes
  drop constraint if exists org_site_structure_nodes_node_kind_check;
alter table public.org_site_structure_nodes
  add constraint org_site_structure_nodes_node_kind_check check (node_kind in ('static_page', 'static_link', 'dynamic_page', 'dynamic_link', 'system_generated'));

alter table public.org_site_structure_nodes
  drop constraint if exists org_site_structure_nodes_page_lifecycle_check;
alter table public.org_site_structure_nodes
  add constraint org_site_structure_nodes_page_lifecycle_check check (page_lifecycle in ('permanent', 'temporary'));

alter table public.org_site_structure_nodes
  drop constraint if exists org_site_structure_nodes_source_type_check;
alter table public.org_site_structure_nodes
  add constraint org_site_structure_nodes_source_type_check check (source_type in ('none', 'programs_tree', 'published_forms', 'published_events'));

alter table public.org_site_structure_nodes
  drop constraint if exists org_site_structure_nodes_child_behavior_check;
alter table public.org_site_structure_nodes
  add constraint org_site_structure_nodes_child_behavior_check check (child_behavior in ('manual', 'generated_locked', 'generated_with_manual_overrides'));

alter table public.org_site_structure_nodes
  drop constraint if exists org_site_structure_nodes_label_behavior_check;
alter table public.org_site_structure_nodes
  add constraint org_site_structure_nodes_label_behavior_check check (label_behavior in ('manual', 'source_name'));

create unique index if not exists org_site_structure_nodes_org_sort_unique_idx
  on public.org_site_structure_nodes(org_id, parent_id, sort_index);

create index if not exists org_site_structure_nodes_org_parent_idx
  on public.org_site_structure_nodes(org_id, parent_id, sort_index, created_at);

create index if not exists org_site_structure_nodes_org_source_idx
  on public.org_site_structure_nodes(org_id, source_type);

create index if not exists org_site_structure_nodes_org_slug_idx
  on public.org_site_structure_nodes(org_id, page_slug)
  where page_slug is not null;

drop trigger if exists org_site_structure_nodes_set_updated_at on public.org_site_structure_nodes;
create trigger org_site_structure_nodes_set_updated_at before update on public.org_site_structure_nodes for each row execute procedure public.set_updated_at();

alter table public.org_site_structure_nodes enable row level security;

drop policy if exists org_site_structure_nodes_public_or_manager_read on public.org_site_structure_nodes;
create policy org_site_structure_nodes_public_or_manager_read on public.org_site_structure_nodes
  for select
  using (public.has_org_role(org_id, 'manager'));

drop policy if exists org_site_structure_nodes_manager_insert on public.org_site_structure_nodes;
create policy org_site_structure_nodes_manager_insert on public.org_site_structure_nodes
  for insert
  with check (public.has_org_role(org_id, 'manager'));

drop policy if exists org_site_structure_nodes_manager_update on public.org_site_structure_nodes;
create policy org_site_structure_nodes_manager_update on public.org_site_structure_nodes
  for update
  using (public.has_org_role(org_id, 'manager'))
  with check (public.has_org_role(org_id, 'manager'));

drop policy if exists org_site_structure_nodes_manager_delete on public.org_site_structure_nodes;
create policy org_site_structure_nodes_manager_delete on public.org_site_structure_nodes
  for delete
  using (public.has_org_role(org_id, 'manager'));

with seeded as (
  select
    nav.id,
    nav.org_id,
    nav.parent_id,
    nav.sort_index,
    nav.label,
    nav.link_type,
    nav.page_slug,
    nav.external_url,
    nav.is_visible,
    row_number() over (partition by nav.org_id, nav.parent_id order by nav.sort_index, nav.created_at, nav.id) - 1 as next_sort_index
  from public.org_nav_items nav
  where not exists (
    select 1
    from public.org_site_structure_nodes node
    where node.org_id = nav.org_id
  )
)
insert into public.org_site_structure_nodes (
  id,
  org_id,
  parent_id,
  sort_index,
  label,
  node_kind,
  page_slug,
  external_url,
  is_visible,
  is_clickable,
  source_type,
  child_behavior
)
select
  seeded.id,
  seeded.org_id,
  seeded.parent_id,
  seeded.next_sort_index,
  seeded.label,
  case
    when seeded.link_type = 'internal' then 'static_page'
    when seeded.link_type = 'external' then 'static_link'
    else 'static_link'
  end,
  case when seeded.link_type = 'internal' then seeded.page_slug else null end,
  case when seeded.link_type = 'external' then seeded.external_url else null end,
  seeded.is_visible,
  seeded.link_type <> 'none',
  'none',
  'manual'
from seeded
on conflict (id) do nothing;
