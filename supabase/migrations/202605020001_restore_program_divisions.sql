-- Restore the programs structure-node table that was dropped in 202604030002_canvas_structure_teardown.sql.
-- The new table is named programs.divisions. Dependent tables (program_registrations,
-- program_schedule_blocks, program_teams, ...) still carry their *_node_id columns; the CASCADE
-- only removed the FK constraints, which we re-attach here pointing at programs.divisions.

begin;

create table if not exists programs.divisions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references programs.programs(id) on delete cascade,
  parent_id uuid references programs.divisions(id) on delete cascade,
  name text not null,
  slug text not null,
  node_kind text not null default 'division' check (node_kind in ('division', 'team')),
  sort_index integer not null default 0,
  capacity integer,
  waitlist_enabled boolean not null default false,
  source_external_key text,
  settings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint divisions_parent_not_self check (parent_id is null or parent_id <> id),
  constraint divisions_capacity_nonnegative check (capacity is null or capacity >= 0)
);

create unique index if not exists divisions_program_slug_uidx
  on programs.divisions (program_id, slug);

create index if not exists divisions_program_parent_sort_idx
  on programs.divisions (program_id, parent_id, sort_index, created_at);

create unique index if not exists divisions_source_external_key_uidx
  on programs.divisions (source_external_key)
  where source_external_key is not null;

drop trigger if exists divisions_set_updated_at on programs.divisions;
create trigger divisions_set_updated_at before update on programs.divisions
  for each row execute procedure public.set_updated_at();

alter table programs.divisions enable row level security;

drop policy if exists divisions_public_or_read on programs.divisions;
create policy divisions_public_or_read on programs.divisions
  for select
  using (
    exists (
      select 1 from programs.programs p
      where p.id = divisions.program_id
        and (p.status = 'published' or public.has_org_permission(p.org_id, 'programs.read'))
    )
  );

drop policy if exists divisions_write on programs.divisions;
create policy divisions_write on programs.divisions
  for all
  using (
    exists (
      select 1 from programs.programs p
      where p.id = divisions.program_id
        and public.has_org_permission(p.org_id, 'programs.write')
    )
  )
  with check (
    exists (
      select 1 from programs.programs p
      where p.id = divisions.program_id
        and public.has_org_permission(p.org_id, 'programs.write')
    )
  );

-- Re-attach FKs on dependent tables. The teardown's CASCADE dropped these constraints
-- but left the *_node_id columns intact.
do $$
begin
  if to_regclass('programs.program_registrations') is not null then
    alter table programs.program_registrations
      drop constraint if exists program_registrations_program_node_id_fkey,
      drop constraint if exists program_registrations_program_structure_node_id_fkey;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'programs' and table_name = 'program_registrations' and column_name = 'program_node_id'
    ) then
      update programs.program_registrations
        set program_node_id = null
        where program_node_id is not null
          and not exists (select 1 from programs.divisions d where d.id = program_node_id);
      alter table programs.program_registrations
        add constraint program_registrations_division_id_fkey
          foreign key (program_node_id) references programs.divisions(id) on delete set null;
    end if;
  end if;

  if to_regclass('programs.program_schedule_blocks') is not null then
    alter table programs.program_schedule_blocks
      drop constraint if exists program_schedule_blocks_program_node_id_fkey,
      drop constraint if exists program_schedule_blocks_program_structure_node_id_fkey;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'programs' and table_name = 'program_schedule_blocks' and column_name = 'program_node_id'
    ) then
      update programs.program_schedule_blocks
        set program_node_id = null
        where program_node_id is not null
          and not exists (select 1 from programs.divisions d where d.id = program_node_id);
      alter table programs.program_schedule_blocks
        add constraint program_schedule_blocks_division_id_fkey
          foreign key (program_node_id) references programs.divisions(id) on delete cascade;
    end if;
  end if;

  if to_regclass('programs.program_teams') is not null then
    alter table programs.program_teams
      drop constraint if exists program_teams_program_node_id_fkey,
      drop constraint if exists program_teams_program_structure_node_id_fkey;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'programs' and table_name = 'program_teams' and column_name = 'program_node_id'
    ) then
      -- program_teams.program_node_id is NOT NULL; orphans (referencing dropped divisions) must be deleted.
      delete from programs.program_teams
        where program_node_id is not null
          and not exists (select 1 from programs.divisions d where d.id = program_node_id);
      alter table programs.program_teams
        add constraint program_teams_division_id_fkey
          foreign key (program_node_id) references programs.divisions(id) on delete cascade;
    end if;
  end if;
