begin;

-- Ensure PostgREST exposes all active domain schemas after dropping core.
do $$
declare
  s text;
  required_schemas text[] := array[
    'calendar',
    'orgs',
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
  existing text := coalesce(current_setting('pgrst.db_schemas', true), 'public,storage,graphql_public');
  exposed text[];
  next_value text;
begin
  exposed := string_to_array(existing, ',');

  -- Drop removed schema if still present.
  next_value := (
    select string_agg(trimmed, ',')
    from (
      select btrim(value) as trimmed
      from unnest(exposed) as t(value)
      where btrim(value) <> ''
        and btrim(value) <> 'core'
      group by btrim(value)
      order by min(array_position(exposed, value))
    ) filtered
  );

  if next_value is null or next_value = '' then
    next_value := 'public,storage,graphql_public';
  end if;

  exposed := string_to_array(next_value, ',');

  foreach s in array required_schemas loop
    if not exists (select 1 from unnest(exposed) as x(v) where btrim(v) = s) then
      next_value := next_value || ',' || s;
      exposed := string_to_array(next_value, ',');
    end if;
  end loop;

  execute format('alter role authenticator set pgrst.db_schemas = %L', next_value);
end
$$;

notify pgrst, 'reload config';

commit;
