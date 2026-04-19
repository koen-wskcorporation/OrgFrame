begin;

do $$
begin
  if to_regclass('public.app_file_folders') is null or to_regclass('public.app_files') is null then
    raise exception 'file-manager base tables are missing. Apply 202603220001_file_manager.sql first.';
  end if;
end;
$$;

-- Replace unsafe/optional index usage from initial rollout
-- and add deterministic folder uniqueness for idempotent system-folder seeding.
drop index if exists public.app_files_name_trgm_idx;
create index if not exists app_files_name_lower_idx on public.app_files (lower(name));

create unique index if not exists app_file_folders_org_parent_slug_unique_idx
  on public.app_file_folders (org_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(slug))
  where scope = 'organization' and org_id is not null;

create unique index if not exists app_file_folders_personal_parent_slug_unique_idx
  on public.app_file_folders (owner_user_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(slug))
  where scope = 'personal' and owner_user_id is not null;

-- Required for ON CONFLICT (org_id, entity_type, entity_id) in sync_org_entity_file_folders().
create unique index if not exists app_file_folders_org_entity_upsert_idx
  on public.app_file_folders (org_id, entity_type, entity_id);

-- Normalize any legacy personal rows to satisfy scope/entity constraints.
update public.app_file_folders
set entity_type = null
where scope = 'personal'
  and entity_type is not null;

update public.app_files
set entity_type = null
where scope = 'personal'
  and entity_type is not null;

-- Patch personal folder seeding function to use entity_type = null.
create or replace function public.ensure_personal_file_system(target_user_id uuid default auth.uid())
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  personal_root_id uuid;
begin
  if target_user_id is null then
    return;
  end if;

  if auth.uid() is not null and target_user_id <> auth.uid() then
    return;
  end if;

  insert into public.app_file_folders (
    scope,
    owner_user_id,
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
    'personal',
    target_user_id,
    null,
    'Personal Uploads',
    'personal-uploads',
    'personal',
    true,
    null,
    jsonb_build_object('systemKey', 'personal-root'),
    target_user_id
  )
  on conflict do nothing;

  select id
  into personal_root_id
  from public.app_file_folders
  where scope = 'personal'
    and owner_user_id = target_user_id
    and parent_id is null
    and slug = 'personal-uploads'
  order by created_at asc
  limit 1;

  if personal_root_id is null then
    return;
  end if;

  insert into public.app_file_folders (
    scope,
    owner_user_id,
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
    'personal',
    target_user_id,
    personal_root_id,
    'My Uploads',
    'my-uploads',
    'personal',
    true,
    null,
    jsonb_build_object('systemKey', 'my-uploads'),
    target_user_id
  )
  on conflict do nothing;
end;
$$;

