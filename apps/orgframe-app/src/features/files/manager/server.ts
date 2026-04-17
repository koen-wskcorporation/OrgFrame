import "server-only";

import { createSupabaseServer } from "@/src/shared/data-api/server";
import { createOptionalSupabaseServiceRoleClient } from "@/src/shared/data-api/server";
import { getDataApiPublicConfig } from "@/src/shared/data-api/config";
import { resolveUploadedAssetUrl } from "@/src/features/files/uploads/server";
import type {
  FileManagerAccessTag,
  FileManagerFile,
  FileManagerFolder,
  FileManagerScope,
  FileManagerSort,
  FileManagerUploadPayload,
  FileManagerVisibility
} from "@/src/features/files/manager/types";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function asInteger(value: unknown) {
  const parsed = asNumber(value);
  if (parsed === null) {
    return null;
  }

  return Math.round(parsed);
}

function asCrop(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const input = value as Record<string, unknown>;
  const focalX = asNumber(input.focalX);
  const focalY = asNumber(input.focalY);
  const zoom = asNumber(input.zoom);

  if (focalX === null || focalY === null || zoom === null) {
    return undefined;
  }

  return {
    focalX,
    focalY,
    zoom
  };
}

function normalizeFileName(name: string) {
  return name.trim().replace(/\s+/g, " ") || "file";
}

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return slug || "item";
}

function splitNameAndExtension(fileName: string) {
  const normalized = normalizeFileName(fileName);
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === normalized.length - 1) {
    return {
      stem: normalized,
      extension: null
    };
  }

  return {
    stem: normalized.slice(0, dotIndex),
    extension: normalized.slice(dotIndex + 1).toLowerCase()
  };
}

function buildUniqueName(candidate: string, existingNames: string[]) {
  const used = new Set(existingNames.map((name) => name.toLowerCase()));
  if (!used.has(candidate.toLowerCase())) {
    return candidate;
  }

  const { stem, extension } = splitNameAndExtension(candidate);
  let index = 2;

  while (true) {
    const trial = extension ? `${stem} (${index}).${extension}` : `${stem} (${index})`;
    if (!used.has(trial.toLowerCase())) {
      return trial;
    }

    index += 1;
  }
}

function fileOrder(sort: FileManagerSort) {
  switch (sort) {
    case "name-asc":
      return [{ column: "name", ascending: true }] as const;
    case "name-desc":
      return [{ column: "name", ascending: false }] as const;
    case "oldest":
      return [{ column: "created_at", ascending: true }] as const;
    case "size-asc":
      return [{ column: "size_bytes", ascending: true }] as const;
    case "size-desc":
      return [{ column: "size_bytes", ascending: false }] as const;
    case "newest":
    default:
      return [{ column: "created_at", ascending: false }] as const;
  }
}

function mapFolderRow(row: Record<string, unknown>): FileManagerFolder {
  return {
    id: asString(row.id),
    scope: asString(row.scope) as FileManagerScope,
    orgId: asNullableString(row.org_id),
    ownerUserId: asNullableString(row.owner_user_id),
    parentId: asNullableString(row.parent_id),
    name: asString(row.name),
    slug: asString(row.slug),
    accessTag: asString(row.access_tag) as FileManagerAccessTag,
    isSystem: row.is_system === true,
    entityType: (asNullableString(row.entity_type) as FileManagerFolder["entityType"]) ?? null,
    entityId: asNullableString(row.entity_id),
    metadataJson: asObject(row.metadata_json),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at)
  };
}

function mapFileRow(row: Record<string, unknown>, url: string | null): FileManagerFile {
  return {
    id: asString(row.id),
    name: asString(row.name),
    scope: asString(row.scope) as FileManagerScope,
    folderId: asString(row.folder_id),
    orgId: asNullableString(row.org_id),
    ownerUserId: asNullableString(row.owner_user_id),
    mime: asString(row.mime_type),
    size: asNumber(row.size_bytes) ?? 0,
    bucket: asString(row.bucket),
    path: asString(row.storage_path),
    url,
    visibility: asString(row.visibility) as FileManagerVisibility,
    accessTag: asString(row.access_tag) as FileManagerAccessTag,
    entityType: (asNullableString(row.entity_type) as FileManagerFile["entityType"]) ?? null,
    entityId: asNullableString(row.entity_id),
    width: asInteger(row.width) ?? undefined,
    height: asInteger(row.height) ?? undefined,
    crop: asCrop(row.crop_json),
    dominantColor: asNullableString(row.dominant_color) ?? undefined,
    uploaderUserId: asNullableString(row.uploader_user_id),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    metadataJson: asObject(row.metadata_json)
  };
}

