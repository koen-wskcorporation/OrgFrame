"use server";

import { z } from "zod";
import { requireOrgPermission } from "@/src/shared/permissions/requireOrgPermission";
import { requireOrgToolEnabled } from "@/src/shared/org/requireOrgToolEnabled";
import { createSupabaseServer } from "@/src/shared/data-api/server";
import { getSupabasePublicConfig } from "@/src/shared/supabase/config";
import {
  type ConflictRecord,
  type ImportPlatformCatalogItem,
  type ImportPlatformKey,
  type ImportProfileKey,
  type ImportRunListItem,
  type ImportRunStatus,
  importPlatformKeys
} from "@/src/features/imports/contracts";
import { importProfiles } from "@/src/features/imports/contracts";
import {
  decryptSportsEngineToken,
  encryptSportsEngineToken,
  fetchSportsEngineDataset,
  getSportsEngineOauthConfig,
  refreshSportsEngineToken
} from "@/src/features/imports/integrations/sportsengine";

const startRunSchema = z.object({
  orgSlug: z.string().trim().min(1),
  fileId: z.string().uuid().optional(),
  filePath: z.string().trim().min(1).optional(),
  fileName: z.string().trim().min(1).optional(),
  bucket: z.string().trim().min(1).default("org-assets"),
  mimeType: z.string().trim().min(1).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  sourcePlatformKey: z.enum(importPlatformKeys),
  importSessionId: z.string().uuid().optional(),
  profileKey: z.enum(importProfiles).optional().default("people_roster"),
  importantFields: z.array(z.string().trim().min(1).max(80)).max(40).optional().default([]),
  rowSelectionMode: z.enum(["all", "subset"]).optional().default("all"),
  selectedRowNumbers: z.array(z.number().int().positive()).max(50000).optional().default([]),
  excludedRowNumbers: z.array(z.number().int().positive()).max(50000).optional().default([]),
  inlineRows: z.array(z.record(z.string(), z.unknown())).max(25000).optional().default([])
});

const previewFileSchema = z.object({
  orgSlug: z.string().trim().min(1),
  filePath: z.string().trim().min(1),
  fileName: z.string().trim().min(1),
  bucket: z.string().trim().min(1).default("org-assets"),
  mimeType: z.string().trim().min(1).optional(),
  profileKey: z.enum(importProfiles).optional().default("people_roster"),
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(10).max(500).optional().default(100),
  searchQuery: z.string().trim().max(200).optional().default(""),
  sortColumn: z.string().trim().max(120).optional(),
  sortDirection: z.enum(["asc", "desc"]).optional().default("asc")
});

const runActionSchema = z.object({
  orgSlug: z.string().trim().min(1),
  runId: z.string().uuid(),
  batchSize: z.number().int().min(1).max(500).default(25)
});

const listRunSchema = z.object({
  orgSlug: z.string().trim().min(1),
  limit: z.number().int().min(1).max(100).default(20)
});
const listPlatformSchema = z.object({
  orgSlug: z.string().trim().min(1)
});
const previewSportsEngineSchema = z.object({
  orgSlug: z.string().trim().min(1),
  profileKey: z.enum(importProfiles),
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(10).max(500).optional().default(100),
  searchQuery: z.string().trim().max(200).optional().default(""),
  sortColumn: z.string().trim().max(120).optional(),
  sortDirection: z.enum(["asc", "desc"]).optional().default("asc")
});

const listConflictSchema = z.object({
  orgSlug: z.string().trim().min(1),
  runId: z.string().uuid(),
  state: z.enum(["needs_review", "pending_ai", "manual_resolved", "auto_applied", "dismissed"]).optional(),
  limit: z.number().int().min(1).max(500).default(100)
});

const manualDecisionSchema = z.object({
  orgSlug: z.string().trim().min(1),
  runId: z.string().uuid(),
  conflictId: z.string().uuid(),
  action: z.enum(["insert", "update", "skip"]),
  targetId: z.string().uuid().optional(),
  rationale: z.string().trim().max(500).optional()
});

type EdgePayload = Record<string, unknown>;

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asStringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

