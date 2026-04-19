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
  media_id uuid;
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

  if org_assets_id is not null then
    update files.app_file_folders
    set parent_id = org_root_id,
        name = 'Assets',
        slug = 'assets',
        updated_at = now()
    where id = org_assets_id;
  end if;

  select id
  into media_id
  from files.app_file_folders
  where scope = 'organization'
    and org_id = target_org_id
    and parent_id = org_root_id
    and slug = 'media'
  order by created_at asc
  limit 1;

  if media_id is null and org_assets_id is not null then
    select id
    into media_id
    from files.app_file_folders
    where scope = 'organization'
      and org_id = target_org_id
      and parent_id = org_assets_id
      and slug = 'media'
    order by created_at asc
    limit 1;

    if media_id is not null then
      update files.app_file_folders
      set parent_id = org_root_id,
          updated_at = now()
      where id = media_id;
    end if;
  end if;

  select id
  into org_assets_id
  from files.app_file_folders
  where scope = 'organization'
    and org_id = target_org_id
    and parent_id = org_root_id
    and slug = 'assets'
  order by created_at asc
  limit 1;

  if org_assets_id is null then
    return;
  end if;

  insert into files.app_file_folders (scope, org_id, parent_id, name, slug, access_tag, is_system, entity_type, metadata_json, created_by_user_id)
  values
    ('organization', target_org_id, org_assets_id, 'Branding', 'branding', 'branding', true, 'general', jsonb_build_object('systemKey', 'branding'), actor_user_id),
    ('organization', target_org_id, org_assets_id, 'Documents', 'documents', 'manage', true, 'general', jsonb_build_object('systemKey', 'documents'), actor_user_id)
  on conflict do nothing;

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

-- Backfill existing orgs to normalize: Organization Assets -> Assets, and move Media to top-level.
do $$
declare
  org_row record;
  orgs_rel regclass;
  org_root_id uuid;
  assets_id uuid;
  media_top_id uuid;
  media_legacy_id uuid;
begin
  orgs_rel := to_regclass('orgs.orgs');
  if orgs_rel is null then
    return;
  end if;

  for org_row in execute format('select id from %s', orgs_rel::text) loop
    perform public.ensure_org_file_system(org_row.id, null);

    select id into org_root_id
    from files.app_file_folders
    where scope = 'organization'
      and org_id = org_row.id
      and parent_id is null
      and slug = 'organization-files'
    order by created_at asc
    limit 1;

    if org_root_id is null then
      continue;
    end if;

    select id into assets_id
    from files.app_file_folders
    where scope = 'organization'
      and org_id = org_row.id
      and slug in ('assets', 'organization-assets')
    order by created_at asc
    limit 1;

    if assets_id is not null then
      update files.app_file_folders
      set parent_id = org_root_id,
          name = 'Assets',
          slug = 'assets',
          updated_at = now()
      where id = assets_id;
    end if;

    select id into media_top_id
    from files.app_file_folders
    where scope = 'organization'
      and org_id = org_row.id
      and parent_id = org_root_id
      and slug = 'media'
    order by created_at asc
    limit 1;

    if media_top_id is null and assets_id is not null then
      select id into media_top_id
      from files.app_file_folders
      where scope = 'organization'
        and org_id = org_row.id
        and parent_id = assets_id
        and slug = 'media'
      order by created_at asc
      limit 1;

      if media_top_id is not null then
        update files.app_file_folders
        set parent_id = org_root_id,
            updated_at = now()
        where id = media_top_id;
      end if;
    end if;

    if media_top_id is null then
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
        org_row.id,
        org_root_id,
        'Media',
        'media',
        'pages',
        true,
        'general',
        jsonb_build_object('systemKey', 'media'),
        null
      )
      on conflict do nothing;

      select id into media_top_id
      from files.app_file_folders
      where scope = 'organization'
        and org_id = org_row.id
        and parent_id = org_root_id
        and slug = 'media'
      order by created_at asc
      limit 1;
    end if;

    if assets_id is not null and media_top_id is not null then
      for media_legacy_id in
        select folder.id
        from files.app_file_folders folder
        where folder.scope = 'organization'
          and folder.org_id = org_row.id
          and folder.parent_id = assets_id
          and folder.slug = 'media'
          and folder.id <> media_top_id
      loop
        update files.app_file_folders
        set parent_id = media_top_id,
            updated_at = now()
        where parent_id = media_legacy_id;

        update files.app_files
        set folder_id = media_top_id,
            updated_at = now()
        where folder_id = media_legacy_id;

        delete from files.app_file_folders folder
        where folder.id = media_legacy_id
          and not exists (select 1 from files.app_file_folders child where child.parent_id = folder.id)
          and not exists (select 1 from files.app_files file where file.folder_id = folder.id);
      end loop;
    end if;
  end loop;
end $$;

commit;