function encodePath(path: string) {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function resolveFileUrls(rows: Array<Record<string, unknown>>) {
  const service = createOptionalSupabaseServiceRoleClient();
  const signedByKey = new Map<string, string | null>();
  const publicConfig = getDataApiPublicConfig();

  const privateRowsByBucket = new Map<string, string[]>();

  for (const row of rows) {
    const bucket = asString(row.bucket);
    const path = asString(row.storage_path);
    const visibility = asString(row.visibility);
    const key = `${bucket}:${path}`;

    if (!bucket || !path) {
      signedByKey.set(key, null);
      continue;
    }

    if (visibility === "public") {
      signedByKey.set(key, `${publicConfig.supabaseUrl}/storage/v1/object/public/${bucket}/${encodePath(path)}`);
      continue;
    }

    const current = privateRowsByBucket.get(bucket) ?? [];
    current.push(path);
    privateRowsByBucket.set(bucket, current);
  }

  for (const [bucket, paths] of privateRowsByBucket.entries()) {
    if (paths.length === 0) {
      continue;
    }

    if (service) {
      const { data, error } = await service.storage.from(bucket).createSignedUrls(paths, 60 * 60);

      if (!error && data) {
        for (const item of data) {
          signedByKey.set(`${bucket}:${item.path}`, item.signedUrl ?? null);
        }
        continue;
      }
    }

    for (const path of paths) {
      const resolved = await resolveUploadedAssetUrl(bucket, path);
      signedByKey.set(`${bucket}:${path}`, resolved);
    }
  }

  return signedByKey;
}

export async function initializeScope(input: { scope: FileManagerScope; orgId?: string | null; userId: string }) {
  const supabase = await createSupabaseServer();

  if (input.scope === "organization" && input.orgId) {
    await supabase.rpc("ensure_org_file_system", {
      target_org_id: input.orgId,
      actor_user_id: input.userId
    });
    await supabase.rpc("sync_org_entity_file_folders", {
      target_org_id: input.orgId,
      actor_user_id: input.userId
    });
    return;
  }

  await supabase.rpc("ensure_personal_file_system", {
    target_user_id: input.userId
  });
}

export async function listFolders(input: { scope: FileManagerScope; orgId?: string | null; userId: string }) {
  const supabase = await createSupabaseServer();
  let query = supabase
    .schema("files").from("app_file_folders")
    .select("id, scope, org_id, owner_user_id, parent_id, name, slug, access_tag, is_system, entity_type, entity_id, metadata_json, created_at, updated_at")
    .eq("scope", input.scope)
    .order("is_system", { ascending: false })
    .order("name", { ascending: true });

  if (input.scope === "organization") {
    query = query.eq("org_id", input.orgId ?? "");
  } else {
    query = query.eq("owner_user_id", input.userId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list folders: ${error.message}`);
  }

  return (data ?? []).map((row) => mapFolderRow(row as Record<string, unknown>));
}

export async function listFiles(input: {
  scope: FileManagerScope;
  orgId?: string | null;
  userId: string;
  folderId?: string | null;
  search?: string;
  sort?: FileManagerSort;
}) {
  const supabase = await createSupabaseServer();
  let query = supabase
    .schema("files").from("app_files")
    .select(
      "id, scope, org_id, owner_user_id, folder_id, name, extension, mime_type, size_bytes, bucket, storage_path, visibility, access_tag, entity_type, entity_id, width, height, crop_json, dominant_color, metadata_json, uploader_user_id, created_at, updated_at"
    )
    .eq("scope", input.scope);

  if (input.scope === "organization") {
    query = query.eq("org_id", input.orgId ?? "");
  } else {
    query = query.eq("owner_user_id", input.userId);
  }

  const normalizedSearch = input.search?.trim();
  if (normalizedSearch) {
    query = query.ilike("name", `%${normalizedSearch}%`);
  } else if (input.folderId) {
    query = query.eq("folder_id", input.folderId);
  }

  const order = fileOrder(input.sort ?? "newest");
  for (const item of order) {
    query = query.order(item.column, { ascending: item.ascending });
  }

  const { data, error } = await query.limit(300);

  if (error) {
    throw new Error(`Failed to list files: ${error.message}`);
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const urls = await resolveFileUrls(rows);

  return rows.map((row) => {
    const key = `${asString(row.bucket)}:${asString(row.storage_path)}`;
    return mapFileRow(row, urls.get(key) ?? null);
  });
}

export function resolveSystemFolderIds(folders: FileManagerFolder[]) {
  const result: Record<string, string> = {};

  for (const folder of folders) {
    if (!folder.isSystem) {
      continue;
    }

    if (folder.slug === "programs") {
      result.programs = folder.id;
    } else if (folder.slug === "divisions") {
      result.divisions = folder.id;
    } else if (folder.slug === "teams") {
      result.teams = folder.id;
    } else if (folder.slug === "branding") {
      result.branding = folder.id;
    } else if (folder.slug === "documents") {
      result.documents = folder.id;
    } else if (folder.slug === "imports") {
      result.imports = folder.id;
    } else if (folder.slug === "media") {
      result.media = folder.id;
    } else if (folder.slug === "my-uploads") {
      result["my-uploads"] = folder.id;
    } else if (folder.slug === "organization-files") {
      result["organization-files"] = folder.id;
    } else if (folder.slug === "personal-uploads") {
      result["personal-uploads"] = folder.id;
    }
  }

  return result;
}

async function listSiblingFolderNames(input: { scope: FileManagerScope; orgId?: string | null; userId: string; parentId: string | null; excludeId?: string }) {
  const supabase = await createSupabaseServer();
  let query = supabase
    .schema("files").from("app_file_folders")
    .select("id, name")
    .eq("scope", input.scope)
    .is("parent_id", input.parentId);

  if (input.scope === "organization") {
    query = query.eq("org_id", input.orgId ?? "");
  } else {
    query = query.eq("owner_user_id", input.userId);
  }

  if (input.excludeId) {
    query = query.neq("id", input.excludeId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list sibling folders: ${error.message}`);
  }

  return (data ?? []).map((row) => asString((row as Record<string, unknown>).name));
}

async function listSiblingFileNames(input: { scope: FileManagerScope; orgId?: string | null; userId: string; folderId: string; excludeId?: string }) {
  const supabase = await createSupabaseServer();
  let query = supabase.schema("files").from("app_files").select("id, name").eq("scope", input.scope).eq("folder_id", input.folderId);

  if (input.scope === "organization") {
    query = query.eq("org_id", input.orgId ?? "");
  } else {
    query = query.eq("owner_user_id", input.userId);
  }

  if (input.excludeId) {
    query = query.neq("id", input.excludeId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list sibling files: ${error.message}`);
  }

  return (data ?? []).map((row) => asString((row as Record<string, unknown>).name));
}

export async function getFolderById(folderId: string) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("files").from("app_file_folders")
    .select("id, scope, org_id, owner_user_id, parent_id, name, slug, access_tag, is_system, entity_type, entity_id, metadata_json, created_at, updated_at")
    .eq("id", folderId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load folder: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return mapFolderRow(data as Record<string, unknown>);
}

export async function getFileById(fileId: string) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("files").from("app_files")
    .select(
      "id, scope, org_id, owner_user_id, folder_id, name, extension, mime_type, size_bytes, bucket, storage_path, visibility, access_tag, entity_type, entity_id, width, height, crop_json, dominant_color, metadata_json, uploader_user_id, created_at, updated_at"
    )
    .eq("id", fileId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load file: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const row = data as Record<string, unknown>;
  const urls = await resolveFileUrls([row]);
  const key = `${asString(row.bucket)}:${asString(row.storage_path)}`;
  return mapFileRow(row, urls.get(key) ?? null);
}

export async function createFolderRecord(input: {
  scope: FileManagerScope;
  orgId?: string | null;
  userId: string;
  parentId: string | null;
  name: string;
  accessTag: FileManagerAccessTag;
  entityType?: FileManagerFolder["entityType"];
  entityId?: string | null;
}) {
  const supabase = await createSupabaseServer();
  const siblingNames = await listSiblingFolderNames({
    scope: input.scope,
    orgId: input.orgId,
    userId: input.userId,
    parentId: input.parentId
  });

  const resolvedName = buildUniqueName(normalizeFileName(input.name), siblingNames);

  const { data, error } = await supabase
    .schema("files").from("app_file_folders")
    .insert({
      scope: input.scope,
      org_id: input.scope === "organization" ? input.orgId : null,
      owner_user_id: input.scope === "personal" ? input.userId : null,
      parent_id: input.parentId,
      name: resolvedName,
      slug: slugify(resolvedName),
      access_tag: input.accessTag,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      created_by_user_id: input.userId
    })
    .select("id, scope, org_id, owner_user_id, parent_id, name, slug, access_tag, is_system, entity_type, entity_id, metadata_json, created_at, updated_at")
    .single();

  if (error) {
    throw new Error(`Failed to create folder: ${error.message}`);
  }

  return mapFolderRow(data as Record<string, unknown>);
}

export async function renameFolderRecord(input: { folderId: string; name: string; userId: string }) {
  const folder = await getFolderById(input.folderId);
  if (!folder) {
    throw new Error("Folder not found.");
  }

  if (folder.isSystem) {
    throw new Error("System folders cannot be renamed.");
  }

  const siblingNames = await listSiblingFolderNames({
    scope: folder.scope,
    orgId: folder.orgId,
    userId: folder.ownerUserId ?? input.userId,
    parentId: folder.parentId,
    excludeId: folder.id
  });

  const resolvedName = buildUniqueName(normalizeFileName(input.name), siblingNames);

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("files").from("app_file_folders")
    .update({
      name: resolvedName,
      slug: slugify(resolvedName)
    })
    .eq("id", folder.id)
    .select("id, scope, org_id, owner_user_id, parent_id, name, slug, access_tag, is_system, entity_type, entity_id, metadata_json, created_at, updated_at")
    .single();

  if (error) {
    throw new Error(`Failed to rename folder: ${error.message}`);
  }

  return mapFolderRow(data as Record<string, unknown>);
}

export async function moveFolderRecord(input: { folderId: string; parentId: string | null }) {
  const folder = await getFolderById(input.folderId);
  if (!folder) {
    throw new Error("Folder not found.");
  }

  if (folder.isSystem) {
    throw new Error("System folders cannot be moved.");
  }

  if (input.parentId === folder.id) {
    throw new Error("Folder cannot be moved into itself.");
  }

  const allFolders = await listFolders({
    scope: folder.scope,
    orgId: folder.orgId,
    userId: folder.ownerUserId ?? ""
  });

  const descendants = new Set<string>();
  const pending = [folder.id];

  while (pending.length > 0) {
    const current = pending.pop() as string;
    descendants.add(current);
    for (const candidate of allFolders) {
      if (candidate.parentId === current && !descendants.has(candidate.id)) {
        pending.push(candidate.id);
      }
    }
  }

  if (input.parentId && descendants.has(input.parentId)) {
    throw new Error("Folder cannot be moved into one of its descendants.");
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("files").from("app_file_folders")
    .update({ parent_id: input.parentId })
    .eq("id", folder.id)
    .select("id, scope, org_id, owner_user_id, parent_id, name, slug, access_tag, is_system, entity_type, entity_id, metadata_json, created_at, updated_at")
    .single();

  if (error) {
    throw new Error(`Failed to move folder: ${error.message}`);
  }

  return mapFolderRow(data as Record<string, unknown>);
}

async function removeStorageObjects(files: Array<{ bucket: string; path: string }>) {
  if (files.length === 0) {
    return;
  }

  const grouped = new Map<string, string[]>();
  for (const file of files) {
    const current = grouped.get(file.bucket) ?? [];
    current.push(file.path);
    grouped.set(file.bucket, current);
  }

  const service = createOptionalSupabaseServiceRoleClient() ?? (await createSupabaseServer());

  for (const [bucket, paths] of grouped.entries()) {
    if (paths.length === 0) {
      continue;
    }

    await service.storage.from(bucket).remove(paths);
  }
}

export async function deleteFolderRecord(input: { folderId: string }) {
  const folder = await getFolderById(input.folderId);
  if (!folder) {
    throw new Error("Folder not found.");
  }

  if (folder.isSystem) {
    throw new Error("System folders cannot be deleted.");
  }

  const allFolders = await listFolders({
    scope: folder.scope,
    orgId: folder.orgId,
    userId: folder.ownerUserId ?? ""
  });

  const targetFolderIds = new Set<string>([folder.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of allFolders) {
      if (candidate.parentId && targetFolderIds.has(candidate.parentId) && !targetFolderIds.has(candidate.id)) {
        targetFolderIds.add(candidate.id);
        changed = true;
      }
    }
  }

  const supabase = await createSupabaseServer();
  let filesQuery = supabase.schema("files").from("app_files").select("bucket, storage_path, folder_id").in("folder_id", Array.from(targetFolderIds));

  if (folder.scope === "organization") {
    filesQuery = filesQuery.eq("org_id", folder.orgId ?? "");
  } else {
    filesQuery = filesQuery.eq("owner_user_id", folder.ownerUserId ?? "");
  }

  const { data: fileRows, error: filesError } = await filesQuery;
  if (filesError) {
    throw new Error(`Failed to list folder files: ${filesError.message}`);
  }

  await removeStorageObjects(
    (fileRows ?? []).map((row) => ({
      bucket: asString((row as Record<string, unknown>).bucket),
      path: asString((row as Record<string, unknown>).storage_path)
    }))
  );

  const { error } = await supabase.schema("files").from("app_file_folders").delete().eq("id", folder.id);
  if (error) {
    throw new Error(`Failed to delete folder: ${error.message}`);
  }
}

export async function renameFileRecord(input: { fileId: string; name: string; userId: string }) {
  const file = await getFileById(input.fileId);
  if (!file) {
    throw new Error("File not found.");
  }

  const siblingNames = await listSiblingFileNames({
    scope: file.scope,
    orgId: file.orgId,
    userId: file.ownerUserId ?? "",
    folderId: file.folderId,
    excludeId: file.id
  });

  const resolvedName = buildUniqueName(normalizeFileName(input.name), siblingNames);

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("files").from("app_files")
    .update({
      name: resolvedName,
      extension: splitNameAndExtension(resolvedName).extension,
      metadata_json: {
        ...file.metadataJson,
        lastEditedByUserId: input.userId,
        lastEditedAt: new Date().toISOString()
      }
    })
    .eq("id", file.id)
    .select(
      "id, scope, org_id, owner_user_id, folder_id, name, extension, mime_type, size_bytes, bucket, storage_path, visibility, access_tag, entity_type, entity_id, width, height, crop_json, dominant_color, metadata_json, uploader_user_id, created_at, updated_at"
    )
    .single();

  if (error) {
    throw new Error(`Failed to rename file: ${error.message}`);
  }

  const row = data as Record<string, unknown>;
  const urls = await resolveFileUrls([row]);
  const key = `${asString(row.bucket)}:${asString(row.storage_path)}`;
  return mapFileRow(row, urls.get(key) ?? null);
}

export async function moveFileRecord(input: { fileId: string; folderId: string; userId: string }) {
  const file = await getFileById(input.fileId);
  if (!file) {
    throw new Error("File not found.");
  }

  const targetFolder = await getFolderById(input.folderId);
  if (!targetFolder) {
    throw new Error("Target folder not found.");
  }

  if (targetFolder.scope !== file.scope) {
    throw new Error("File scope mismatch.");
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("files").from("app_files")
    .update({
      folder_id: targetFolder.id,
      scope: targetFolder.scope,
      org_id: targetFolder.orgId,
      owner_user_id: targetFolder.ownerUserId,
      access_tag: targetFolder.accessTag,
      entity_type: targetFolder.entityType,
      entity_id: targetFolder.entityId,
      metadata_json: {
        ...file.metadataJson,
        lastEditedByUserId: input.userId,
        lastEditedAt: new Date().toISOString()
      }
    })
    .eq("id", file.id)
    .select(
      "id, scope, org_id, owner_user_id, folder_id, name, extension, mime_type, size_bytes, bucket, storage_path, visibility, access_tag, entity_type, entity_id, width, height, crop_json, dominant_color, metadata_json, uploader_user_id, created_at, updated_at"
    )
    .single();

  if (error) {
    throw new Error(`Failed to move file: ${error.message}`);
  }

  const row = data as Record<string, unknown>;
  const urls = await resolveFileUrls([row]);
  const key = `${asString(row.bucket)}:${asString(row.storage_path)}`;
  return mapFileRow(row, urls.get(key) ?? null);
}

export async function deleteFileRecord(input: { fileId: string }) {
  const file = await getFileById(input.fileId);
  if (!file) {
    throw new Error("File not found.");
  }

  await removeStorageObjects([{ bucket: file.bucket, path: file.path }]);

  const supabase = await createSupabaseServer();
  const { error } = await supabase.schema("files").from("app_files").delete().eq("id", file.id);

  if (error) {
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

export async function resolveFolderAccessContext(input: {
  payload: FileManagerUploadPayload;
  userId: string;
  orgId?: string | null;
}) {
  const folder = await getFolderById(input.payload.folderId);
  if (!folder) {
    throw new Error("Target folder not found.");
  }

  if (folder.scope !== input.payload.scope) {
    throw new Error("Target folder scope mismatch.");
  }

  if (folder.scope === "organization") {
    if (!input.orgId || folder.orgId !== input.orgId) {
      throw new Error("Target folder organization mismatch.");
    }
  } else if (folder.ownerUserId !== input.userId) {
    throw new Error("Target folder ownership mismatch.");
  }

  return folder;
}

function buildStoragePath(input: {
  scope: FileManagerScope;
  orgId?: string | null;
  userId: string;
  folderId: string;
  extension: string | null;
  bucket: string;
  legacyPurpose?: string | null;
}) {
  const suffix = input.extension ? `.${input.extension}` : "";
  const fileId = `${crypto.randomUUID()}${suffix}`;

  if (input.scope === "organization") {
    const orgId = input.orgId ?? "";

    if (input.bucket === "org-assets" && input.legacyPurpose) {
      return `orgs/${orgId}/${input.legacyPurpose}/${fileId}`;
    }

    if (input.bucket === "org-site-assets") {
      return `${orgId}/managed/${input.folderId}/${fileId}`;
    }

    return `orgs/${orgId}/files/${input.folderId}/${fileId}`;
  }

  return `users/${input.userId}/files/${input.folderId}/${fileId}`;
}

export async function insertUploadedFileRecord(input: {
  payload: FileManagerUploadPayload;
  folder: FileManagerFolder;
  userId: string;
  orgId?: string | null;
  fileName: string;
  fileMime: string;
  fileSize: number;
  bucket: string;
  storagePath: string;
}) {
  const siblingNames = await listSiblingFileNames({
    scope: input.folder.scope,
    orgId: input.folder.orgId,
    userId: input.folder.ownerUserId ?? input.userId,
    folderId: input.folder.id
  });

  const resolvedName = buildUniqueName(normalizeFileName(input.fileName), siblingNames);
  const extension = splitNameAndExtension(resolvedName).extension;

  const accessTag = input.payload.accessTag ?? input.folder.accessTag;
  const visibility = input.payload.visibility ?? (input.bucket === "org-site-assets" || input.bucket === "org-assets" ? "public" : "private");
  const entityType = input.payload.entityType ?? input.folder.entityType;
  const entityId = input.payload.entityId ?? input.folder.entityId;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("files").from("app_files")
    .insert({
      scope: input.folder.scope,
      org_id: input.folder.orgId,
      owner_user_id: input.folder.ownerUserId,
      folder_id: input.folder.id,
      name: resolvedName,
      extension,
      mime_type: input.fileMime || "application/octet-stream",
      size_bytes: input.fileSize,
      bucket: input.bucket,
      storage_path: input.storagePath,
      visibility,
      access_tag: accessTag,
      entity_type: entityType,
      entity_id: entityId,
      width: input.payload.width ?? null,
      height: input.payload.height ?? null,
      crop_json: input.payload.crop ?? null,
      dominant_color: input.payload.dominantColor ?? null,
      metadata_json: {
        ...(input.payload.metadataJson ?? {}),
        legacyPurpose: input.payload.legacyPurpose ?? null,
        createdByUserId: input.userId,
        lastEditedByUserId: input.userId,
        lastEditedAt: new Date().toISOString()
      },
      uploader_user_id: input.userId
    })
    .select(
      "id, scope, org_id, owner_user_id, folder_id, name, extension, mime_type, size_bytes, bucket, storage_path, visibility, access_tag, entity_type, entity_id, width, height, crop_json, dominant_color, metadata_json, uploader_user_id, created_at, updated_at"
    )
    .single();

  if (error) {
    throw new Error(`Failed to create file record: ${error.message}`);
  }

  const row = data as Record<string, unknown>;
  const urls = await resolveFileUrls([row]);
  const key = `${asString(row.bucket)}:${asString(row.storage_path)}`;
  return mapFileRow(row, urls.get(key) ?? null);
}

export async function uploadBinaryToStorage(input: {
  scope: FileManagerScope;
  bucket: string;
  folderId: string;
  orgId?: string | null;
  userId: string;
  extension: string | null;
  bytes: ArrayBuffer;
  contentType: string;
  legacyPurpose?: string | null;
}) {
  const path = buildStoragePath({
    scope: input.scope,
    orgId: input.orgId,
    userId: input.userId,
    folderId: input.folderId,
    extension: input.extension,
    bucket: input.bucket,
    legacyPurpose: input.legacyPurpose
  });

  const client = createOptionalSupabaseServiceRoleClient() ?? (await createSupabaseServer());
  const { error } = await client.storage.from(input.bucket).upload(path, input.bytes, {
    contentType: input.contentType || undefined,
    upsert: false
  });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  return path;
}
