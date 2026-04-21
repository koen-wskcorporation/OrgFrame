-- Follow-up: rename data-center layouts → data layouts, and add user-owned saved collections.

-- 1) Rename the layouts table + its trigger + its policies.
do $$
begin
  if to_regclass('orgs.org_data_center_layouts') is not null
     and to_regclass('orgs.org_data_layouts') is null then
    execute 'alter table orgs.org_data_center_layouts rename to org_data_layouts';
  end if;
end
$$;

-- Rename trigger if it still has the old name.
do $$
begin
  if exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'orgs'
      and c.relname = 'org_data_layouts'
      and t.tgname = 'org_data_center_layouts_set_updated_at'
  ) then
    execute 'alter trigger org_data_center_layouts_set_updated_at on orgs.org_data_layouts rename to org_data_layouts_set_updated_at';
  end if;
end
$$;

-- Ensure trigger exists with the new name even if migration is re-run fresh.
drop trigger if exists org_data_layouts_set_updated_at on orgs.org_data_layouts;
create trigger org_data_layouts_set_updated_at
before update on orgs.org_data_layouts
for each row
execute procedure public.set_updated_at();

-- Drop old-named policies and recreate with new names.
drop policy if exists org_data_center_layouts_select on orgs.org_data_layouts;
drop policy if exists org_data_center_layouts_insert on orgs.org_data_layouts;
drop policy if exists org_data_center_layouts_update on orgs.org_data_layouts;
drop policy if exists org_data_center_layouts_delete on orgs.org_data_layouts;

drop policy if exists org_data_layouts_select on orgs.org_data_layouts;
create policy org_data_layouts_select
on orgs.org_data_layouts
for select
using (
  exists (
    select 1 from orgs.memberships m
    where m.org_id = orgs.org_data_layouts.org_id
      and m.user_id = auth.uid()
  )
);

drop policy if exists org_data_layouts_write on orgs.org_data_layouts;
create policy org_data_layouts_write
on orgs.org_data_layouts
for all
using (
  exists (
    select 1 from orgs.memberships m
    where m.org_id = orgs.org_data_layouts.org_id
      and m.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from orgs.memberships m
    where m.org_id = orgs.org_data_layouts.org_id
      and m.user_id = auth.uid()
  )
);

-- 2) New table: user-created pinned data collections (saved filtered views).
create table if not exists orgs.org_data_collections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  description text,
  source_key text not null,
  table_key text,
  filters_json jsonb not null default '[]'::jsonb,
  sort_json jsonb,
  pinned boolean not null default true,
  sort_index integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists org_data_collections_org_pinned_idx
  on orgs.org_data_collections (org_id, pinned, sort_index);

grant select, insert, update, delete on table orgs.org_data_collections to authenticated;

alter table orgs.org_data_collections enable row level security;

drop trigger if exists org_data_collections_set_updated_at on orgs.org_data_collections;
create trigger org_data_collections_set_updated_at
before update on orgs.org_data_collections
for each row
execute procedure public.set_updated_at();

drop policy if exists org_data_collections_select on orgs.org_data_collections;
create policy org_data_collections_select
on orgs.org_data_collections
for select
using (
  exists (
    select 1 from orgs.memberships m
    where m.org_id = orgs.org_data_collections.org_id
      and m.user_id = auth.uid()
  )
);

drop policy if exists org_data_collections_write on orgs.org_data_collections;
create policy org_data_collections_write
on orgs.org_data_collections
for all
using (
  exists (
    select 1 from orgs.memberships m
    where m.org_id = orgs.org_data_collections.org_id
      and m.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from orgs.memberships m
    where m.org_id = orgs.org_data_collections.org_id
      and m.user_id = auth.uid()
  )
);
