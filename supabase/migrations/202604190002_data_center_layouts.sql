-- Data Center: per-source dashboard layouts (org-scoped, admin-only)
create table if not exists orgs.org_data_center_layouts (
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  source_key text not null,
  config_json jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (org_id, source_key)
);

grant select, insert, update, delete on table orgs.org_data_center_layouts to authenticated;

alter table orgs.org_data_center_layouts enable row level security;

drop trigger if exists org_data_center_layouts_set_updated_at on orgs.org_data_center_layouts;
create trigger org_data_center_layouts_set_updated_at
before update on orgs.org_data_center_layouts
for each row
execute procedure public.set_updated_at();

-- Only users with membership in the org can read/write these layouts.
-- App layer further gates on data-center.read / data-center.write permissions.
drop policy if exists org_data_center_layouts_select on orgs.org_data_center_layouts;
create policy org_data_center_layouts_select
on orgs.org_data_center_layouts
for select
using (
  exists (
    select 1 from orgs.memberships m
    where m.org_id = orgs.org_data_center_layouts.org_id
      and m.user_id = auth.uid()
  )
);

drop policy if exists org_data_center_layouts_insert on orgs.org_data_center_layouts;
create policy org_data_center_layouts_insert
on orgs.org_data_center_layouts
for insert
with check (
  exists (
    select 1 from orgs.memberships m
    where m.org_id = orgs.org_data_center_layouts.org_id
      and m.user_id = auth.uid()
  )
);

drop policy if exists org_data_center_layouts_update on orgs.org_data_center_layouts;
create policy org_data_center_layouts_update
on orgs.org_data_center_layouts
for update
using (
  exists (
    select 1 from orgs.memberships m
    where m.org_id = orgs.org_data_center_layouts.org_id
      and m.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from orgs.memberships m
    where m.org_id = orgs.org_data_center_layouts.org_id
      and m.user_id = auth.uid()
  )
);

drop policy if exists org_data_center_layouts_delete on orgs.org_data_center_layouts;
create policy org_data_center_layouts_delete
on orgs.org_data_center_layouts
for delete
using (
  exists (
    select 1 from orgs.memberships m
    where m.org_id = orgs.org_data_center_layouts.org_id
      and m.user_id = auth.uid()
  )
);
