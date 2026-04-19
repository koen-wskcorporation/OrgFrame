begin;

-- Flatten single configuration fields onto facilities.spaces.
alter table if exists facilities.spaces
  add column if not exists config_name text,
  add column if not exists config_slug text,
  add column if not exists config_capacity_teams integer,
  add column if not exists config_is_active boolean,
  add column if not exists config_sort_index integer,
  add column if not exists config_metadata_json jsonb,
  add column if not exists config_created_by uuid references auth.users(id) on delete set null,
  add column if not exists config_updated_by uuid references auth.users(id) on delete set null,
  add column if not exists config_created_at timestamptz,
  add column if not exists config_updated_at timestamptz;

-- Backfill from the first active/lowest-sort configuration per space.
do $$
begin
  if to_regclass('facilities.space_configurations') is not null then
    with ranked as (
      select
        c.*,
        row_number() over (
          partition by c.space_id
          order by c.is_active desc, c.sort_index asc, c.created_at asc
        ) as rn
      from facilities.space_configurations c
    )
    update facilities.spaces s
    set
      config_name = r.name,
      config_slug = r.slug,
      config_capacity_teams = r.capacity_teams,
      config_is_active = r.is_active,
      config_sort_index = r.sort_index,
      config_metadata_json = coalesce(r.metadata_json, '{}'::jsonb),
      config_created_by = r.created_by,
      config_updated_by = r.updated_by,
      config_created_at = r.created_at,
      config_updated_at = r.updated_at
    from ranked r
    where r.rn = 1
      and r.space_id = s.id;
  end if;
end
$$;

-- Ensure defaults for spaces that had no configuration row.
update facilities.spaces
set
  config_name = coalesce(config_name, 'Default'),
  config_slug = coalesce(config_slug, slug || '-default'),
  config_is_active = coalesce(config_is_active, true),
  config_sort_index = coalesce(config_sort_index, 0),
  config_metadata_json = coalesce(config_metadata_json, '{}'::jsonb),
  config_created_at = coalesce(config_created_at, created_at),
  config_updated_at = coalesce(config_updated_at, updated_at)
where
  config_name is null
  or config_slug is null
  or config_is_active is null
  or config_sort_index is null
  or config_metadata_json is null
  or config_created_at is null
  or config_updated_at is null;

alter table facilities.spaces
  alter column config_name set not null,
  alter column config_slug set not null,
  alter column config_is_active set not null,
  alter column config_sort_index set not null,
  alter column config_metadata_json set not null,
  alter column config_created_at set not null,
  alter column config_updated_at set not null,
  alter column config_name set default 'Default',
  alter column config_is_active set default true,
  alter column config_sort_index set default 0,
  alter column config_metadata_json set default '{}'::jsonb,
  alter column config_created_at set default now(),
  alter column config_updated_at set default now();

alter table facilities.spaces
  drop constraint if exists spaces_config_capacity_teams_check;

alter table facilities.spaces
  add constraint spaces_config_capacity_teams_check
  check (config_capacity_teams is null or config_capacity_teams > 0);

-- Normalize calendar allocations so configuration_id points to the same space row.
update calendar.calendar_item_space_allocations
set configuration_id = space_id
where configuration_id is null or configuration_id <> space_id;

-- Remove previous FK on configuration_id (to facilities.space_configurations) and repoint to facilities.spaces.
do $$
declare
  con_name text;
begin
  select c.conname
  into con_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  join pg_attribute a on a.attrelid = t.oid and a.attnum = any (c.conkey)
  where n.nspname = 'calendar'
    and t.relname = 'calendar_item_space_allocations'
    and c.contype = 'f'
    and a.attname = 'configuration_id'
  limit 1;

  if con_name is not null then
    execute format('alter table calendar.calendar_item_space_allocations drop constraint %I', con_name);
  end if;
end
$$;

alter table calendar.calendar_item_space_allocations
  alter column configuration_id set not null;

alter table calendar.calendar_item_space_allocations
  add constraint calendar_item_space_allocations_configuration_id_fkey
  foreign key (configuration_id) references facilities.spaces(id) on delete cascade;

alter table calendar.calendar_item_space_allocations
  drop constraint if exists calendar_item_space_allocations_configuration_matches_space;

alter table calendar.calendar_item_space_allocations
  add constraint calendar_item_space_allocations_configuration_matches_space
  check (configuration_id = space_id);

-- Drop old table now that data is embedded in spaces.
drop table if exists facilities.space_configurations cascade;

commit;
