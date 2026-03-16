import "server-only";

import { createSupabaseServer } from "@/lib/supabase/server";
import { createOptionalSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

const extensionByMimeType: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/heic-sequence": "heic",
  "image/heif-sequence": "heif",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx"
};

const imageExtensions = new Set(["png", "jpg", "jpeg", "webp", "svg", "gif", "avif", "bmp", "ico", "heic", "heif"]);

function normalizeExtension(value: string) {
  const normalized = value.trim().toLowerCase().replace(/^\./, "");

  if (!normalized) {
    return "";
  }

  return normalized === "jpeg" ? "jpg" : normalized;
}

function encodePath(path: string) {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function mbToBytes(sizeMb: number) {
  return Math.floor(sizeMb * 1024 * 1024);
}

export function resolveMaxSizeMb(defaultMaxSizeMb: number, requestedMaxSizeMb: number | undefined) {
  if (!requestedMaxSizeMb || Number.isNaN(requestedMaxSizeMb) || requestedMaxSizeMb <= 0) {
    return defaultMaxSizeMb;
  }

  return Math.min(defaultMaxSizeMb, requestedMaxSizeMb);
}

export function resolveFileExtension(file: File, allowedExtensions: string[]) {
  const normalizedAllowed = new Set(allowedExtensions.map((entry) => normalizeExtension(entry)));
  const mimeExtension = normalizeExtension(extensionByMimeType[file.type] ?? "");

  if (mimeExtension && normalizedAllowed.has(mimeExtension)) {
    return mimeExtension;
  }

  const nameExtension = normalizeExtension(file.name.split(".").pop() ?? "");
  if (nameExtension && normalizedAllowed.has(nameExtension)) {
    return nameExtension;
  }

  return null;
}

function matchesAcceptToken(file: File, tokenRaw: string) {
  const token = tokenRaw.trim().toLowerCase();
  if (!token) {
    return false;
  }

  if (token.startsWith(".")) {
    const extension = normalizeExtension(file.name.split(".").pop() ?? "");
    return extension === normalizeExtension(token);
  }

  if (token.endsWith("/*")) {
    const major = token.slice(0, -1);
    if (file.type.toLowerCase().startsWith(major)) {
      return true;
    }

    if (major === "image/") {
      const extension = normalizeExtension(file.name.split(".").pop() ?? "");
      return imageExtensions.has(extension);
    }

    return false;
  }

  return file.type.toLowerCase() === token;
}

export function fileMatchesAcceptConstraint(file: File, accept: string | undefined) {
  if (!accept) {
    return true;
  }

  const tokens = accept
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return true;
  }

  return tokens.some((token) => matchesAcceptToken(file, token));
}

export function buildOrgStoragePath(orgId: string, purpose: string, extension: string) {
  return `orgs/${orgId}/${purpose}/${crypto.randomUUID()}.${normalizeExtension(extension)}`;
}

export function buildUserStoragePath(userId: string, purpose: string, extension: string) {
  return `users/${userId}/${purpose}/${crypto.randomUUID()}.${normalizeExtension(extension)}`;
}

async function createSignedUrl(bucket: string, path: string) {
  const serviceRoleClient = createOptionalSupabaseServiceRoleClient();

  if (serviceRoleClient) {
    const { data, error } = await serviceRoleClient.storage.from(bucket).createSignedUrl(path, 60 * 60);
    if (!error) {
      return data.signedUrl;
    }
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);

  if (error) {
    return null;
  }

  return data.signedUrl;
}

export async function resolveUploadedAssetUrl(bucket: string, path: string) {
  if (bucket === "org-site-assets") {
    const { supabaseUrl } = getSupabasePublicConfig();
    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${encodePath(path)}`;
  }

  return createSignedUrl(bucket, path);
}
