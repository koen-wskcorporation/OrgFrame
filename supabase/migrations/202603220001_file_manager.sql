begin;

create type public.app_file_scope as enum ('organization', 'personal');
create type public.app_file_entity_type as enum ('program', 'division', 'team', 'general');
create type public.app_file_visibility as enum ('private', 'public');

create table if not exists public.app_file_folders (
  id uuid primary key default gen_random_uuid(),
  scope public.app_file_scope not null,
  org_id uuid references public.orgs(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete cascade,
  parent_id uuid references public.app_file_folders(id) on delete cascade,
  name text not null,
  slug text not null,
  access_tag text not null default 'manage' check (access_tag in ('manage', 'branding', 'programs', 'pages', 'personal')),
  is_system boolean not null default false,
  entity_type public.app_file_entity_type,
  entity_id uuid,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_file_folders_scope_owner_check check (
    (scope = 'organization' and org_id is not null and owner_user_id is null)
    or (scope = 'personal' and owner_user_id is not null and org_id is null)
  ),
  constraint app_file_folders_entity_org_check check (
    entity_type is null or scope = 'organization'
  ),
  constraint app_file_folders_slug_check check (char_length(trim(slug)) > 0)
);

create table if not exists public.app_files (
  id uuid primary key default gen_random_uuid(),
  scope public.app_file_scope not null,
  org_id uuid references public.orgs(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete cascade,
  folder_id uuid not null references public.app_file_folders(id) on delete cascade,
  name text not null,
  extension text,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  bucket text not null,
  storage_path text not null,
  visibility public.app_file_visibility not null default 'private',
  access_tag text not null default 'manage' check (access_tag in ('manage', 'branding', 'programs', 'pages', 'personal')),
  entity_type public.app_file_entity_type,
  entity_id uuid,
  width integer,
  height integer,
  crop_json jsonb,
  dominant_color text,
  metadata_json jsonb not null default '{}'::jsonb,
  uploader_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_files_scope_owner_check check (
    (scope = 'organization' and org_id is not null and owner_user_id is null)
    or (scope = 'personal' and owner_user_id is not null and org_id is null)
  ),
  constraint app_files_entity_org_check check (
    entity_type is null or scope = 'organization'
  ),
  constraint app_files_name_check check (char_length(trim(name)) > 0),
  unique (bucket, storage_path)
);

create index if not exists app_file_folders_scope_org_parent_idx on public.app_file_folders (scope, org_id, parent_id, created_at);
create index if not exists app_file_folders_scope_owner_parent_idx on public.app_file_folders (scope, owner_user_id, parent_id, created_at);
create index if not exists app_file_folders_entity_idx on public.app_file_folders (org_id, entity_type, entity_id) where entity_id is not null;
create unique index if not exists app_file_folders_org_parent_slug_unique_idx
  on public.app_file_folders (org_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(slug))
  where scope = 'organization' and org_id is not null;
create unique index if not exists app_file_folders_personal_parent_slug_unique_idx
  on public.app_file_folders (owner_user_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(slug))
  where scope = 'personal' and owner_user_id is not null;
create index if not exists app_files_folder_created_idx on public.app_files (folder_id, created_at desc);
create index if not exists app_files_scope_org_created_idx on public.app_files (scope, org_id, created_at desc);
create index if not exists app_files_scope_owner_created_idx on public.app_files (scope, owner_user_id, created_at desc);
create index if not exists app_files_name_lower_idx on public.app_files (lower(name));
create unique index if not exists app_file_folders_org_entity_unique_idx
  on public.app_file_folders (org_id, entity_type, entity_id)
  where org_id is not null and entity_type is not null and entity_id is not null;

create or replace function public.file_manager_slugify(input_value text)
returns text
language sql
immutable
as $$
  select coalesce(nullif(regexp_replace(lower(trim(input_value)), '[^a-z0-9]+', '-', 'g'), ''), 'item')
$$;

create or replace function public.file_manager_read_allowed(target_org_id uuid, access_tag text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when access_tag = 'branding' then
      public.has_org_permission(target_org_id, 'org.branding.read')
      or public.has_org_permission(target_org_id, 'org.branding.write')
      or public.has_org_permission(target_org_id, 'org.manage.read')
    when access_tag = 'programs' then
      public.has_org_permission(target_org_id, 'programs.read')
      or public.has_org_permission(target_org_id, 'programs.write')
      or public.has_org_permission(target_org_id, 'org.manage.read')
    when access_tag = 'pages' then
      public.has_org_permission(target_org_id, 'org.pages.read')
      or public.has_org_permission(target_org_id, 'org.pages.write')
      or public.has_org_permission(target_org_id, 'org.manage.read')
    else
      public.has_org_permission(target_org_id, 'org.manage.read')
      or public.has_org_permission(target_org_id, 'org.branding.read')
      or public.has_org_permission(target_org_id, 'org.branding.write')
      or public.has_org_permission(target_org_id, 'programs.read')
      or public.has_org_permission(target_org_id, 'programs.write')
      or public.has_org_permission(target_org_id, 'org.pages.read')
      or public.has_org_permission(target_org_id, 'org.pages.write')
  end
$$;

create or replace function public.file_manager_write_allowed(target_org_id uuid, access_tag text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when access_tag = 'branding' then
      public.has_org_permission(target_org_id, 'org.branding.write')
      or public.has_org_permission(target_org_id, 'org.manage.read')
    when access_tag = 'programs' then
      public.has_org_permission(target_org_id, 'programs.write')
      or public.has_org_permission(target_org_id, 'org.manage.read')
    when access_tag = 'pages' then
      public.has_org_permission(target_org_id, 'org.pages.write')
      or public.has_org_permission(target_org_id, 'org.manage.read')
    else
      public.has_org_permission(target_org_id, 'org.manage.read')
  end
$$;

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

  insert into public.app_file_folders (
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
  from public.app_file_folders
  where scope = 'organization'
    and org_id = target_org_id
    and parent_id is null
    and slug = 'organization-files'
  order by created_at asc
  limit 1;

  if org_root_id is null then
    return;
  end if;

  insert into public.app_file_folders (scope, org_id, parent_id, name, slug, access_tag, is_system, entity_type, metadata_json, created_by_user_id)
  values
    ('organization', target_org_id, org_root_id, 'Programs', 'programs', 'programs', true, 'general', jsonb_build_object('systemKey', 'programs-root'), actor_user_id),
    ('organization', target_org_id, org_root_id, 'Divisions', 'divisions', 'programs', true, 'general', jsonb_build_object('systemKey', 'divisions-root'), actor_user_id),
    ('organization', target_org_id, org_root_id, 'Teams', 'teams', 'programs', true, 'general', jsonb_build_object('systemKey', 'teams-root'), actor_user_id),
    ('organization', target_org_id, org_root_id, 'Organization Assets', 'organization-assets', 'manage', true, 'general', jsonb_build_object('systemKey', 'org-assets-root'), actor_user_id)
  on conflict do nothing;

  select id
  into org_assets_id
  from public.app_file_folders
  where scope = 'organization'
    and org_id = target_org_id
    and parent_id = org_root_id
    and slug = 'organization-assets'
  order by created_at asc
  limit 1;

  if org_assets_id is null then
    return;
  end if;

  insert into public.app_file_folders (scope, org_id, parent_id, name, slug, access_tag, is_system, entity_type, metadata_json, created_by_user_id)
  values
    ('organization', target_org_id, org_assets_id, 'Branding', 'branding', 'branding', true, 'general', jsonb_build_object('systemKey', 'branding'), actor_user_id),
    ('organization', target_org_id, org_assets_id, 'Documents', 'documents', 'manage', true, 'general', jsonb_build_object('systemKey', 'documents'), actor_user_id),
    ('organization', target_org_id, org_assets_id, 'Media', 'media', 'pages', true, 'general', jsonb_build_object('systemKey', 'media'), actor_user_id)
  on conflict do nothing;

  select id
  into docs_id
  from public.app_file_folders
  where scope = 'organization'
    and org_id = target_org_id
    and parent_id = org_assets_id
    and slug = 'documents'
  order by created_at asc
  limit 1;

  if docs_id is not null then
    insert into public.app_file_folders (scope, org_id, parent_id, name, slug, access_tag, is_system, entity_type, metadata_json, created_by_user_id)
    values
      ('organization', target_org_id, docs_id, 'Imports', 'imports', 'manage', true, 'general', jsonb_build_object('systemKey', 'imports'), actor_user_id)
    on conflict do nothing;
  end if;
end;
$$;

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
  rec record;
  next_slug text;
begin
  if target_org_id is null then
    return;
  end if;

  perform public.ensure_org_file_system(target_org_id, actor_user_id);

  select id into programs_root_id
  from public.app_file_folders
  where scope = 'organization' and org_id = target_org_id and slug = 'programs'
  order by created_at asc
  limit 1;

  select id into divisions_root_id
  from public.app_file_folders
  where scope = 'organization' and org_id = target_org_id and slug = 'divisions'
  order by created_at asc
  limit 1;

  select id into teams_root_id
  from public.app_file_folders
  where scope = 'organization' and org_id = target_org_id and slug = 'teams'
  order by created_at asc
  limit 1;

  if programs_root_id is not null then
    for rec in
      select program.id as entity_id, program.name as entity_name
      from public.programs program
      where program.org_id = target_org_id
    loop
      next_slug := public.file_manager_slugify(rec.entity_name) || '-' || left(rec.entity_id::text, 8);

      insert into public.app_file_folders (
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
  end if;

  if divisions_root_id is not null then
    for rec in
      select program.org_id, node.id as entity_id, node.name as entity_name
      from public.program_nodes node
      join public.programs program on program.id = node.program_id
      where program.org_id = target_org_id
        and node.node_kind = 'division'
    loop
      next_slug := public.file_manager_slugify(rec.entity_name) || '-' || left(rec.entity_id::text, 8);

      insert into public.app_file_folders (
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
        divisions_root_id,
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
  end if;

  if teams_root_id is not null then
    for rec in
      select program.org_id, node.id as entity_id, node.name as entity_name
      from public.program_nodes node
      join public.programs program on program.id = node.program_id
      where program.org_id = target_org_id
        and node.node_kind = 'team'
    loop
      next_slug := public.file_manager_slugify(rec.entity_name) || '-' || left(rec.entity_id::text, 8);

      insert into public.app_file_folders (
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
        teams_root_id,
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
    from public.app_file_folders folder
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
    from public.app_file_folders folder
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
    from public.app_file_folders folder
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
    from public.app_file_folders folder
    where folder.scope = 'organization'
      and folder.org_id = target_org_id
      and folder.slug = 'imports'
    order by folder.created_at asc
    limit 1;
    return resolved_id;
  end if;

  if folder_key = 'my-uploads' then
    select folder.id
    into resolved_id
    from public.app_file_folders folder
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

create or replace function public.file_manager_legacy_mime(path text)
returns text
language sql
immutable
as $$
  select case lower(split_part(path, '.', array_length(string_to_array(path, '.'), 1)))
    when 'png' then 'image/png'
    when 'jpg' then 'image/jpeg'
    when 'jpeg' then 'image/jpeg'
    when 'webp' then 'image/webp'
    when 'svg' then 'image/svg+xml'
    when 'ico' then 'image/x-icon'
    when 'heic' then 'image/heic'
    when 'heif' then 'image/heif'
    when 'pdf' then 'application/pdf'
    when 'csv' then 'text/csv'
    when 'txt' then 'text/plain'
    when 'doc' then 'application/msword'
    when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    when 'xls' then 'application/vnd.ms-excel'
    when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    else 'application/octet-stream'
  end
$$;

create or replace function public.file_manager_legacy_name(path text)
returns text
language sql
immutable
as $$
  select coalesce(nullif(split_part(path, '/', array_length(string_to_array(path, '/'), 1)), ''), 'file')
$$;

create or replace function public.backfill_legacy_file_records()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org_row record;
  profile_row record;
  program_row record;
  player_row record;
  page_row record;
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
  for org_row in select id, logo_path, icon_path from public.orgs loop
    perform public.ensure_org_file_system(org_row.id, null);
    perform public.sync_org_entity_file_folders(org_row.id, null);

    if org_row.logo_path is not null and length(trim(org_row.logo_path)) > 0 then
      target_folder_id := public.resolve_system_folder_id(org_row.id, null, 'branding');
      if target_folder_id is not null then
        target_name := public.file_manager_legacy_name(org_row.logo_path);
        target_extension := lower(split_part(target_name, '.', array_length(string_to_array(target_name, '.'), 1)));

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
          org_row.id,
          target_folder_id,
          target_name,
          target_extension,
          public.file_manager_legacy_mime(org_row.logo_path),
          0,
          'org-assets',
          org_row.logo_path,
          'public',
          'branding',
          'general',
          jsonb_build_object('legacy', true, 'legacyField', 'orgs.logo_path'),
          null
        )
        on conflict (bucket, storage_path) do nothing;
      end if;
    end if;

    if org_row.icon_path is not null and length(trim(org_row.icon_path)) > 0 then
      target_folder_id := public.resolve_system_folder_id(org_row.id, null, 'branding');
      if target_folder_id is not null then
        target_name := public.file_manager_legacy_name(org_row.icon_path);
        target_extension := lower(split_part(target_name, '.', array_length(string_to_array(target_name, '.'), 1)));

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
          org_row.id,
          target_folder_id,
          target_name,
          target_extension,
          public.file_manager_legacy_mime(org_row.icon_path),
          0,
          'org-assets',
          org_row.icon_path,
          'public',
          'branding',
          'general',
          jsonb_build_object('legacy', true, 'legacyField', 'orgs.icon_path'),
          null
        )
        on conflict (bucket, storage_path) do nothing;
      end if;
    end if;
  end loop;

  for program_row in
    select program.id, program.org_id, program.cover_image_path
    from public.programs program
    where program.cover_image_path is not null and length(trim(program.cover_image_path)) > 0
  loop
    perform public.ensure_org_file_system(program_row.org_id, null);
    perform public.sync_org_entity_file_folders(program_row.org_id, null);

    select folder.id
    into target_folder_id
    from public.app_file_folders folder
    where folder.scope = 'organization'
      and folder.org_id = program_row.org_id
      and folder.entity_type = 'program'
      and folder.entity_id = program_row.id
    limit 1;

    if target_folder_id is null then
      target_folder_id := public.resolve_system_folder_id(program_row.org_id, null, 'media');
    end if;

    if target_folder_id is not null then
      target_name := public.file_manager_legacy_name(program_row.cover_image_path);
      target_extension := lower(split_part(target_name, '.', array_length(string_to_array(target_name, '.'), 1)));

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
        entity_id,
        metadata_json,
        uploader_user_id
      )
      values (
        'organization',
        program_row.org_id,
        target_folder_id,
        target_name,
        target_extension,
        public.file_manager_legacy_mime(program_row.cover_image_path),
        0,
        'org-assets',
        program_row.cover_image_path,
        'public',
        'programs',
        'program',
        program_row.id,
        jsonb_build_object('legacy', true, 'legacyField', 'programs.cover_image_path'),
        null
      )
      on conflict (bucket, storage_path) do nothing;
    end if;
  end loop;

  if to_regclass('public.user_profiles') is not null then
    for profile_row in
      select profile.user_id, profile.avatar_path
      from public.user_profiles profile
      where profile.avatar_path is not null and length(trim(profile.avatar_path)) > 0
    loop
      perform public.ensure_personal_file_system(profile_row.user_id);
      target_folder_id := public.resolve_system_folder_id(null, profile_row.user_id, 'my-uploads');
      if target_folder_id is not null then
        target_name := public.file_manager_legacy_name(profile_row.avatar_path);
        target_extension := lower(split_part(target_name, '.', array_length(string_to_array(target_name, '.'), 1)));

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
          profile_row.user_id,
          target_folder_id,
          target_name,
          target_extension,
          public.file_manager_legacy_mime(profile_row.avatar_path),
          0,
          'account-assets',
          profile_row.avatar_path,
          'private',
          'personal',
          null,
          jsonb_build_object('legacy', true, 'legacyField', 'user_profiles.avatar_path'),
          profile_row.user_id
        )
        on conflict (bucket, storage_path) do nothing;
      end if;
    end loop;
  end if;

  if to_regclass('public.players') is not null then
    for player_row in
      select player.owner_user_id, player.metadata_json
      from public.players player
      where player.metadata_json ? 'birthCertificatePath'
    loop
      target_file_path := nullif(trim(player_row.metadata_json ->> 'birthCertificatePath'), '');
      if target_file_path is null then
        continue;
      end if;

      perform public.ensure_personal_file_system(player_row.owner_user_id);
      target_folder_id := public.resolve_system_folder_id(null, player_row.owner_user_id, 'my-uploads');
      if target_folder_id is not null then
        target_name := public.file_manager_legacy_name(target_file_path);
        target_extension := lower(split_part(target_name, '.', array_length(string_to_array(target_name, '.'), 1)));

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
          player_row.owner_user_id,
          target_folder_id,
          target_name,
          target_extension,
          public.file_manager_legacy_mime(target_file_path),
          0,
          'account-assets',
          target_file_path,
          'private',
          'personal',
          null,
          jsonb_build_object('legacy', true, 'legacyField', 'players.metadata_json.birthCertificatePath'),
          player_row.owner_user_id
        )
        on conflict (bucket, storage_path) do nothing;
      end if;
    end loop;
  end if;

  for page_row in
    select page.org_id, block.id as block_id, block.type, block.config
    from public.org_page_blocks block
    join public.org_pages page on page.id = block.org_page_id
    where block.type in ('hero', 'cta_card')
  loop
    perform public.ensure_org_file_system(page_row.org_id, null);
    target_folder_id := public.resolve_system_folder_id(page_row.org_id, null, 'media');
    if target_folder_id is null then
      continue;
    end if;

    if page_row.type = 'hero' then
      target_file_path := nullif(trim(page_row.config ->> 'backgroundImagePath'), '');
    else
      target_file_path := nullif(trim(page_row.config ->> 'imagePath'), '');
    end if;

    if target_file_path is null then
      continue;
    end if;

    target_name := public.file_manager_legacy_name(target_file_path);
    target_extension := lower(split_part(target_name, '.', array_length(string_to_array(target_name, '.'), 1)));

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
      page_row.org_id,
      target_folder_id,
      target_name,
      target_extension,
      public.file_manager_legacy_mime(target_file_path),
      0,
      'org-site-assets',
      target_file_path,
      'public',
      'pages',
      'general',
      jsonb_build_object('legacy', true, 'legacyField', 'org_page_blocks', 'blockId', page_row.block_id, 'blockType', page_row.type),
      null
    )
    on conflict (bucket, storage_path) do nothing;
  end loop;

  -- backfill any existing uploaded objects not already represented in app_files
  if to_regclass('storage.objects') is not null then
    for storage_row in
      select object.bucket_id, object.name
      from storage.objects object
      where object.bucket_id in ('org-assets', 'org-site-assets', 'account-assets')
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
        if split_part(target_file_path, '/', 1) !~* '^[0-9a-f-]{36}$' then
          continue;
        end if;

        target_org_id := (split_part(target_file_path, '/', 1))::uuid;
        target_purpose := nullif(split_part(target_file_path, '/', 2), '');
        target_visibility := 'public';

        if target_purpose in ('site-hero', 'site-block-image') then
          target_folder_key := 'media';
        elsif target_purpose = 'attachment' then
          target_folder_key := 'documents';
        else
          target_folder_key := 'media';
        end if;
        target_access_tag := 'pages';
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
  end if;
end;
$$;

drop trigger if exists app_file_folders_set_updated_at on public.app_file_folders;
create trigger app_file_folders_set_updated_at before update on public.app_file_folders for each row execute procedure public.set_updated_at();

drop trigger if exists app_files_set_updated_at on public.app_files;
create trigger app_files_set_updated_at before update on public.app_files for each row execute procedure public.set_updated_at();

alter table public.app_file_folders enable row level security;
alter table public.app_files enable row level security;

drop policy if exists app_file_folders_read on public.app_file_folders;
create policy app_file_folders_read on public.app_file_folders
  for select
  using (
    (scope = 'personal' and owner_user_id = auth.uid())
    or (
      scope = 'organization'
      and org_id is not null
      and public.file_manager_read_allowed(org_id, access_tag)
    )
  );

drop policy if exists app_file_folders_write on public.app_file_folders;
create policy app_file_folders_write on public.app_file_folders
  for all
  using (
    (scope = 'personal' and owner_user_id = auth.uid())
    or (
      scope = 'organization'
      and org_id is not null
      and public.file_manager_write_allowed(org_id, access_tag)
    )
  )
  with check (
    (scope = 'personal' and owner_user_id = auth.uid())
    or (
      scope = 'organization'
      and org_id is not null
      and public.file_manager_write_allowed(org_id, access_tag)
    )
  );

drop policy if exists app_files_read on public.app_files;
create policy app_files_read on public.app_files
  for select
  using (
    (scope = 'personal' and owner_user_id = auth.uid())
    or (
      scope = 'organization'
      and org_id is not null
      and public.file_manager_read_allowed(org_id, access_tag)
    )
  );

drop policy if exists app_files_write on public.app_files;
create policy app_files_write on public.app_files
  for all
  using (
    (scope = 'personal' and owner_user_id = auth.uid())
    or (
      scope = 'organization'
      and org_id is not null
      and public.file_manager_write_allowed(org_id, access_tag)
    )
  )
  with check (
    (scope = 'personal' and owner_user_id = auth.uid())
    or (
      scope = 'organization'
      and org_id is not null
      and public.file_manager_write_allowed(org_id, access_tag)
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'org-private-files',
  'org-private-files',
  false,
  20971520,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml',
    'image/heic',
    'image/heif',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'account-assets',
  'account-assets',
  false,
  10485760,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml',
    'image/heic',
    'image/heif',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists org_private_files_read on storage.objects;
create policy org_private_files_read on storage.objects
  for select
  using (
    bucket_id = 'org-private-files'
    and split_part(name, '/', 1) = 'orgs'
    and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
    and public.file_manager_read_allowed((split_part(name, '/', 2))::uuid, 'manage')
  );

drop policy if exists org_private_files_write on storage.objects;
create policy org_private_files_write on storage.objects
  for all
  using (
    bucket_id = 'org-private-files'
    and split_part(name, '/', 1) = 'orgs'
    and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
    and public.file_manager_write_allowed((split_part(name, '/', 2))::uuid, 'manage')
  )
  with check (
    bucket_id = 'org-private-files'
    and split_part(name, '/', 1) = 'orgs'
    and split_part(name, '/', 2) ~* '^[0-9a-f-]{36}$'
    and public.file_manager_write_allowed((split_part(name, '/', 2))::uuid, 'manage')
  );

drop policy if exists account_assets_user_read on storage.objects;
create policy account_assets_user_read on storage.objects
  for select
  using (
    bucket_id = 'account-assets'
    and split_part(name, '/', 1) = 'users'
    and split_part(name, '/', 2) = auth.uid()::text
  );

drop policy if exists account_assets_user_write on storage.objects;
create policy account_assets_user_write on storage.objects
  for all
  using (
    bucket_id = 'account-assets'
    and split_part(name, '/', 1) = 'users'
    and split_part(name, '/', 2) = auth.uid()::text
  )
  with check (
    bucket_id = 'account-assets'
    and split_part(name, '/', 1) = 'users'
    and split_part(name, '/', 2) = auth.uid()::text
  );

-- initialize folders for existing orgs/users and backfill references
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
select
  'personal',
  membership.user_id,
  null,
  'Personal Uploads',
  'personal-uploads',
  'personal',
  true,
  null,
  jsonb_build_object('systemKey', 'personal-root'),
  membership.user_id
from public.org_memberships membership
on conflict do nothing;

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
select
  'personal',
  root.owner_user_id,
  root.id,
  'My Uploads',
  'my-uploads',
  'personal',
  true,
  null,
  jsonb_build_object('systemKey', 'my-uploads'),
  root.owner_user_id
from public.app_file_folders root
where root.scope = 'personal'
  and root.parent_id is null
  and root.slug = 'personal-uploads'
on conflict do nothing;

do $$
declare
  org_row record;
begin
  for org_row in select id from public.orgs loop
    perform public.ensure_org_file_system(org_row.id, null);
    perform public.sync_org_entity_file_folders(org_row.id, null);
  end loop;

  perform public.backfill_legacy_file_records();
end;
$$;

commit;
