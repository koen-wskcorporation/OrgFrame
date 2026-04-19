create table if not exists public.org_site_structure_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  parent_id uuid null references public.org_site_structure_items(id) on delete cascade,
  type text not null,
  title text not null,
  slug text not null,
  url_path text not null,
  description text null,
  icon text null,
  show_in_menu boolean not null default true,
  is_published boolean not null default true,
  open_in_new_tab boolean not null default false,
  order_index int not null default 0,
  dynamic_config_json jsonb not null default '{}'::jsonb,
  link_target_json jsonb not null default '{}'::jsonb,
  flags_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.org_site_structure_items
  drop constraint if exists org_site_structure_items_type_check;
alter table public.org_site_structure_items
  add constraint org_site_structure_items_type_check check (type in ('page', 'placeholder', 'dynamic'));

create unique index if not exists org_site_structure_items_org_parent_order_unique_idx
  on public.org_site_structure_items(org_id, parent_id, order_index);

create unique index if not exists org_site_structure_items_org_parent_slug_unique_idx
  on public.org_site_structure_items(org_id, parent_id, slug);

create index if not exists org_site_structure_items_org_parent_idx
  on public.org_site_structure_items(org_id, parent_id, order_index, created_at);

create index if not exists org_site_structure_items_org_type_idx
  on public.org_site_structure_items(org_id, type);

create index if not exists org_site_structure_items_org_url_path_idx
  on public.org_site_structure_items(org_id, url_path);

drop trigger if exists org_site_structure_items_set_updated_at on public.org_site_structure_items;
create trigger org_site_structure_items_set_updated_at before update on public.org_site_structure_items for each row execute procedure public.set_updated_at();

alter table public.org_site_structure_items enable row level security;

drop policy if exists org_site_structure_items_public_or_manager_read on public.org_site_structure_items;
create policy org_site_structure_items_public_or_manager_read on public.org_site_structure_items
  for select
  using (public.has_org_role(org_id, 'manager'));

drop policy if exists org_site_structure_items_manager_insert on public.org_site_structure_items;
create policy org_site_structure_items_manager_insert on public.org_site_structure_items
  for insert
  with check (public.has_org_role(org_id, 'manager'));

drop policy if exists org_site_structure_items_manager_update on public.org_site_structure_items;
create policy org_site_structure_items_manager_update on public.org_site_structure_items
  for update
  using (public.has_org_role(org_id, 'manager'))
  with check (public.has_org_role(org_id, 'manager'));

drop policy if exists org_site_structure_items_manager_delete on public.org_site_structure_items;
create policy org_site_structure_items_manager_delete on public.org_site_structure_items
  for delete
  using (public.has_org_role(org_id, 'manager'));

with migrated as (
  select
    n.id,
    n.org_id,
    n.parent_id,
    case
      when n.source_type <> 'none' then 'dynamic'
      when n.node_kind = 'static_link' and coalesce(n.external_url, '') = '' and coalesce(n.is_clickable, false) = false then 'placeholder'
      else 'page'
    end as type,
    n.label as title,
    coalesce(nullif(n.page_slug, ''),
      case
        when n.node_kind = 'static_link' and coalesce(n.external_url, '') = '' and coalesce(n.is_clickable, false) = false
          then regexp_replace(lower(n.label), '[^a-z0-9]+', '-', 'g')
        when n.source_type = 'programs_tree' then 'programs'
        when n.source_type = 'published_forms' then 'forms'
        when n.source_type = 'published_events' then 'events'
        else regexp_replace(lower(n.label), '[^a-z0-9]+', '-', 'g')
      end
    ) as slug,
    case
      when n.page_slug = 'home' then '/'
      when n.page_slug is not null then '/' || n.page_slug
      when n.external_url is not null and n.external_url <> '' then n.external_url
      when n.source_type = 'programs_tree' then '/programs'
      when n.source_type = 'published_forms' then '/register'
      when n.source_type = 'published_events' then '/events'
      else '/'
    end as url_path,
    null::text as description,
    null::text as icon,
    n.is_visible as show_in_menu,
    case
      when n.page_lifecycle = 'temporary' and n.temporary_window_end_utc is not null and n.temporary_window_end_utc <= now() then false
      else true
    end as is_published,
    false as open_in_new_tab,
    n.sort_index as order_index,
    case
      when n.source_type = 'none' then '{}'::jsonb
      else jsonb_build_object(
        'sourceType', n.source_type,
        'hierarchyMode', case when n.source_type = 'programs_tree' then 'programs_divisions_teams' else 'flat' end,
        'includeEmptyGroups', true,
        'showGeneratedChildrenInMenu', true,
        'rules', coalesce(n.generation_rules_json, '{}'::jsonb),
        'route', coalesce(n.route_behavior_json, '{}'::jsonb)
      )
    end as dynamic_config_json,
    case
      when n.page_slug is not null then jsonb_build_object('kind', 'page', 'pageSlug', n.page_slug)
      when n.external_url is not null and n.external_url <> '' then jsonb_build_object('kind', 'external', 'url', n.external_url)
      when n.source_type <> 'none' then jsonb_build_object('kind', 'dynamic')
      else '{}'::jsonb
    end as link_target_json,
    jsonb_build_object(
      'locked', n.is_system_node,
      'systemGenerated', n.is_system_node,
      'legacyNodeKind', n.node_kind,
      'legacySourceType', n.source_type,
      'legacyChildBehavior', n.child_behavior,
      'legacyLabelBehavior', n.label_behavior,
      'legacyIsClickable', n.is_clickable
    ) as flags_json,
    n.created_at,
    n.updated_at
  from public.org_site_structure_nodes n
)
insert into public.org_site_structure_items (
  id,
  org_id,
  parent_id,
  type,
  title,
  slug,
  url_path,
  description,
  icon,
  show_in_menu,
  is_published,
  open_in_new_tab,
  order_index,
  dynamic_config_json,
  link_target_json,
  flags_json,
  created_at,
  updated_at
)
select
  migrated.id,
  migrated.org_id,
  migrated.parent_id,
  migrated.type,
  migrated.title,
  nullif(trim(both '-' from migrated.slug), '') as slug,
  migrated.url_path,
  migrated.description,
  migrated.icon,
  migrated.show_in_menu,
  migrated.is_published,
  migrated.open_in_new_tab,
  migrated.order_index,
  migrated.dynamic_config_json,
  migrated.link_target_json,
  migrated.flags_json,
  migrated.created_at,
  migrated.updated_at
from migrated
on conflict (id) do update
set
  org_id = excluded.org_id,
  parent_id = excluded.parent_id,
  type = excluded.type,
  title = excluded.title,
  slug = excluded.slug,
  url_path = excluded.url_path,
  description = excluded.description,
  icon = excluded.icon,
  show_in_menu = excluded.show_in_menu,
  is_published = excluded.is_published,
  open_in_new_tab = excluded.open_in_new_tab,
  order_index = excluded.order_index,
  dynamic_config_json = excluded.dynamic_config_json,
  link_target_json = excluded.link_target_json,
  flags_json = excluded.flags_json,
  updated_at = excluded.updated_at;

drop table if exists public.org_site_structure_nodes cascade;
drop table if exists public.org_nav_items cascade;