function toBool(value: unknown) {
  return value === true;
}

function decodeText(bytes: Uint8Array) {
  return new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
}

function buildPreviewPage(input: {
  headers: string[];
  rows: Array<Record<string, unknown>>;
  page: number;
  pageSize: number;
  searchQuery: string;
  sortColumn?: string;
  sortDirection: "asc" | "desc";
}) {
  const { headers, rows, page, pageSize, searchQuery, sortColumn, sortDirection } = input;
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const searched =
    normalizedSearch.length > 0
      ? rows.filter((row) =>
          headers.some((header) => String(row[header] ?? "").toLowerCase().includes(normalizedSearch))
        )
      : rows;

  const sorted = [...searched];
  if (sortColumn && headers.includes(sortColumn)) {
    sorted.sort((left, right) => {
      const leftValue = String(left[sortColumn] ?? "");
      const rightValue = String(right[sortColumn] ?? "");
      const compared = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: "base" });
      return sortDirection === "desc" ? -compared : compared;
    });
  } else {
    sorted.sort((left, right) => {
      const leftNumber = Number(left.__row_number ?? 0);
      const rightNumber = Number(right.__row_number ?? 0);
      return leftNumber - rightNumber;
    });
  }

  const totalRows = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * pageSize;
  const pagedRows = sorted.slice(start, start + pageSize);

  return {
    headers,
    rows: pagedRows,
    totalRows,
    page: safePage,
    pageSize,
    totalPages
  };
}

function parseCsvPreview(input: string, paging: z.infer<typeof previewFileSchema>) {
  const text = input;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? "";
    const next = text[i + 1] ?? "";

    if (ch === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") {
        i += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += ch;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const headers = (rows[0] ?? []).map((value) => value.trim()).filter(Boolean);
  if (headers.length === 0) {
    return { headers: [], rows: [], totalRows: 0, page: 1, pageSize: paging.pageSize, totalPages: 1 };
  }

  const body = rows.slice(1).filter((values) => values.some((value) => value.trim().length > 0));
  const previewRows = body.map((values, index) => {
    const rowRecord: Record<string, unknown> = {
      __row_number: index + 1
    };
    headers.forEach((header, headerIndex) => {
      rowRecord[header] = (values[headerIndex] ?? "").trim();
    });
    return rowRecord;
  });

  return buildPreviewPage({
    headers,
    rows: previewRows,
    page: paging.page,
    pageSize: paging.pageSize,
    searchQuery: paging.searchQuery,
    sortColumn: paging.sortColumn,
    sortDirection: paging.sortDirection
  });
}

async function getSessionAccessToken() {
  const supabase = await createSupabaseServer();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error("Missing auth session for import action.");
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (!sessionError && sessionData.session?.access_token) {
    return sessionData.session.access_token;
  }

  const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError || !refreshedData.session?.access_token) {
    throw new Error("Missing auth session for import action.");
  }

  return refreshedData.session.access_token;
}

async function invokeEdgeFunction(name: "file-processing" | "ai-conflict-resolver" | "database-writer", accessToken: string, payload: EdgePayload) {
  const { supabaseUrl, supabasePublishableKey } = getSupabasePublicConfig();

  const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: supabasePublishableKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  const rawText = await response.text();
  const body = (() => {
    try {
      return JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      return {};
    }
  })();

  if (!response.ok) {
    const fromJson = asString(body.error);
    const fromText = rawText.trim();
    const detail = fromJson || fromText;
    throw new Error(detail || `Edge function ${name} failed (${response.status}).`);
  }

  return body as Record<string, unknown>;
}

type PlatformCatalogRow = {
  key: string;
  label: string;
  description: string;
  logo_asset_path: string | null;
  supports_api_pull: boolean;
  supports_file_upload: boolean;
  requires_oauth: boolean;
  oauth_provider: string | null;
  api_version: string | null;
  is_active: boolean;
};

const importPlatformKeySet = new Set<string>(importPlatformKeys);

function asImportPlatformKey(value: string | null): ImportPlatformKey | null {
  if (!value) {
    return null;
  }
  return importPlatformKeySet.has(value) ? (value as ImportPlatformKey) : null;
}

