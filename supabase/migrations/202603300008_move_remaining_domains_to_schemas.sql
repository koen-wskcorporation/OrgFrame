begin;

-- Domain schemas
create schema if not exists core;
create schema if not exists ai;
create schema if not exists people;
create schema if not exists programs;
create schema if not exists forms;
create schema if not exists facilities;
create schema if not exists site;
create schema if not exists files;
create schema if not exists communications;
create schema if not exists commerce;
create schema if not exists imports;
create schema if not exists notifications;

-- Core
alter table if exists public.governing_bodies set schema core;
alter table if exists public.orgs set schema core;
alter table if exists public.org_memberships set schema core;
alter table if exists public.org_custom_roles set schema core;
alter table if exists public.org_tool_settings set schema core;
alter table if exists public.audit_logs set schema core;
alter table if exists public.user_profiles set schema core;

-- AI
alter table if exists public.ai_rate_limit_windows set schema ai;

-- People
alter table if exists public.players set schema people;
alter table if exists public.player_guardians set schema people;

-- Programs
alter table if exists public.programs set schema programs;
alter table if exists public.program_structure_nodes set schema programs;
alter table if exists public.program_registrations set schema programs;
alter table if exists public.program_schedule_blocks set schema programs;
alter table if exists public.program_schedule_rules set schema programs;
alter table if exists public.program_schedule_exceptions set schema programs;
alter table if exists public.program_occurrences set schema programs;
alter table if exists public.program_teams set schema programs;
alter table if exists public.program_team_members set schema programs;
alter table if exists public.program_team_staff set schema programs;

-- Forms
alter table if exists public.org_forms set schema forms;
alter table if exists public.org_form_versions set schema forms;
alter table if exists public.org_form_submissions set schema forms;
alter table if exists public.org_form_submission_players set schema forms;
alter table if exists public.org_form_submission_views set schema forms;
alter table if exists public.org_form_google_sheet_integrations set schema forms;
alter table if exists public.org_form_google_sheet_outbox set schema forms;
alter table if exists public.org_form_google_sheet_sync_runs set schema forms;

-- Facilities
alter table if exists public.facilities set schema facilities;
alter table if exists public.facility_layout_nodes set schema facilities;
alter table if exists public.facility_spaces set schema facilities;
alter table if exists public.facility_space_configurations set schema facilities;
alter table if exists public.facility_reservation_rules set schema facilities;
alter table if exists public.facility_reservations set schema facilities;
alter table if exists public.facility_reservation_exceptions set schema facilities;
alter table if exists public.org_space_types set schema facilities;

-- Site
alter table if exists public.site_pages set schema site;
alter table if exists public.site_page_blocks set schema site;
alter table if exists public.site_structure_nodes set schema site;
alter table if exists public.org_site_structure_items set schema site;
alter table if exists public.org_custom_domains set schema site;

-- Files
alter table if exists public.app_file_folders set schema files;
alter table if exists public.app_files set schema files;

-- Communications
alter table if exists public.org_comm_channel_identities set schema communications;
alter table if exists public.org_comm_channel_integration_secrets set schema communications;
alter table if exists public.org_comm_channel_integrations set schema communications;
alter table if exists public.org_comm_contact_merge_audit set schema communications;
alter table if exists public.org_comm_contacts set schema communications;
alter table if exists public.org_comm_conversations set schema communications;
alter table if exists public.org_comm_match_suggestions set schema communications;
alter table if exists public.org_comm_messages set schema communications;
alter table if exists public.org_comm_resolution_events set schema communications;

-- Commerce
alter table if exists public.org_orders set schema commerce;
alter table if exists public.org_order_items set schema commerce;
alter table if exists public.org_order_payments set schema commerce;
alter table if exists public.sponsor_submissions set schema commerce;

-- Imports
alter table if exists public.sportsconnect_import_runs set schema imports;
alter table if exists public.sportsconnect_import_rows set schema imports;
alter table if exists public.sportsconnect_import_applied_rows set schema imports;

-- Notifications
alter table if exists public.user_notifications set schema notifications;

-- Grants/default privileges + PostgREST exposure for all domain schemas.
do $$
declare
  s text;
  schemas text[] := array[
    'calendar',
    'core',
    'ai',
    'people',
    'programs',
    'forms',
    'facilities',
    'site',
    'files',
    'communications',
    'commerce',
    'imports',
    'notifications'
  ];
  exposed text[];
  existing text := coalesce(current_setting('pgrst.db_schemas', true), 'public,storage,graphql_public');
  next_value text;
begin
  foreach s in array schemas loop
    execute format('grant usage on schema %I to anon, authenticated, service_role', s);
    execute format('grant select, insert, update, delete on all tables in schema %I to anon, authenticated', s);
    execute format('grant all privileges on all tables in schema %I to service_role', s);
    execute format('grant usage, select on all sequences in schema %I to anon, authenticated, service_role', s);

    execute format('alter default privileges in schema %I grant select, insert, update, delete on tables to anon, authenticated', s);
    execute format('alter default privileges in schema %I grant all privileges on tables to service_role', s);
    execute format('alter default privileges in schema %I grant usage, select on sequences to anon, authenticated, service_role', s);
  end loop;

  exposed := string_to_array(existing, ',');
  foreach s in array schemas loop
    if not exists (select 1 from unnest(exposed) as x(v) where btrim(v) = s) then
      existing := existing || ',' || s;
      exposed := string_to_array(existing, ',');
    end if;
  end loop;

  next_value := existing;
  execute format('alter role authenticator set pgrst.db_schemas = %L', next_value);
end
$$;

notify pgrst, 'reload config';

commit;
