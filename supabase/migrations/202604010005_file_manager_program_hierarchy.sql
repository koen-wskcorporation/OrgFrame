begin;

create or replace function public.ensure_org_file_system(target_org_id uuid, actor_user_id uuid default auth.uid())
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org_root_id uuid;
  org_assets_id uuid;
  docs_id uuid;
begin
  if target_org_id is null then
    return;
  end if;

  if not public.has_org_permission(target_org_id, 'org.manage.read')
    and not public.has_org_permission(target_org_id, 'programs.read')
    and not public.has_org_permission(target_org_id, 'org.pages.read')
    and not public.has_org_permission(target_org_id, 'org.branding.read') then
    return;
  end if;

  insert into files.app_file_folders (
    scope,
    org_id,
    parent_id,
    name,
    slug,
    access_tag,
    is_system,
    entity_type,
    metadata_json,
    created_by_user_id
  )
  values (
    'organization',
    target_org_id,
    null,
    'Organization Files',
    'organization-files',
    'manage',
    true,
    'general',
    jsonb_build_object('systemKey', 'org-root'),
    actor_user_id
  )
  on conflict do nothing;

  select id
  into org_root_id
  from files.app_file_folders
  where scope = 'organization'
    and org_id = target_org_id
    and parent_id is null
    and slug = 'organization-files'
  order by created_at asc
  limit 1;

  if org_root_id is null then
    return;
  end if;

  insert into files.app_file_folders (scope, org_id, parent_id, name, slug, access_tag, is_system, entity_type, metadata_json, created_by_user_id)
  values
    ('organization', target_org_id, org_root_id, 'Programs', 'programs', 'programs', true, 'general', jsonb_build_object('systemKey', 'programs-root'), actor_user_id),
    ('organization', target_org_id, org_root_id, 'Assets', 'assets', 'manage', true, 'general', jsonb_build_object('systemKey', 'org-assets-root'), actor_user_id),
    ('organization', target_org_id, org_root_id, 'Media', 'media', 'pages', true, 'general', jsonb_build_object('systemKey', 'media'), actor_user_id)
  on conflict do nothing;

  select id
  into org_assets_id
  from files.app_file_folders
  where scope = 'organization'
    and org_id = target_org_id
    and slug in ('assets', 'organization-assets')
  order by created_at asc
  limit 1;

  if org_assets_id is null then
    return;
  end if;

  update files.app_file_folders
  set
    parent_id = org_root_id,
    name = 'Assets',
    slug = 'assets',
    updated_at = now()
  where id = org_assets_id;

  insert into files.app_file_folders (scope, org_id, parent_id, name, slug, access_tag, is_system, entity_type, metadata_json, created_by_user_id)
  values
    ('organization', target_org_id, org_assets_id, 'Branding', 'branding', 'branding', true, 'general', jsonb_build_object('systemKey', 'branding'), actor_user_id),
    ('organization', target_org_id, org_assets_id, 'Documents', 'documents', 'manage', true, 'general', jsonb_build_object('systemKey', 'documents'), actor_user_id)
  on conflict do nothing;

  -- Move legacy media-under-assets up to top-level organization if a top-level media folder does not already exist.
  update files.app_file_folders media_folder
  set parent_id = org_root_id,
      updated_at = now()
  where media_folder.scope = 'organization'
    and media_folder.org_id = target_org_id
    and media_folder.slug = 'media'
    and media_folder.parent_id = org_assets_id
    and not exists (
      select 1
      from files.app_file_folders existing
      where existing.scope = 'organization'
        and existing.org_id = target_org_id
        and existing.parent_id = org_root_id
        and existing.slug = 'media'
        and existing.id <> media_folder.id
    );

  select id
  into docs_id
  from files.app_file_folders
  where scope = 'organization'
    and org_id = target_org_id
    and parent_id = org_assets_id
    and slug = 'documents'
  order by created_at asc
  limit 1;

  if docs_id is not null then
    insert into files.app_file_folders (scope, org_id, parent_id, name, slug, access_tag, is_system, entity_type, metadata_json, created_by_user_id)
    values
      ('organization', target_org_id, docs_id, 'Imports', 'imports', 'manage', true, 'general', jsonb_build_object('systemKey', 'imports'), actor_user_id)
    on conflict do nothing;
  end if;
