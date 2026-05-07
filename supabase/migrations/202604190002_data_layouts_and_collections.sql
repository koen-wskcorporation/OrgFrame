-- Data: per-source dashboard layouts (org-scoped, admin-editable).
create table if not exists orgs.org_data_layouts (
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  source_key text not null,
  config_json jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (org_id, source_key)
);

grant select, insert, update, delete on table orgs.org_data_layouts to authenticated;

alter table orgs.org_data_layouts enable row level security;

drop trigger if exists org_data_layouts_set_updated_at on orgs.org_data_layouts;
create trigger org_data_layouts_set_updated_at
before update on orgs.org_data_layouts
for each row
execute procedure public.set_updated_at();

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

-- Data: user-created, org-scoped saved collections (pinned views with custom filters).
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
