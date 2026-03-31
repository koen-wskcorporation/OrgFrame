begin;

-- 1) Move custom domains out of site schema and remove org_ prefix.
alter table if exists site.org_custom_domains set schema orgs;
alter table if exists orgs.org_custom_domains rename to custom_domains;

create or replace function public.resolve_org_slug_for_domain(target_domain text)
returns text
language sql
stable
security definer
set search_path = public, orgs
as $$
  select org.slug
  from orgs.custom_domains domain
  join orgs.orgs org on org.id = domain.org_id
  where domain.status = 'verified'
    and lower(domain.domain) = lower(trim(target_domain))
  limit 1;
$$;

revoke all on function public.resolve_org_slug_for_domain(text) from public;
grant execute on function public.resolve_org_slug_for_domain(text) to anon;
grant execute on function public.resolve_org_slug_for_domain(text) to authenticated;

-- 2) Remove site_ table prefixes and merge structure items into blocks.
alter table if exists site.site_pages rename to pages;
alter table if exists site.site_page_blocks rename to blocks;

alter table if exists site.blocks
  add column if not exists row_kind text,
  add column if not exists org_id uuid,
  add column if not exists parent_id uuid,
  add column if not exists title text,
  add column if not exists slug text,
  add column if not exists url_path text,
  add column if not exists description text,
  add column if not exists icon text,
  add column if not exists show_in_menu boolean,
  add column if not exists is_published boolean,
  add column if not exists open_in_new_tab boolean,
  add column if not exists order_index integer,
  add column if not exists dynamic_config_json jsonb,
  add column if not exists link_target_json jsonb,
  add column if not exists flags_json jsonb;

-- Legacy page-block columns must allow nulls for structure rows in merged table.
alter table if exists site.blocks
  alter column site_page_id drop not null,
  alter column org_page_id drop not null;

update site.blocks
set
  row_kind = coalesce(row_kind, 'page_block'),
  show_in_menu = coalesce(show_in_menu, true),
  is_published = coalesce(is_published, true),
  open_in_new_tab = coalesce(open_in_new_tab, false),
  order_index = coalesce(order_index, sort_index, 0),
  dynamic_config_json = coalesce(dynamic_config_json, '{}'::jsonb),
  link_target_json = coalesce(link_target_json, '{}'::jsonb),
  flags_json = coalesce(flags_json, '{}'::jsonb)
where row_kind is null
   or show_in_menu is null
   or is_published is null
   or open_in_new_tab is null
   or order_index is null
   or dynamic_config_json is null
   or link_target_json is null
   or flags_json is null;

alter table site.blocks
  alter column row_kind set default 'page_block',
  alter column row_kind set not null,
  alter column show_in_menu set default true,
  alter column show_in_menu set not null,
  alter column is_published set default true,
  alter column is_published set not null,
  alter column open_in_new_tab set default false,
  alter column open_in_new_tab set not null,
  alter column order_index set default 0,
  alter column order_index set not null,
  alter column dynamic_config_json set default '{}'::jsonb,
  alter column dynamic_config_json set not null,
  alter column link_target_json set default '{}'::jsonb,
  alter column link_target_json set not null,
  alter column flags_json set default '{}'::jsonb,
  alter column flags_json set not null;

alter table site.blocks
  drop constraint if exists blocks_row_kind_check;
alter table site.blocks
  add constraint blocks_row_kind_check check (row_kind in ('page_block', 'structure_item'));

-- Backfill org_id on page blocks so RLS can use one table.
update site.blocks block
set org_id = page.org_id
from site.pages page
where block.row_kind = 'page_block'
  and block.org_page_id = page.id
  and (block.org_id is null or block.org_id <> page.org_id);

-- Fold org_site_structure_items into site.blocks as structure_item rows.
insert into site.blocks (
  id,
  row_kind,
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
  sort_index,
  dynamic_config_json,
  link_target_json,
  flags_json,
  created_at,
  updated_at
)
select
  item.id,
  'structure_item',
  item.org_id,
  item.parent_id,
  item.type,
  item.title,
  item.slug,
  item.url_path,
  item.description,
  item.icon,
  item.show_in_menu,
  item.is_published,
  item.open_in_new_tab,
  item.order_index,
  item.order_index,
  item.dynamic_config_json,
  item.link_target_json,
  item.flags_json,
  item.created_at,
  item.updated_at