-- Backfill any already-uploaded storage object missing in app_files.
create or replace function public.backfill_storage_file_records()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  storage_row record;
  target_folder_id uuid;
  target_org_id uuid;
  target_user_id uuid;
  target_file_path text;
  target_name text;
  target_extension text;
  target_folder_key text;
  target_access_tag text;
  target_visibility public.app_file_visibility;
  target_purpose text;
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  for storage_row in
    select object.bucket_id, object.name
    from storage.objects object
    where object.bucket_id in ('org-assets', 'org-site-assets', 'org-private-files', 'account-assets')
  loop
    if exists (
      select 1
      from public.app_files existing
      where existing.bucket = storage_row.bucket_id
        and existing.storage_path = storage_row.name
    ) then
      continue;
    end if;

    target_org_id := null;
    target_user_id := null;
    target_folder_id := null;
    target_folder_key := null;
    target_access_tag := null;
    target_visibility := 'private';
    target_purpose := null;

    target_file_path := storage_row.name;
    target_name := public.file_manager_legacy_name(target_file_path);
    target_extension := lower(split_part(target_name, '.', array_length(string_to_array(target_name, '.'), 1)));

    if storage_row.bucket_id = 'org-assets' then
      if split_part(target_file_path, '/', 1) <> 'orgs'
        or split_part(target_file_path, '/', 2) !~* '^[0-9a-f-]{36}$' then
        continue;
      end if;

      target_org_id := (split_part(target_file_path, '/', 2))::uuid;
      target_purpose := nullif(split_part(target_file_path, '/', 3), '');
      target_visibility := 'public';

      if target_purpose in ('org-logo', 'org-icon') then
        target_folder_key := 'branding';
        target_access_tag := 'branding';
      elsif target_purpose = 'program-cover' then
        target_folder_key := 'programs';
        target_access_tag := 'programs';
      else
        target_folder_key := 'documents';
        target_access_tag := 'manage';
      end if;

    elsif storage_row.bucket_id = 'org-site-assets' then
      -- Support legacy path pattern: orgs/{orgId}/{purpose}/...
      if split_part(target_file_path, '/', 1) = 'orgs'
        and split_part(target_file_path, '/', 2) ~* '^[0-9a-f-]{36}$' then
        target_org_id := (split_part(target_file_path, '/', 2))::uuid;
        target_purpose := nullif(split_part(target_file_path, '/', 3), '');
      -- Support newer path pattern: {orgId}/managed/{folderId}/...
      elsif split_part(target_file_path, '/', 1) ~* '^[0-9a-f-]{36}$' then
        target_org_id := (split_part(target_file_path, '/', 1))::uuid;
        target_purpose := nullif(split_part(target_file_path, '/', 2), '');
      else
        continue;
      end if;

      target_visibility := 'public';
      target_access_tag := 'pages';
      if target_purpose = 'attachment' then
        target_folder_key := 'documents';
      else
        target_folder_key := 'media';
      end if;

    elsif storage_row.bucket_id = 'org-private-files' then
      if split_part(target_file_path, '/', 1) <> 'orgs'
        or split_part(target_file_path, '/', 2) !~* '^[0-9a-f-]{36}$' then
        continue;
      end if;

      target_org_id := (split_part(target_file_path, '/', 2))::uuid;
      target_visibility := 'private';
      target_access_tag := 'manage';
      target_folder_key := 'documents';

    elsif storage_row.bucket_id = 'account-assets' then
      if split_part(target_file_path, '/', 1) <> 'users'
        or split_part(target_file_path, '/', 2) !~* '^[0-9a-f-]{36}$' then
        continue;
      end if;

      target_user_id := (split_part(target_file_path, '/', 2))::uuid;
      target_visibility := 'private';
      target_access_tag := 'personal';
      target_folder_key := 'my-uploads';

    else
      continue;
    end if;

    if target_org_id is not null then
      perform public.ensure_org_file_system(target_org_id, null);
      perform public.sync_org_entity_file_folders(target_org_id, null);
      target_folder_id := public.resolve_system_folder_id(target_org_id, null, target_folder_key);

      if target_folder_id is null then
        continue;
      end if;

      insert into public.app_files (
        scope,
        org_id,
        folder_id,
        name,
        extension,
        mime_type,
        size_bytes,
        bucket,
        storage_path,
        visibility,
        access_tag,
        entity_type,
        metadata_json,
        uploader_user_id
      )
      values (
        'organization',
        target_org_id,
        target_folder_id,
        target_name,
        target_extension,
        public.file_manager_legacy_mime(target_file_path),
        0,
        storage_row.bucket_id,
        target_file_path,
        target_visibility,
        target_access_tag,
        'general',
        jsonb_build_object('legacy', true, 'legacyField', 'storage.objects', 'legacyPurpose', target_purpose),
        null
      )
      on conflict (bucket, storage_path) do nothing;

    elsif target_user_id is not null then
      perform public.ensure_personal_file_system(target_user_id);
      target_folder_id := public.resolve_system_folder_id(null, target_user_id, target_folder_key);

      if target_folder_id is null then
        continue;
      end if;

      insert into public.app_files (
        scope,
        owner_user_id,
        folder_id,
        name,
        extension,
        mime_type,
        size_bytes,
        bucket,
        storage_path,
        visibility,
        access_tag,
        entity_type,
        metadata_json,
        uploader_user_id
      )
      values (
        'personal',
        target_user_id,
        target_folder_id,
        target_name,
        target_extension,
        public.file_manager_legacy_mime(target_file_path),
        0,
        storage_row.bucket_id,
        target_file_path,
        target_visibility,
        target_access_tag,
        null,
        jsonb_build_object('legacy', true, 'legacyField', 'storage.objects', 'legacyPurpose', target_purpose),
        target_user_id
      )
      on conflict (bucket, storage_path) do nothing;
    end if;
  end loop;
end;
$$;

-- Ensure roots exist and run storage backfill once.
do $$
declare
  org_row record;
  user_row record;
begin
  for org_row in select id from public.orgs loop
    perform public.ensure_org_file_system(org_row.id, null);
    perform public.sync_org_entity_file_folders(org_row.id, null);
  end loop;

  for user_row in select distinct membership.user_id from public.org_memberships membership loop
    perform public.ensure_personal_file_system(user_row.user_id);
  end loop;

  if to_regclass('storage.objects') is not null then
    for user_row in
      select distinct (split_part(object.name, '/', 2))::uuid as user_id
      from storage.objects object
      where object.bucket_id = 'account-assets'
        and split_part(object.name, '/', 1) = 'users'
        and split_part(object.name, '/', 2) ~* '^[0-9a-f-]{36}$'
    loop
      perform public.ensure_personal_file_system(user_row.user_id);
    end loop;
  end if;

  perform public.backfill_storage_file_records();
end;
$$;

commit;
