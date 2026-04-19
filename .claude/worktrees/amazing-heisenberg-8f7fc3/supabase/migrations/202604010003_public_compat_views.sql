begin;

do $$
declare
  mapping record;
  target_kind "char";
begin
  for mapping in
    select *
    from (
      values
        ('programs', 'programs'),
        ('programs', 'program_structure_nodes'),
        ('programs', 'program_registrations'),
        ('programs', 'program_schedule_blocks'),
        ('programs', 'program_schedule_rules'),
        ('programs', 'program_schedule_exceptions'),
        ('programs', 'program_occurrences'),
        ('programs', 'program_teams'),
        ('programs', 'program_team_members'),
        ('programs', 'program_team_staff'),
        ('forms', 'org_forms'),
        ('forms', 'org_form_versions'),
        ('forms', 'org_form_submissions'),
        ('forms', 'org_form_submission_players'),
        ('forms', 'org_form_submission_views'),
        ('forms', 'org_form_google_sheet_integrations'),
        ('forms', 'org_form_google_sheet_outbox'),
        ('forms', 'org_form_google_sheet_sync_runs')
    ) as refs(schema_name, table_name)
  loop
    if to_regclass(format('%I.%I', mapping.schema_name, mapping.table_name)) is null then
      continue;
    end if;

    select c.relkind
    into target_kind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = mapping.table_name
    limit 1;

    if target_kind is null then
      execute format(
        'create view public.%I as select * from %I.%I',
        mapping.table_name,
        mapping.schema_name,
        mapping.table_name
      );
    elsif target_kind = 'v' then
      execute format(
        'create or replace view public.%I as select * from %I.%I',
        mapping.table_name,
        mapping.schema_name,
        mapping.table_name
      );
    end if;
  end loop;
end
$$;

commit;
