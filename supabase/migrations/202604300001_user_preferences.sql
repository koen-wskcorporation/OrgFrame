create table if not exists people.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

grant select, insert, update, delete on table people.user_preferences to authenticated;

alter table people.user_preferences enable row level security;

drop trigger if exists user_preferences_set_updated_at on people.user_preferences;
create trigger user_preferences_set_updated_at
before update on people.user_preferences
for each row
execute procedure public.set_updated_at();

drop policy if exists user_preferences_select on people.user_preferences;
create policy user_preferences_select
on people.user_preferences
for select
using (auth.uid() = user_id);

drop policy if exists user_preferences_insert on people.user_preferences;
create policy user_preferences_insert
on people.user_preferences
for insert
with check (auth.uid() = user_id);

drop policy if exists user_preferences_update on people.user_preferences;
create policy user_preferences_update
on people.user_preferences
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists user_preferences_delete on people.user_preferences;
create policy user_preferences_delete
on people.user_preferences
for delete
using (auth.uid() = user_id);