end
$$;

-- Repoint sync_org_entity_file_folders at the renamed table.
create or replace function public.sync_org_entity_file_folders(target_org_id uuid, actor_user_id uuid default auth.uid())
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  programs_root_id uuid;
  divisions_root_id uuid;
  teams_root_id uuid;
  parent_folder_id uuid;
  rec record;
  next_slug text;
begin
  if target_org_id is null then
    return;
  end if;

  perform public.ensure_org_file_system(target_org_id, actor_user_id);

  select id into programs_root_id
  from files.app_file_folders
  where scope = 'organization' and org_id = target_org_id and slug = 'programs'
  order by created_at asc
  limit 1;

  if programs_root_id is null then
    return;
  end if;

  select id into divisions_root_id
  from files.app_file_folders
  where scope = 'organization' and org_id = target_org_id and slug = 'divisions'
  order by created_at asc
  limit 1;

  select id into teams_root_id
  from files.app_file_folders
  where scope = 'organization' and org_id = target_org_id and slug = 'teams'
  order by created_at asc
  limit 1;

  for rec in
    select program.id as entity_id, program.name as entity_name
    from programs.programs program
    where program.org_id = target_org_id
  loop
    next_slug := public.file_manager_slugify(rec.entity_name) || '-' || left(rec.entity_id::text, 8);

    insert into files.app_file_folders (
      scope, org_id, parent_id, name, slug, access_tag, is_system, entity_type, entity_id, metadata_json, created_by_user_id
    ) values (
      'organization', target_org_id, programs_root_id, rec.entity_name, next_slug, 'programs', true,
      'program', rec.entity_id, jsonb_build_object('systemKey', 'program-entity-folder'), actor_user_id
    )
    on conflict (org_id, entity_type, entity_id) do update set
      parent_id = excluded.parent_id,
      name = excluded.name,
      slug = excluded.slug,
      access_tag = excluded.access_tag,
      updated_at = now();
  end loop;

  for rec in
    select node.id as entity_id, node.name as entity_name, node.program_id
    from programs.divisions node
    join programs.programs program on program.id = node.program_id
    where program.org_id = target_org_id
      and node.node_kind = 'division'
  loop
    select folder.id into parent_folder_id
    from files.app_file_folders folder
    where folder.scope = 'organization'
      and folder.org_id = target_org_id
      and folder.entity_type = 'program'
      and folder.entity_id = rec.program_id
    order by folder.created_at asc
    limit 1;

    parent_folder_id := coalesce(parent_folder_id, programs_root_id);
    next_slug := public.file_manager_slugify(rec.entity_name) || '-' || left(rec.entity_id::text, 8);

    insert into files.app_file_folders (
      scope, org_id, parent_id, name, slug, access_tag, is_system, entity_type, entity_id, metadata_json, created_by_user_id
    ) values (
      'organization', target_org_id, parent_folder_id, rec.entity_name, next_slug, 'programs', true,
      'division', rec.entity_id, jsonb_build_object('systemKey', 'division-entity-folder'), actor_user_id
    )
    on conflict (org_id, entity_type, entity_id) do update set
      parent_id = excluded.parent_id,
      name = excluded.name,
      slug = excluded.slug,
      access_tag = excluded.access_tag,
      updated_at = now();
  end loop;

  for rec in
    select node.id as entity_id, node.name as entity_name, node.program_id, node.parent_id as division_entity_id
    from programs.divisions node
    join programs.programs program on program.id = node.program_id
    where program.org_id = target_org_id
      and node.node_kind = 'team'
  loop
    select folder.id into parent_folder_id
    from files.app_file_folders folder
    where folder.scope = 'organization'
      and folder.org_id = target_org_id
      and folder.entity_type = 'division'
      and folder.entity_id = rec.division_entity_id
    order by folder.created_at asc
    limit 1;

    if parent_folder_id is null then
      select folder.id into parent_folder_id
      from files.app_file_folders folder
      where folder.scope = 'organization'
        and folder.org_id = target_org_id
        and folder.entity_type = 'program'
        and folder.entity_id = rec.program_id
      order by folder.created_at asc
      limit 1;
    end if;

    parent_folder_id := coalesce(parent_folder_id, programs_root_id);
    next_slug := public.file_manager_slugify(rec.entity_name) || '-' || left(rec.entity_id::text, 8);

    insert into files.app_file_folders (
      scope, org_id, parent_id, name, slug, access_tag, is_system, entity_type, entity_id, metadata_json, created_by_user_id
    ) values (
      'organization', target_org_id, parent_folder_id, rec.entity_name, next_slug, 'programs', true,
      'team', rec.entity_id, jsonb_build_object('systemKey', 'team-entity-folder'), actor_user_id
    )
    on conflict (org_id, entity_type, entity_id) do update set
      parent_id = excluded.parent_id,
      name = excluded.name,
      slug = excluded.slug,
      access_tag = excluded.access_tag,
      updated_at = now();
  end loop;

  update files.app_file_folders folder
  set parent_id = coalesce(program_folder.id, programs_root_id),
      updated_at = now()
  from programs.divisions node
  left join files.app_file_folders program_folder
    on program_folder.scope = 'organization'
   and program_folder.org_id = target_org_id
   and program_folder.entity_type = 'program'
   and program_folder.entity_id = node.program_id
  where folder.scope = 'organization'
    and folder.org_id = target_org_id
    and folder.entity_type = 'division'
    and folder.entity_id = node.id;

  update files.app_file_folders folder
  set parent_id = coalesce(division_folder.id, program_folder.id, programs_root_id),
      updated_at = now()
  from programs.divisions team_node
  left join files.app_file_folders division_folder
    on division_folder.scope = 'organization'
   and division_folder.org_id = target_org_id
   and division_folder.entity_type = 'division'
   and division_folder.entity_id = team_node.parent_id
  left join files.app_file_folders program_folder
    on program_folder.scope = 'organization'
   and program_folder.org_id = target_org_id
   and program_folder.entity_type = 'program'
   and program_folder.entity_id = team_node.program_id
  where folder.scope = 'organization'
    and folder.org_id = target_org_id
    and folder.entity_type = 'team'
    and folder.entity_id = team_node.id;

  if divisions_root_id is not null then
    update files.app_file_folders
    set parent_id = programs_root_id, updated_at = now()
    where scope = 'organization'
      and org_id = target_org_id
      and parent_id = divisions_root_id;

    update files.app_files
    set folder_id = programs_root_id, updated_at = now()
    where scope = 'organization'
      and org_id = target_org_id
      and folder_id = divisions_root_id;

    delete from files.app_file_folders folder
    where folder.id = divisions_root_id
      and not exists (select 1 from files.app_file_folders child where child.parent_id = folder.id)
      and not exists (select 1 from files.app_files file where file.folder_id = folder.id);
  end if;

  if teams_root_id is not null then
    update files.app_file_folders
    set parent_id = programs_root_id, updated_at = now()
    where scope = 'organization'
      and org_id = target_org_id
      and parent_id = teams_root_id;

    update files.app_files
    set folder_id = programs_root_id, updated_at = now()
    where scope = 'organization'
      and org_id = target_org_id
      and folder_id = teams_root_id;

    delete from files.app_file_folders folder
    where folder.id = teams_root_id
      and not exists (select 1 from files.app_file_folders child where child.parent_id = folder.id)
      and not exists (select 1 from files.app_files file where file.folder_id = folder.id);
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