function mapPlatformCatalogRow(row: PlatformCatalogRow): ImportPlatformCatalogItem {
  const platformKey = asImportPlatformKey(row.key);
  if (!platformKey) {
    throw new Error(`Unknown import platform key in catalog: ${row.key}`);
  }

  return {
    key: platformKey,
    label: row.label,
    description: row.description,
    logoAssetPath: row.logo_asset_path,
    supportsApiPull: row.supports_api_pull,
    supportsFileUpload: row.supports_file_upload,
    requiresOauth: row.requires_oauth,
    oauthProvider: row.oauth_provider,
    apiVersion: row.api_version,
    isActive: row.is_active
  };
}

function resolveRunPlatformDisplay(input: {
  key: string | null;
  platformMap: Map<string, ImportPlatformCatalogItem>;
}) {
  const fallbackPlatform = input.platformMap.get("other") ?? null;
  const parsedKey = asImportPlatformKey(input.key);

  if (!input.key) {
    return {
      sourcePlatformKey: null,
      sourcePlatformLabel: "Unknown Platform",
      sourcePlatformLogoPath: fallbackPlatform?.logoAssetPath ?? null
    };
  }

  if (!parsedKey) {
    return {
      sourcePlatformKey: null,
      sourcePlatformLabel: "Unknown Platform",
      sourcePlatformLogoPath: fallbackPlatform?.logoAssetPath ?? null
    };
  }

  const platform = input.platformMap.get(parsedKey);
  if (!platform) {
    return {
      sourcePlatformKey: parsedKey,
      sourcePlatformLabel: "Unknown Platform",
      sourcePlatformLogoPath: fallbackPlatform?.logoAssetPath ?? null
    };
  }

  return {
    sourcePlatformKey: parsedKey,
    sourcePlatformLabel: platform.label,
    sourcePlatformLogoPath: platform.logoAssetPath
  };
}

async function loadPlatformCatalogMap(supabase: Awaited<ReturnType<typeof createSupabaseServer>>) {
  const { data, error } = await supabase
    .schema("imports").from("import_platforms")
    .select("key, label, description, logo_asset_path, supports_api_pull, supports_file_upload, requires_oauth, oauth_provider, api_version, is_active");

  if (error) {
    throw new Error(`Failed to load import platform catalog: ${error.message}`);
  }

  const rows = (data ?? []) as PlatformCatalogRow[];
  return new Map(rows.map((row) => [row.key, mapPlatformCatalogRow(row)]));
}

export async function startImportRunAction(input: z.input<typeof startRunSchema>) {
  const payload = startRunSchema.parse(input);
  const org = await requireOrgPermission(payload.orgSlug, "org.manage.read");
  requireOrgToolEnabled(org.toolAvailability, "imports");
  const usingInlineRows = payload.inlineRows.length > 0;
  if (!usingInlineRows && (!payload.fileId || !payload.filePath || !payload.fileName)) {
    throw new Error("File source is required when inline rows are not provided.");
  }

  const token = await getSessionAccessToken();

  return invokeEdgeFunction("file-processing", token, {
    action: "start_run",
    org_id: org.orgId,
    org_slug: org.orgSlug,
    source_platform_key: payload.sourcePlatformKey,
    profile: payload.profileKey,
    import_session_id: payload.importSessionId ?? null,
    options: {
      important_fields: payload.importantFields,
      selected_columns: payload.importantFields,
      row_selection_mode: payload.rowSelectionMode,
      selected_row_numbers: payload.selectedRowNumbers,
      excluded_row_numbers: payload.excludedRowNumbers,
      inline_rows: payload.inlineRows
    },
    file: usingInlineRows
      ? null
      : {
          id: payload.fileId,
          bucket: payload.bucket,
          path: payload.filePath,
          name: payload.fileName,
          mime_type: payload.mimeType ?? null,
          size_bytes: payload.sizeBytes ?? null
        }
  });
}

