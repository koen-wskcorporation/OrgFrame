begin;

create schema if not exists calendar;

-- Allow API roles to access objects in this schema (table-level privileges/RLS still apply).
grant usage on schema calendar to anon, authenticated, service_role;

-- Move canonical calendar domain tables out of public.
alter table if exists public.calendar_item_sources set schema calendar;
alter table if exists public.calendar_items set schema calendar;
alter table if exists public.calendar_item_rules set schema calendar;
alter table if exists public.calendar_item_occurrences set schema calendar;
alter table if exists public.calendar_item_rule_exceptions set schema calendar;
alter table if exists public.calendar_item_space_allocations set schema calendar;
alter table if exists public.calendar_item_participants set schema calendar;
alter table if exists public.calendar_saved_views set schema calendar;

-- Ensure table privileges for API roles (RLS remains the gatekeeper).
grant select, insert, update, delete on all tables in schema calendar to anon, authenticated;
grant all privileges on all tables in schema calendar to service_role;
grant usage, select on all sequences in schema calendar to anon, authenticated, service_role;

-- Keep future grants aligned.
alter default privileges in schema calendar grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema calendar grant all privileges on tables to service_role;
alter default privileges in schema calendar grant usage, select on sequences to anon, authenticated, service_role;

-- Expose the schema to PostgREST.
do $$
declare
  existing text := coalesce(current_setting('pgrst.db_schemas', true), 'public,storage,graphql_public');
  next_value text;
begin
  if position('calendar' in existing) > 0 then
    next_value := existing;
  else
    next_value := existing || ',calendar';
  end if;

  execute format('alter role authenticator set pgrst.db_schemas = %L', next_value);
end
$$;

notify pgrst, 'reload config';

commit;