from site.org_site_structure_items item
on conflict (id) do update
set
  row_kind = excluded.row_kind,
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
  sort_index = excluded.sort_index,
  dynamic_config_json = excluded.dynamic_config_json,
  link_target_json = excluded.link_target_json,
  flags_json = excluded.flags_json,
  updated_at = excluded.updated_at;

-- Keep relational integrity for structure rows inside merged table.
alter table site.blocks
  drop constraint if exists blocks_parent_id_fkey;
alter table site.blocks
  add constraint blocks_parent_id_fkey foreign key (parent_id) references site.blocks(id) on delete cascade;

-- Helpful indexes across merged workloads.
create index if not exists blocks_page_org_page_sort_idx
  on site.blocks (org_page_id, sort_index)
  where row_kind = 'page_block';

create index if not exists blocks_structure_org_parent_idx
  on site.blocks (org_id, parent_id, order_index, created_at)
  where row_kind = 'structure_item';

create unique index if not exists blocks_structure_org_parent_order_uidx
  on site.blocks (org_id, parent_id, order_index)
  where row_kind = 'structure_item';

create unique index if not exists blocks_structure_org_parent_slug_uidx
  on site.blocks (org_id, parent_id, slug)
  where row_kind = 'structure_item';

create index if not exists blocks_structure_org_url_path_idx
  on site.blocks (org_id, url_path)
  where row_kind = 'structure_item';

-- Rebuild RLS for merged blocks table.
alter table if exists site.blocks enable row level security;

drop policy if exists site_page_blocks_public_read on site.blocks;
drop policy if exists site_page_blocks_member_read on site.blocks;
drop policy if exists site_page_blocks_member_write on site.blocks;
drop policy if exists org_site_structure_items_public_or_manager_read on site.blocks;
drop policy if exists org_site_structure_items_manager_insert on site.blocks;
drop policy if exists org_site_structure_items_manager_update on site.blocks;
drop policy if exists org_site_structure_items_manager_delete on site.blocks;
drop policy if exists site_blocks_public_read on site.blocks;
drop policy if exists site_blocks_member_read on site.blocks;
drop policy if exists site_blocks_member_write on site.blocks;

create policy site_blocks_public_read
on site.blocks
for select
to anon, authenticated
using (
  row_kind = 'page_block'
  and exists (
    select 1
    from site.pages page
    where page.id = blocks.org_page_id
      and (page.status = 'published' or page.is_published = true)
  )
);

create policy site_blocks_member_read
on site.blocks
for select
to authenticated
using (
  (
    row_kind = 'page_block'
    and exists (
      select 1
      from site.pages page
      join orgs.memberships membership
        on membership.org_id = page.org_id
      where page.id = blocks.org_page_id
        and membership.user_id = auth.uid()
    )
  )
  or (
    row_kind = 'structure_item'
    and public.has_org_role(org_id, 'manager')
  )
);

create policy site_blocks_member_write
on site.blocks
for all
to authenticated
using (
  (
    row_kind = 'page_block'
    and exists (
      select 1
      from site.pages page
      join orgs.memberships membership
        on membership.org_id = page.org_id
      where page.id = blocks.org_page_id
        and membership.user_id = auth.uid()
    )
  )
  or (
    row_kind = 'structure_item'
    and public.has_org_role(org_id, 'manager')
  )
)
with check (
  (
    row_kind = 'page_block'
    and exists (
      select 1
      from site.pages page
      join orgs.memberships membership
        on membership.org_id = page.org_id
      where page.id = blocks.org_page_id
        and membership.user_id = auth.uid()
    )
  )
  or (
    row_kind = 'structure_item'
    and public.has_org_role(org_id, 'manager')
  )
);

-- Decommission no-longer-used structure tables.
drop table if exists site.org_site_structure_items cascade;
drop table if exists site.site_structure_nodes cascade;

commit;