export async function previewImportFileAction(input: z.input<typeof previewFileSchema>) {
  const payload = previewFileSchema.parse(input);
  const org = await requireOrgPermission(payload.orgSlug, "org.manage.read");
  requireOrgToolEnabled(org.toolAvailability, "imports");

  try {
    const token = await getSessionAccessToken();

    const response = await invokeEdgeFunction("file-processing", token, {
      action: "preview_file",
      org_id: org.orgId,
      profile: payload.profileKey,
      page: payload.page,
      page_size: payload.pageSize,
      search_query: payload.searchQuery,
      sort_column: payload.sortColumn ?? null,
      sort_direction: payload.sortDirection,
      file: {
        id: "preview",
        bucket: payload.bucket,
        path: payload.filePath,
        name: payload.fileName,
        mime_type: payload.mimeType ?? null
      }
    });

    const headers = Array.isArray(response.headers) ? response.headers.map((entry) => String(entry)) : [];
    const rows = Array.isArray(response.rows) ? (response.rows as Array<Record<string, unknown>>) : [];
    const totalRows = typeof response.total_rows === "number" ? response.total_rows : Number.parseInt(String(response.total_rows ?? "0"), 10) || 0;
    const page = typeof response.page === "number" ? response.page : payload.page;
    const pageSize = typeof response.page_size === "number" ? response.page_size : payload.pageSize;
    const totalPages =
      typeof response.total_pages === "number"
        ? response.total_pages
        : Math.max(1, Math.ceil(Math.max(totalRows, 0) / Math.max(pageSize, 1)));

    return {
      headers,
      rows,
      totalRows,
      page,
      pageSize,
      totalPages
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Preview failed.";
    const edgePreviewMissing = message.includes("Missing run_id for process_batch.") || message.includes("Unsupported action");
    if (!edgePreviewMissing) {
      throw error;
    }

    const supabase = await createSupabaseServer();
    const { data: blob, error: downloadError } = await supabase.storage.from(payload.bucket).download(payload.filePath);
    if (downloadError || !blob) {
      throw new Error("Preview failed and fallback download could not be completed.");
    }

    const extension = payload.fileName.toLowerCase().split(".").pop() ?? "";
    if (extension !== "csv") {
      throw new Error("Preview requires updated file-processing edge function for XLSX files. Please deploy latest functions.");
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    return parseCsvPreview(decodeText(bytes), payload);
  }
}

export async function listImportPlatformsAction(input: z.input<typeof listPlatformSchema>): Promise<{
  platforms: ImportPlatformCatalogItem[];
  sportsEngineConnected: boolean;
}> {
  const payload = listPlatformSchema.parse(input);
  const org = await requireOrgPermission(payload.orgSlug, "org.manage.read");
  requireOrgToolEnabled(org.toolAvailability, "imports");

  const supabase = await createSupabaseServer();
  const platformMap = await loadPlatformCatalogMap(supabase);
  const platforms = Array.from(platformMap.values())
    .filter((platform) => platform.isActive)
    .sort((left, right) => left.label.localeCompare(right.label));

  const { data: connection } = await supabase
    .schema("imports").from("org_platform_connections")
    .select("id, status")
    .eq("org_id", org.orgId)
    .eq("platform_key", "sportsengine")
    .maybeSingle();

  const sportsEngineConnected = Boolean(connection && connection.status === "active");
  return { platforms, sportsEngineConnected };
}

async function getSportsEngineAccessToken(input: { orgId: string; orgSlug: string }) {
  const supabase = await createSupabaseServer();
  const { data: connection, error } = await supabase
    .schema("imports").from("org_platform_connections")
    .select("id, encrypted_access_token, encrypted_refresh_token, token_expires_at, status")
    .eq("org_id", input.orgId)
    .eq("platform_key", "sportsengine")
    .maybeSingle();

  if (error || !connection || connection.status !== "active") {
    throw new Error("SportsEngine connection is not active.");
  }

  const accessEncrypted = asStringOrNull(connection.encrypted_access_token);
  if (!accessEncrypted) {
    throw new Error("SportsEngine access token is missing.");
  }

  const expiresAtRaw = asStringOrNull(connection.token_expires_at);
  const nowPlusSkew = Date.now() + 30_000;
  const tokenExpiresAt = expiresAtRaw ? Date.parse(expiresAtRaw) : Number.NaN;
  const isExpired = Number.isFinite(tokenExpiresAt) && tokenExpiresAt <= nowPlusSkew;

  if (!isExpired) {
    return decryptSportsEngineToken(accessEncrypted);
  }

  const refreshEncrypted = asStringOrNull(connection.encrypted_refresh_token);
  if (!refreshEncrypted) {
    throw new Error("SportsEngine token expired and refresh token is missing.");
  }

  const config = getSportsEngineOauthConfig(process.env.APP_ORIGIN ?? "http://localhost:3000");
  const refreshed = await refreshSportsEngineToken({
    config,
    refreshToken: decryptSportsEngineToken(refreshEncrypted)
  });

  const nextExpiresAt = refreshed.expiresIn ? new Date(Date.now() + refreshed.expiresIn * 1000).toISOString() : null;
  const { error: updateError } = await supabase
    .schema("imports").from("org_platform_connections")
    .update({
      encrypted_access_token: encryptForConnection(refreshed.accessToken),
      encrypted_refresh_token: refreshed.refreshToken ? encryptForConnection(refreshed.refreshToken) : refreshEncrypted,
      token_type: refreshed.tokenType,
      scope: refreshed.scope,
      token_expires_at: nextExpiresAt,
      status: "active",
      last_error: null
    })
    .eq("id", connection.id);

  if (updateError) {
    throw new Error(`Failed to refresh SportsEngine token: ${updateError.message}`);
  }

  return refreshed.accessToken;
}

function encryptForConnection(value: string) {
  return value ? encryptSportsEngineToken(value) : value;
}

export async function previewSportsEngineDatasetAction(input: z.input<typeof previewSportsEngineSchema>) {
  const payload = previewSportsEngineSchema.parse(input);
  const org = await requireOrgPermission(payload.orgSlug, "org.manage.read");
  requireOrgToolEnabled(org.toolAvailability, "imports");

  const config = getSportsEngineOauthConfig(process.env.APP_ORIGIN ?? "http://localhost:3000");
  const accessToken = await getSportsEngineAccessToken({ orgId: org.orgId, orgSlug: org.orgSlug });
  const normalizedRows = await fetchSportsEngineDataset({
    config,
    accessToken,
    profileKey: payload.profileKey
  });

  const headers = Array.from(
    normalizedRows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>())
  );

  const rows = normalizedRows.map((row, index) => ({
    __row_number: index + 1,
    ...Object.fromEntries(headers.map((header) => [header, row[header] ?? ""]))
  }));

  const page = buildPreviewPage({
    headers,
    rows,
    page: payload.page,
    pageSize: payload.pageSize,
    searchQuery: payload.searchQuery,
    sortColumn: payload.sortColumn,
    sortDirection: payload.sortDirection
  });

  return page;
}

export async function processImportBatchAction(input: z.input<typeof runActionSchema>) {
  const payload = runActionSchema.parse(input);
  const org = await requireOrgPermission(payload.orgSlug, "org.manage.read");
  requireOrgToolEnabled(org.toolAvailability, "imports");

  const token = await getSessionAccessToken();

  return invokeEdgeFunction("file-processing", token, {
    action: "process_batch",
    org_id: org.orgId,
    run_id: payload.runId,
    batch_size: payload.batchSize
  });
}

export async function resolveConflictBatchAction(input: z.input<typeof runActionSchema>) {
  const payload = runActionSchema.parse(input);
  const org = await requireOrgPermission(payload.orgSlug, "org.manage.read");
  requireOrgToolEnabled(org.toolAvailability, "imports");

  const token = await getSessionAccessToken();

  return invokeEdgeFunction("ai-conflict-resolver", token, {
    action: "resolve_batch",
    org_id: org.orgId,
    run_id: payload.runId,
    batch_size: payload.batchSize
  });
}

export async function applyImportBatchAction(input: z.input<typeof runActionSchema>) {
  const payload = runActionSchema.parse(input);
  const org = await requireOrgPermission(payload.orgSlug, "org.manage.read");
  requireOrgToolEnabled(org.toolAvailability, "imports");

  const token = await getSessionAccessToken();

  return invokeEdgeFunction("database-writer", token, {
    action: "apply_batch",
    org_id: org.orgId,
    run_id: payload.runId,
    batch_size: payload.batchSize
  });
}

export async function cancelImportRunAction(input: z.input<typeof runActionSchema>) {
  const payload = runActionSchema.pick({ orgSlug: true, runId: true }).parse(input);
  const org = await requireOrgPermission(payload.orgSlug, "org.manage.read");
  requireOrgToolEnabled(org.toolAvailability, "imports");

  const token = await getSessionAccessToken();

  return invokeEdgeFunction("database-writer", token, {
    action: "cancel_run",
    org_id: org.orgId,
    run_id: payload.runId
  });
}

export async function undoImportRunAction(input: z.input<typeof runActionSchema>) {
  const payload = runActionSchema.pick({ orgSlug: true, runId: true }).parse(input);
  const org = await requireOrgPermission(payload.orgSlug, "org.manage.read");
  requireOrgToolEnabled(org.toolAvailability, "imports");

  const token = await getSessionAccessToken();

  return invokeEdgeFunction("database-writer", token, {
    action: "undo_run",
    org_id: org.orgId,
    run_id: payload.runId
  });
}

export async function getImportRunStatusAction(input: z.input<typeof runActionSchema>) {
  const payload = runActionSchema.pick({ orgSlug: true, runId: true }).parse(input);
  const org = await requireOrgPermission(payload.orgSlug, "org.manage.read");
  requireOrgToolEnabled(org.toolAvailability, "imports");

  const supabase = await createSupabaseServer();
  const platformMap = await loadPlatformCatalogMap(supabase);
  const { data, error } = await supabase
    .schema("imports").from("import_runs")
    .select("id, import_session_id, source_platform_key, profile_key, status, progress, source_filename, row_count, summary_json, created_at, updated_at, completed_at, error_text")
    .eq("org_id", org.orgId)
    .eq("id", payload.runId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load import run: ${error.message}`);
  }

  if (!data) {
    throw new Error("Import run not found.");
  }

  const platformDisplay = resolveRunPlatformDisplay({
    key: asStringOrNull(data.source_platform_key),
    platformMap
  });
  return {
    id: asString(data.id),
    importSessionId: asStringOrNull(data.import_session_id),
    sourcePlatformKey: platformDisplay.sourcePlatformKey,
    sourcePlatformLabel: platformDisplay.sourcePlatformLabel,
    sourcePlatformLogoPath: platformDisplay.sourcePlatformLogoPath,
    profile: asString(data.profile_key) as ImportProfileKey,
    status: asString(data.status) as ImportRunStatus,
    progress: asNumber(data.progress),
    sourceFilename: asStringOrNull(data.source_filename),
    rowCount: Math.max(0, Math.round(asNumber(data.row_count))),
    summary: asObject(data.summary_json),
    createdAt: asString(data.created_at),
    updatedAt: asString(data.updated_at),
    completedAt: asStringOrNull(data.completed_at),
    errorText: asStringOrNull(data.error_text)
  } satisfies ImportRunListItem;
}

export async function listImportRunsAction(input: z.input<typeof listRunSchema>): Promise<{ runs: ImportRunListItem[] }> {
  const payload = listRunSchema.parse(input);
  const org = await requireOrgPermission(payload.orgSlug, "org.manage.read");
  requireOrgToolEnabled(org.toolAvailability, "imports");

  const supabase = await createSupabaseServer();
  const platformMap = await loadPlatformCatalogMap(supabase);
  const { data, error } = await supabase
    .schema("imports").from("import_runs")
    .select("id, import_session_id, source_platform_key, profile_key, status, progress, source_filename, row_count, summary_json, created_at, updated_at, completed_at, error_text")
    .eq("org_id", org.orgId)
    .order("created_at", { ascending: false })
    .limit(payload.limit);

  if (error) {
    throw new Error(`Failed to load import history: ${error.message}`);
  }

  const runs = (data ?? []).map((row) => {
    const platformDisplay = resolveRunPlatformDisplay({
      key: asStringOrNull(row.source_platform_key),
      platformMap
    });
    return ({
    id: asString(row.id),
    importSessionId: asStringOrNull(row.import_session_id),
    sourcePlatformKey: platformDisplay.sourcePlatformKey,
    sourcePlatformLabel: platformDisplay.sourcePlatformLabel,
    sourcePlatformLogoPath: platformDisplay.sourcePlatformLogoPath,
    profile: asString(row.profile_key) as ImportProfileKey,
    status: asString(row.status) as ImportRunStatus,
    progress: asNumber(row.progress),
    sourceFilename: asStringOrNull(row.source_filename),
    rowCount: Math.max(0, Math.round(asNumber(row.row_count))),
    summary: asObject(row.summary_json),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    completedAt: asStringOrNull(row.completed_at),
    errorText: asStringOrNull(row.error_text)
  } satisfies ImportRunListItem);
  });

  return { runs };
}

export async function listImportConflictsAction(input: z.input<typeof listConflictSchema>): Promise<{ conflicts: ConflictRecord[] }> {
  const payload = listConflictSchema.parse(input);
  const org = await requireOrgPermission(payload.orgSlug, "org.manage.read");
  requireOrgToolEnabled(org.toolAvailability, "imports");

  const supabase = await createSupabaseServer();
  let query = supabase
    .schema("imports").from("import_conflicts")
    .select("id, run_id, row_id, profile_key, conflict_type, imported_payload_json, candidate_records_json, ai_suggestion_json, resolution_state")
    .eq("org_id", org.orgId)
    .eq("run_id", payload.runId)
    .order("created_at", { ascending: true })
    .limit(payload.limit);

  if (payload.state) {
    query = query.eq("resolution_state", payload.state);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load import conflicts: ${error.message}`);
  }

  const conflicts = (data ?? []).map((row) => ({
    id: asString(row.id),
    runId: asString(row.run_id),
    rowId: asString(row.row_id),
    profile: asString(row.profile_key) as ImportProfileKey,
    conflictType: asString(row.conflict_type),
    importedPayload: asObject(row.imported_payload_json),
    candidateRecords: Array.isArray(row.candidate_records_json) ? (row.candidate_records_json as ConflictRecord["candidateRecords"]) : [],
    aiSuggestion: row.ai_suggestion_json ? (asObject(row.ai_suggestion_json) as ConflictRecord["aiSuggestion"]) : null,
    resolutionState: asString(row.resolution_state) as ConflictRecord["resolutionState"]
  } satisfies ConflictRecord));

  return { conflicts };
}

