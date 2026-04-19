-- Recovery migration: restore facilities.spaces when previously dropped.
-- This keeps facilities.spaces as the non-map source of truth expected by the app.

begin;

create schema if not exists facilities;

create table if not exists facilities.spaces (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs.orgs(id) on delete cascade,
  parent_space_id uuid null,
  name text not null,
  slug text not null,
  space_kind text not null default 'custom' check (space_kind in ('building', 'floor', 'room', 'field', 'court', 'custom')),
  status text not null default 'open' check (status in ('open', 'closed', 'archived')),
  is_bookable boolean not null default true,
  timezone text not null default 'UTC',
  capacity integer null check (capacity is null or capacity >= 0),
  metadata_json jsonb not null default '{}'::jsonb,
  status_labels_json jsonb not null default '{}'::jsonb,
  sort_index integer not null default 0,
  config_name text not null default 'Default',
  config_slug text not null default 'default',
  config_capacity_teams integer null check (config_capacity_teams is null or config_capacity_teams > 0),
  config_is_active boolean not null default true,
  config_sort_index integer not null default 0,
  config_metadata_json jsonb not null default '{}'::jsonb,
  config_created_by uuid null references auth.users(id) on delete set null,
  config_updated_by uuid null references auth.users(id) on delete set null,
  config_created_at timestamptz not null default now(),
  config_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'spaces_parent_space_id_fkey'
      and conrelid = 'facilities.spaces'::regclass
  ) then
    alter table facilities.spaces
      add constraint spaces_parent_space_id_fkey
      foreign key (parent_space_id) references facilities.spaces(id) on delete set null;
  end if;
end
$$;

create index if not exists spaces_org_idx on facilities.spaces (org_id, sort_index, created_at);
create index if not exists spaces_parent_idx on facilities.spaces (org_id, parent_space_id);

-- Backfill spaces from map nodes when missing.
do $$
begin
  if to_regclass('facilities.facility_map_nodes') is not null then
    insert into facilities.spaces (
      id,
      org_id,
      parent_space_id,
      name,
      slug,
      space_kind,
      status,
      is_bookable,
      timezone,
      capacity,
      metadata_json,
      status_labels_json,
      sort_index,
      config_name,
      config_slug,
      config_is_active,
      config_sort_index,
      config_metadata_json,
      config_created_at,
      config_updated_at,
      created_at,
      updated_at
    )
    select
      node.space_id,
      node.org_id,
      case
        when exists (
          select 1
          from facilities.facility_map_nodes parent
          where parent.org_id = node.org_id
            and parent.space_id = node.parent_space_id
        ) then node.parent_space_id
        else null
      end as parent_space_id,
      'Recovered Space ' || substr(replace(node.space_id::text, '-', ''), 1, 8),
      'recovered-' || substr(replace(node.space_id::text, '-', ''), 1, 8),
      'custom',
      case when node.status = 'archived' then 'archived' else 'open' end,
      true,
      'UTC',
      null,
      '{}'::jsonb,
      '{}'::jsonb,
      greatest(0, coalesce(node.z_index, 0)),
      'Default',
      'default-' || substr(replace(node.space_id::text, '-', ''), 1, 8),
      true,
      0,
      '{}'::jsonb,
      now(),
      now(),
      coalesce(node.created_at, now()),
      coalesce(node.updated_at, now())
    from facilities.facility_map_nodes node
    where not exists (
      select 1
      from facilities.spaces space
      where space.id = node.space_id
    )
    on conflict (id) do nothing;
  end if;
end
$$;

-- If the prior migration skipped FK constraints because spaces did not exist, add them now.
do $$
begin
  if to_regclass('facilities.facility_map_nodes') is not null then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'facility_map_nodes_space_id_fkey'
        and conrelid = 'facilities.facility_map_nodes'::regclass
    ) then
      alter table facilities.facility_map_nodes
        add constraint facility_map_nodes_space_id_fkey
        foreign key (space_id) references facilities.spaces(id) on delete cascade;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'facility_map_nodes_parent_space_id_fkey'
        and conrelid = 'facilities.facility_map_nodes'::regclass
    ) then
      alter table facilities.facility_map_nodes
        add constraint facility_map_nodes_parent_space_id_fkey
        foreign key (parent_space_id) references facilities.spaces(id) on delete set null;
    end if;
  end if;
end
$$;

commit;
