create table if not exists people.user_org_dashboard_layouts (
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, org_id)
);

grant select, insert, update, delete on table people.user_org_dashboard_layouts to authenticated;

alter table people.user_org_dashboard_layouts enable row level security;

drop trigger if exists user_org_dashboard_layouts_set_updated_at on people.user_org_dashboard_layouts;
create trigger user_org_dashboard_layouts_set_updated_at
before update on people.user_org_dashboard_layouts
for each row
execute procedure public.set_updated_at();

drop policy if exists user_org_dashboard_layouts_select on people.user_org_dashboard_layouts;
create policy user_org_dashboard_layouts_select
on people.user_org_dashboard_layouts
for select
using (auth.uid() = user_id);

drop policy if exists user_org_dashboard_layouts_insert on people.user_org_dashboard_layouts;
create policy user_org_dashboard_layouts_insert
on people.user_org_dashboard_layouts
for insert
with check (auth.uid() = user_id);

drop policy if exists user_org_dashboard_layouts_update on people.user_org_dashboard_layouts;
create policy user_org_dashboard_layouts_update
on people.user_org_dashboard_layouts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists user_org_dashboard_layouts_delete on people.user_org_dashboard_layouts;
create policy user_org_dashboard_layouts_delete
on people.user_org_dashboard_layouts
for delete
using (auth.uid() = user_id);