export async function resolveConflictManuallyAction(input: z.input<typeof manualDecisionSchema>) {
  const payload = manualDecisionSchema.parse(input);
  const org = await requireOrgPermission(payload.orgSlug, "org.manage.read");
  requireOrgToolEnabled(org.toolAvailability, "imports");

  const supabase = await createSupabaseServer();
  const decision = {
    action: payload.action,
    target_id: payload.targetId ?? null,
    rationale: payload.rationale ?? ""
  };

  const { error: conflictError } = await supabase
    .schema("imports").from("import_conflicts")
    .update({
      resolution_state: "manual_resolved",
      resolution_json: decision,
      resolved_by_user_id: org.userId,
      resolved_at: new Date().toISOString()
    })
    .eq("org_id", org.orgId)
    .eq("run_id", payload.runId)
    .eq("id", payload.conflictId);

  if (conflictError) {
    throw new Error(`Failed to resolve conflict: ${conflictError.message}`);
  }

  const { error: decisionError } = await supabase
    .schema("imports").from("import_decisions")
    .insert({
      org_id: org.orgId,
      run_id: payload.runId,
      conflict_id: payload.conflictId,
      decision_source: "manual",
      decision_action: payload.action,
      confidence: 1,
      rationale: payload.rationale ?? null,
      decision_payload_json: decision,
      created_by_user_id: org.userId
    });

  if (decisionError) {
    throw new Error(`Failed to audit conflict decision: ${decisionError.message}`);
  }

  return { ok: true };
}
