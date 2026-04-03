"use server";

import { z } from "zod";
import { requireOrgPermission } from "@/src/shared/permissions/requireOrgPermission";
import { requireOrgToolEnabled } from "@/src/shared/org/requireOrgToolEnabled";
import { createSupabaseServer } from "@/src/shared/data-api/server";
import { getSupabasePublicConfig } from "@/src/shared/supabase/config";
import { type ConflictRecord, type ImportProfileKey, type ImportRunListItem, type ImportRunStatus } from "@/src/features/imports/contracts";

const startRunSchema = z.object({
  orgSlug: z.string().trim().min(1),
  fileId: z.string().uuid(),
  filePath: z.string().trim().min(1),
  fileName: z.string().trim().min(1),
  bucket: z.string().trim().min(1).default("org-assets"),
  mimeType: z.string().trim().min(1).optional(),
  sizeBytes: z.number().int().nonnegative().optional()
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

export async function startImportRunAction(input: z.input<typeof startRunSchema>) {
  const payload = startRunSchema.parse(input);
  const org = await requireOrgPermission(payload.orgSlug, "org.manage.read");
  requireOrgToolEnabled(org.toolAvailability, "imports");

  const token = await getSessionAccessToken();

  return invokeEdgeFunction("file-processing", token, {
    action: "start_run",
    org_id: org.orgId,
    org_slug: org.orgSlug,
    profile: "people_roster",
    file: {
      id: payload.fileId,
      bucket: payload.bucket,
      path: payload.filePath,
      name: payload.fileName,
      mime_type: payload.mimeType ?? null,
      size_bytes: payload.sizeBytes ?? null
    }
  });
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
  const { data, error } = await supabase
    .schema("imports").from("import_runs")
    .select("id, profile_key, status, progress, source_filename, row_count, summary_json, created_at, updated_at, completed_at, error_text")
    .eq("org_id", org.orgId)
    .eq("id", payload.runId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load import run: ${error.message}`);
  }

  if (!data) {
    throw new Error("Import run not found.");
  }

  return {
    id: asString(data.id),
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
  const { data, error } = await supabase
    .schema("imports").from("import_runs")
    .select("id, profile_key, status, progress, source_filename, row_count, summary_json, created_at, updated_at, completed_at, error_text")
    .eq("org_id", org.orgId)
    .order("created_at", { ascending: false })
    .limit(payload.limit);

  if (error) {
    throw new Error(`Failed to load import history: ${error.message}`);
  }

  const runs = (data ?? []).map((row) => ({
    id: asString(row.id),
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
  } satisfies ImportRunListItem));

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
