create table if not exists people.user_dashboard_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  config_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

grant select, insert, update on table people.user_dashboard_preferences to authenticated;

alter table people.user_dashboard_preferences enable row level security;

drop trigger if exists user_dashboard_preferences_set_updated_at on people.user_dashboard_preferences;
create trigger user_dashboard_preferences_set_updated_at
before update on people.user_dashboard_preferences
for each row
execute procedure public.set_updated_at();

drop policy if exists user_dashboard_preferences_select on people.user_dashboard_preferences;
create policy user_dashboard_preferences_select
on people.user_dashboard_preferences
for select
using (auth.uid() = user_id);

drop policy if exists user_dashboard_preferences_insert on people.user_dashboard_preferences;
create policy user_dashboard_preferences_insert
on people.user_dashboard_preferences
for insert
with check (auth.uid() = user_id);

drop policy if exists user_dashboard_preferences_update on people.user_dashboard_preferences;
create policy user_dashboard_preferences_update
on people.user_dashboard_preferences
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