end;
$$;

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
      scope,
      org_id,
      parent_id,
      name,
      slug,
      access_tag,
      is_system,
      entity_type,
      entity_id,
      metadata_json,
      created_by_user_id
    )
    values (
      'organization',
      target_org_id,
      programs_root_id,
      rec.entity_name,
      next_slug,
      'programs',
      true,
      'program',
      rec.entity_id,
      jsonb_build_object('systemKey', 'program-entity-folder'),
      actor_user_id
    )
    on conflict (org_id, entity_type, entity_id)
    do update set
      parent_id = excluded.parent_id,
      name = excluded.name,
      slug = excluded.slug,
      access_tag = excluded.access_tag,
      updated_at = now();
  end loop;

  for rec in
    select node.id as entity_id, node.name as entity_name, node.program_id
    from programs.program_structure_nodes node
    join programs.programs program on program.id = node.program_id
    where program.org_id = target_org_id
      and node.node_kind = 'division'
  loop
    select folder.id
    into parent_folder_id
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
      scope,
      org_id,
      parent_id,
      name,
      slug,
      access_tag,
      is_system,
      entity_type,
      entity_id,
      metadata_json,
      created_by_user_id
    )
    values (
      'organization',
      target_org_id,
      parent_folder_id,
      rec.entity_name,
      next_slug,
      'programs',
      true,
      'division',
      rec.entity_id,
      jsonb_build_object('systemKey', 'division-entity-folder'),
      actor_user_id
    )
    on conflict (org_id, entity_type, entity_id)
    do update set
      parent_id = excluded.parent_id,
      name = excluded.name,
      slug = excluded.slug,
      access_tag = excluded.access_tag,
      updated_at = now();
  end loop;

  for rec in
    select node.id as entity_id, node.name as entity_name, node.program_id, node.parent_id as division_entity_id
    from programs.program_structure_nodes node
    join programs.programs program on program.id = node.program_id
    where program.org_id = target_org_id
      and node.node_kind = 'team'
  loop
    select folder.id
    into parent_folder_id
    from files.app_file_folders folder
    where folder.scope = 'organization'
      and folder.org_id = target_org_id
      and folder.entity_type = 'division'
      and folder.entity_id = rec.division_entity_id
    order by folder.created_at asc
    limit 1;

    if parent_folder_id is null then
      select folder.id
      into parent_folder_id
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
      scope,
      org_id,
      parent_id,
      name,
      slug,
      access_tag,
      is_system,
      entity_type,
      entity_id,
      metadata_json,
      created_by_user_id
    )
    values (
      'organization',
      target_org_id,
      parent_folder_id,
      rec.entity_name,
      next_slug,
      'programs',
      true,
      'team',
      rec.entity_id,
      jsonb_build_object('systemKey', 'team-entity-folder'),
      actor_user_id
    )
    on conflict (org_id, entity_type, entity_id)
    do update set
      parent_id = excluded.parent_id,
      name = excluded.name,
      slug = excluded.slug,
      access_tag = excluded.access_tag,
      updated_at = now();
  end loop;

  update files.app_file_folders folder
  set parent_id = coalesce(program_folder.id, programs_root_id),
      updated_at = now()
  from programs.program_structure_nodes node
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
  from programs.program_structure_nodes team_node
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
    set parent_id = programs_root_id,
        updated_at = now()
    where scope = 'organization'
      and org_id = target_org_id
      and parent_id = divisions_root_id;

    update files.app_files
    set folder_id = programs_root_id,
        updated_at = now()
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
    set parent_id = programs_root_id,
        updated_at = now()
    where scope = 'organization'
      and org_id = target_org_id
      and parent_id = teams_root_id;

    update files.app_files
    set folder_id = programs_root_id,
        updated_at = now()
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

create or replace function public.resolve_system_folder_id(
  target_org_id uuid,
  target_user_id uuid,
  folder_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_id uuid;
begin
  if folder_key = 'branding' then
    select folder.id
    into resolved_id
    from files.app_file_folders folder
    where folder.scope = 'organization'
      and folder.org_id = target_org_id
      and folder.slug = 'branding'
    order by folder.created_at asc
    limit 1;
    return resolved_id;
  end if;

  if folder_key = 'media' then
    select folder.id
    into resolved_id
    from files.app_file_folders folder
    where folder.scope = 'organization'
      and folder.org_id = target_org_id
      and folder.slug = 'media'
    order by folder.created_at asc
    limit 1;
    return resolved_id;
  end if;

  if folder_key = 'documents' then
    select folder.id
    into resolved_id
    from files.app_file_folders folder
    where folder.scope = 'organization'
      and folder.org_id = target_org_id
      and folder.slug = 'documents'
    order by folder.created_at asc
    limit 1;
    return resolved_id;
  end if;

  if folder_key = 'imports' then
    select folder.id
    into resolved_id
    from files.app_file_folders folder
    where folder.scope = 'organization'
      and folder.org_id = target_org_id
      and folder.slug = 'imports'
    order by folder.created_at asc
    limit 1;
    return resolved_id;
  end if;

  if folder_key = 'programs' or folder_key = 'divisions' or folder_key = 'teams' then
    select folder.id
    into resolved_id
    from files.app_file_folders folder
    where folder.scope = 'organization'
      and folder.org_id = target_org_id
      and folder.slug = 'programs'
    order by folder.created_at asc
    limit 1;
    return resolved_id;
  end if;

  if folder_key = 'my-uploads' then
    select folder.id
    into resolved_id
    from files.app_file_folders folder
    where folder.scope = 'personal'
      and folder.owner_user_id = target_user_id
      and folder.slug = 'my-uploads'
    order by folder.created_at asc
    limit 1;
    return resolved_id;
  end if;

  return null;
end;
$$;

-- Re-sync current orgs to ensure hierarchy is corrected immediately.
do $$
declare
  org_row record;
  orgs_rel regclass;
begin
  orgs_rel := to_regclass('orgs.orgs');
  if orgs_rel is null then
    select to_regclass(format('%I.%I', ns.nspname, cls.relname))
    into orgs_rel
    from pg_class cls
    join pg_namespace ns on ns.oid = cls.relnamespace
    where cls.relname = 'orgs'
      and cls.relkind in ('r', 'v', 'm')
      and ns.nspname not in ('pg_catalog', 'information_schema')
    order by
      case
        when ns.nspname = 'orgs' then 0
        when ns.nspname = 'core' then 1
        else 2
      end
    limit 1;
  end if;

  if orgs_rel is null then
    return;
  end if;

  -- orgs table can live in non-public schema (e.g. orgs.orgs)
  for org_row in execute format('select id from %s', orgs_rel::text) loop
    perform public.ensure_org_file_system(org_row.id, null);
    perform public.sync_org_entity_file_folders(org_row.id, null);
  end loop;
end $$;

commit;
