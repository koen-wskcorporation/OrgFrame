"use server";

import { createHash, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { rethrowIfNavigationError } from "@/src/shared/navigation/rethrowIfNavigationError";
import { requireOrgPermission } from "@/src/shared/permissions/requireOrgPermission";
import { createSupabaseServer } from "@/src/shared/data-api/server";
import { createOptionalSupabaseServiceRoleClient } from "@/src/shared/data-api/server";
import { zonedLocalToUtc } from "@/src/features/calendar/rule-engine";
import { createDefaultFormSchema } from "@/src/features/forms/schema";
import { parseSportsConnectCsv, parseSportsConnectDateTime } from "@/src/features/sportsconnect/parser";
import type {
  SportsConnectActivationLookup,
  SportsConnectActivationSendResult,
  SportsConnectCommitResult,
  SportsConnectCommitSummary,
  SportsConnectDryRunResult,
  SportsConnectDryRunSummary,
  SportsConnectMappingMode,
  SportsConnectMappingRequirement,
  SportsConnectNormalizedRow,
  SportsConnectRunProjection,
  SportsConnectResolveMappingResult,
  SportsConnectRunHistoryItem
} from "@/src/features/sportsconnect/types";

const textSchema = z.string().trim();
const emailSchema = z.string().trim().toLowerCase().email();

const createDryRunSchema = z.object({
  orgSlug: textSchema.min(1),
  sourceFilename: z.string().trim().max(255).nullable().optional(),
  sourceTimezone: z.string().trim().max(100).optional(),
  csvContent: z.string().min(1)
});

const resolveMappingsSchema = z.object({
  orgSlug: textSchema.min(1),
  runId: z.string().uuid(),
  decisions: z.array(
    z.object({
      key: z.string().trim().min(1).max(200),
      mode: z.enum(["create", "existing"] satisfies SportsConnectMappingMode[]),
      candidateId: z.string().uuid().nullable().optional()
    })
  )
});

const commitRunSchema = z.object({
  orgSlug: textSchema.min(1),
  runId: z.string().uuid()
});

const runHistorySchema = z.object({
  orgSlug: textSchema.min(1),
  limit: z.number().int().min(1).max(100).optional().default(20)
});

const runProjectionSchema = z.object({
  orgSlug: textSchema.min(1),
  runId: z.string().uuid()
});

const activationLookupSchema = z.object({
  email: emailSchema
});

const activationSendSchema = z.object({
  email: emailSchema
});

type MappingDecision = {
  key: string;
  mode: SportsConnectMappingMode;
  candidateId: string | null;
};

type RunRowRecord = {
  id: string;
  row_number: number;
  row_hash: string;
  raw_row_json: Record<string, unknown>;
  normalized_row_json: Record<string, unknown>;
  issues_json: unknown;
  warnings_json: unknown;
};

type ExistingProgram = {
  id: string;
  name: string;
  slug: string;
};

type ExistingProgramNode = {
  id: string;
  program_id: string;
  parent_id: string | null;
  name: string;
  node_kind: "division" | "team";
};

type ExistingAuthUser = {
  id: string;
  email: string | null;
  email_confirmed_at: string | null;
  raw_user_meta_data: Record<string, unknown> | null;
};

type ResolvedProgramContext = {
  programId: string;
  programName: string;
};

type ResolvedDivisionContext = {
  divisionNodeId: string;
  divisionName: string;
};

type ResolvedTeamContext = {
  teamNodeId: string | null;
  teamName: string | null;
};

type ServiceSupabase = NonNullable<ReturnType<typeof createOptionalSupabaseServiceRoleClient>>;

const ACTIVE_REGISTRATION_STATUSES = ["submitted", "in_review", "approved", "waitlisted"] as const;
const TEAM_ACTIVE_STATUSES = ["active", "pending", "waitlisted"] as const;
const authUsersListCache = new WeakMap<object, Promise<ExistingAuthUser[]>>();

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeKey(value: string) {
  return normalizeWhitespace(value).toLowerCase();
}

function normalizeSlug(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return slug.length > 0 ? slug : "item";
}

function safeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeWhitespace(value);
  return normalized.length > 0 ? normalized : null;
}

function isValidTimezone(value: string | undefined): value is string {
  if (!value) {
    return false;
  }

  try {
    Intl.DateTimeFormat(undefined, { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function parseJsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseIssues(value: unknown): string[] {
  const issues = parseJsonArray(value);
  return issues
    .map((issue) => {
      if (!issue || typeof issue !== "object") {
        return null;
      }

      const message = safeString((issue as Record<string, unknown>).message);
      return message.length > 0 ? message : null;
    })
    .filter((message): message is string => Boolean(message));
}

function parseWarnings(value: unknown): string[] {
  const warnings = parseJsonArray(value);
  return warnings.map((entry) => safeString(entry)).filter((entry) => entry.length > 0);
}

function parseMoney(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/[^0-9.-]/g, "").trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDateOfBirthIso(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function maybeString(value: string | null | undefined): string | null {
  const normalized = normalizeWhitespace(value ?? "");
  return normalized.length > 0 ? normalized : null;
}

function pickFirst(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = maybeString(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function toMappingDecisionMap(decisions: MappingDecision[]) {
  return new Map(decisions.map((decision) => [decision.key, decision]));
}

async function getRequestOrigin() {
  const headerStore = await headers();
  const forwardedProto = headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const forwardedHost = headerStore.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || headerStore.get("host");

  if (host) {
    const protocol = forwardedProto === "https" || forwardedProto === "http" ? forwardedProto : process.env.NODE_ENV === "production" ? "https" : "http";
    return `${protocol}://${host}`;
  }

  const fallbackOrigin = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "http://localhost:3000";
  return fallbackOrigin.replace(/\/+$/, "");
}

function buildPlayerLegacyMetadata(row: SportsConnectNormalizedRow) {
  const metadata: Record<string, unknown> = {
    sportsconnect_imported: true
  };

  if (row.playerLegacyId) {
    metadata.sportsconnect_player_id = row.playerLegacyId;
  }

  if (row.playerAssociationId) {
    metadata.sportsconnect_association_player_id = row.playerAssociationId;
  }

  if (row.orderDetailPlayerId) {
    metadata.sportsconnect_order_detail_player_id = row.orderDetailPlayerId;
  }

  if (Object.keys(row.metadata).length > 0) {
    metadata.sportsconnect_metadata = row.metadata;
  }

  return metadata;
}

function buildOrderSourceId(row: SportsConnectNormalizedRow, rowHash: string) {
  return pickFirst(row.sourceOrderId, row.sourceOrderNo) ?? `row-${rowHash.slice(0, 12)}`;
}

function buildOrderItemSourceKey(row: SportsConnectNormalizedRow, rowHash: string) {
  return pickFirst(row.sourceOrderDetailId, row.sourceOrderDetailPaymentId) ?? `item-${rowHash.slice(0, 16)}`;
}

function buildPaymentSourceKey(row: SportsConnectNormalizedRow, rowHash: string) {
  return pickFirst(row.sourceOrderPaymentHistoryId, row.sourcePaymentHistoryId, row.sourceOrderDetailPaymentId) ?? `payment-${rowHash.slice(0, 16)}`;
}

function parseRowTimestampIso(row: SportsConnectNormalizedRow, timezone: string): string | null {
  const source = row.orderTimestampRaw ?? row.orderDateRaw;
  if (!source) {
    return null;
  }

  const parsed = parseSportsConnectDateTime(source);
  if (!parsed) {
    return null;
  }

  try {
    return zonedLocalToUtc(parsed.localDate, parsed.localTime, timezone).toISOString();
  } catch {
    return null;
  }
}

async function listExistingProgramsAndNodes(supabase: ServiceSupabase, orgId: string) {
  const { data: programsData, error: programsError } = await supabase
    .schema("programs").from("programs")
    .select("id, name, slug")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  if (programsError) {
    throw new Error(`Failed to load programs: ${programsError.message}`);
  }

  const programs = (programsData ?? []) as ExistingProgram[];
  const programIds = programs.map((program) => program.id);

  const nodes: ExistingProgramNode[] = [];
  if (programIds.length > 0) {
    const { data: nodesData, error: nodesError } = await supabase
      .schema("programs").from("program_structure_nodes")
      .select("id, program_id, parent_id, name, node_kind")
      .in("program_id", programIds)
      .order("created_at", { ascending: true });

    if (nodesError) {
      throw new Error(`Failed to load program nodes: ${nodesError.message}`);
    }

    nodes.push(...((nodesData ?? []) as ExistingProgramNode[]));
  }

  return {
    programs,
    nodes
  };
}

function buildMappingRequirements(input: {
  rows: Array<{ normalized: SportsConnectNormalizedRow }>;
  programs: ExistingProgram[];
  nodes: ExistingProgramNode[];
  existingDecisions: MappingDecision[];
}): SportsConnectMappingRequirement[] {
  const decisionByKey = toMappingDecisionMap(input.existingDecisions);
  const requirements: SportsConnectMappingRequirement[] = [];

  const programCandidatesByKey = new Map<string, ExistingProgram[]>();
  const programIdsByProgramKey = new Map<string, string[]>();

  const uniqueProgramKeys = Array.from(new Set(input.rows.map((row) => row.normalized.programKey))).filter((key) => key.length > 0);
  uniqueProgramKeys.forEach((programKey) => {
    const sourceLabel = input.rows.find((row) => row.normalized.programKey === programKey)?.normalized.programName ?? "Program";
    const candidates = input.programs.filter((program) => normalizeKey(program.name) === programKey);

    programCandidatesByKey.set(programKey, candidates);
    programIdsByProgramKey.set(programKey, candidates.map((candidate) => candidate.id));

    const decision = decisionByKey.get(`program:${programKey}`);
    const selectedMode = decision?.mode ?? (candidates.length > 0 ? null : "create");
    const selectedCandidateId = decision?.candidateId ?? null;

    requirements.push({
      key: `program:${programKey}`,
      kind: "program",
      label: sourceLabel,
      sourceProgramKey: programKey,
      sourceDivisionKey: null,
      required: candidates.length > 0,
      selectedMode,
      selectedCandidateId,
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        label: candidate.name,
        parentLabel: null
      }))
    });
  });

  const divisionSourceKeys = Array.from(new Set(input.rows.map((row) => row.normalized.divisionKey))).filter((key) => key.length > 0);
  divisionSourceKeys.forEach((divisionKey) => {
    const sourceRow = input.rows.find((row) => row.normalized.divisionKey === divisionKey)?.normalized;
    if (!sourceRow) {
      return;
    }

    const candidateProgramIds =
      (() => {
        const programDecision = decisionByKey.get(`program:${sourceRow.programKey}`);
        if (programDecision?.mode === "existing" && programDecision.candidateId) {
          return [programDecision.candidateId];
        }

        return programIdsByProgramKey.get(sourceRow.programKey) ?? [];
      })();

    const candidates = input.nodes
      .filter((node) => node.node_kind === "division" && candidateProgramIds.includes(node.program_id) && normalizeKey(node.name) === normalizeKey(sourceRow.divisionName))
      .map((node) => {
        const parentProgram = input.programs.find((program) => program.id === node.program_id);
        return {
          id: node.id,
          label: node.name,
          parentLabel: parentProgram?.name ?? null
        };
      });

    const decision = decisionByKey.get(`division:${divisionKey}`);
    const selectedMode = decision?.mode ?? (candidates.length > 0 ? null : "create");
    const selectedCandidateId = decision?.candidateId ?? null;

    requirements.push({
      key: `division:${divisionKey}`,
      kind: "division",
      label: sourceRow.divisionName,
      sourceProgramKey: sourceRow.programKey,
      sourceDivisionKey: divisionKey,
      required: candidates.length > 0,
      selectedMode,
      selectedCandidateId,
      candidates
    });
  });

  const teamRows = input.rows.filter((row) => row.normalized.teamKey && !row.normalized.isUnallocatedTeam);
  const uniqueTeamKeys = Array.from(new Set(teamRows.map((row) => row.normalized.teamKey).filter((key): key is string => Boolean(key))));

  uniqueTeamKeys.forEach((teamKey) => {
    const sourceRow = teamRows.find((row) => row.normalized.teamKey === teamKey)?.normalized;
    if (!sourceRow || !sourceRow.teamName) {
      return;
    }

    const divisionDecision = decisionByKey.get(`division:${sourceRow.divisionKey}`);
    const candidateDivisionIds =
      (() => {
        if (divisionDecision?.mode === "existing" && divisionDecision.candidateId) {
          return [divisionDecision.candidateId];
        }

        const programIds = programIdsByProgramKey.get(sourceRow.programKey) ?? [];
        return input.nodes
          .filter((node) => node.node_kind === "division" && programIds.includes(node.program_id) && normalizeKey(node.name) === normalizeKey(sourceRow.divisionName))
          .map((node) => node.id);
      })();

    const candidates = input.nodes
      .filter((node) => node.node_kind === "team" && candidateDivisionIds.includes(node.parent_id ?? "") && normalizeKey(node.name) === normalizeKey(sourceRow.teamName ?? ""))
      .map((node) => {
        const parentDivision = input.nodes.find((candidate) => candidate.id === node.parent_id);
        return {
          id: node.id,
          label: node.name,
          parentLabel: parentDivision?.name ?? null
        };
      });

    const decision = decisionByKey.get(`team:${teamKey}`);
    const selectedMode = decision?.mode ?? (candidates.length > 0 ? null : "create");
    const selectedCandidateId = decision?.candidateId ?? null;

    requirements.push({
      key: `team:${teamKey}`,
      kind: "team",
      label: sourceRow.teamName,
      sourceProgramKey: sourceRow.programKey,
      sourceDivisionKey: sourceRow.divisionKey,
      required: candidates.length > 0,
      selectedMode,
      selectedCandidateId,
      candidates
    });
  });

  return requirements;
}

function summarizeDryRun(input: {
  rows: Array<{ normalized: SportsConnectNormalizedRow; issues: string[] }>;
  requirements: SportsConnectMappingRequirement[];
}): SportsConnectDryRunSummary {
  const totalRows = input.rows.length;
  const rowsWithIssues = input.rows.filter((row) => row.issues.length > 0).length;
  const validRows = totalRows - rowsWithIssues;

  const requiredMappings = input.requirements.filter((requirement) => requirement.required).length;
  const unresolvedMappings = input.requirements.filter((requirement) => requirement.required && requirement.selectedMode === null).length;

  const uniquePrograms = new Set(input.rows.map((row) => row.normalized.programKey).filter(Boolean)).size;
  const uniqueDivisions = new Set(input.rows.map((row) => row.normalized.divisionKey).filter(Boolean)).size;
  const uniqueTeams = new Set(input.rows.map((row) => row.normalized.teamKey).filter(Boolean)).size;

  return {
    totalRows,
    validRows,
    rowsWithIssues,
    requiredMappings,
    unresolvedMappings,
    uniquePrograms,
    uniqueDivisions,
    uniqueTeams
  };
}

async function insertRunRows(input: {
  supabase: ServiceSupabase;
  runId: string;
  orgId: string;
  rows: Array<{
    rowNumber: number;
    rowHash: string;
    raw: Record<string, unknown>;
    normalized: Record<string, unknown>;
    issues: unknown[];
    warnings: string[];
  }>;
}) {
  const pageSize = 400;
  for (let i = 0; i < input.rows.length; i += pageSize) {
    const slice = input.rows.slice(i, i + pageSize);
    const payload = slice.map((row) => ({
      run_id: input.runId,
      org_id: input.orgId,
      row_number: row.rowNumber,
      row_hash: row.rowHash,
      raw_row_json: row.raw,
      normalized_row_json: row.normalized,
      issues_json: row.issues,
      warnings_json: row.warnings
    }));

    const { error } = await input.supabase.schema("imports").from("sportsconnect_import_rows").insert(payload);
    if (error) {
      throw new Error(`Failed to persist import rows: ${error.message}`);
    }
  }
}

function buildRowIssueMessages(runRows: RunRowRecord[]) {
  return runRows
    .map((row) => {
      const messages = parseIssues(row.issues_json);
      if (messages.length === 0) {
        return null;
      }

      return {
        rowNumber: row.row_number,
        messages
      };
    })
    .filter((entry): entry is { rowNumber: number; messages: string[] } => Boolean(entry));
}

async function loadRunWithRows(input: {
  supabase: ServiceSupabase;
  runId: string;
  orgId: string;
}) {
  const { data: runData, error: runError } = await input.supabase
    .schema("imports").from("sportsconnect_import_runs")
    .select("id, org_id, status, summary_json, mapping_json, source_filename, source_timezone")
    .eq("id", input.runId)
    .eq("org_id", input.orgId)
    .maybeSingle();

  if (runError) {
    throw new Error(`Failed to load import run: ${runError.message}`);
  }

  if (!runData) {
    throw new Error("Import run not found.");
  }

  const { data: rowsData, error: rowsError } = await input.supabase
    .schema("imports").from("sportsconnect_import_rows")
    .select("id, row_number, row_hash, raw_row_json, normalized_row_json, issues_json, warnings_json")
    .eq("run_id", input.runId)
    .eq("org_id", input.orgId)
    .order("row_number", { ascending: true });

  if (rowsError) {
    throw new Error(`Failed to load import rows: ${rowsError.message}`);
  }

  return {
    run: runData,
    rows: (rowsData ?? []) as RunRowRecord[]
  };
}

function mapNormalizedRow(value: Record<string, unknown>): SportsConnectNormalizedRow {
  const normalized = value as unknown as SportsConnectNormalizedRow;
  return {
    ...normalized,
    metadata: safeObject(normalized.metadata) as Record<string, string | null>
  };
}

async function findAuthUserByEmail(supabase: ServiceSupabase, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await supabase
    .schema("auth")
    .from("users")
    .select("id, email, email_confirmed_at, raw_user_meta_data")
    .eq("email", normalizedEmail)
    .limit(1)
    .maybeSingle();

  if (!error) {
    return (data ?? null) as ExistingAuthUser | null;
  }

  // Some deployments do not expose auth schema through PostgREST.
  if (!error.message.toLowerCase().includes("invalid schema")) {
    throw new Error(`Failed to load auth user: ${error.message}`);
  }

  const allUsers = await listAllAuthUsers(supabase);
  return allUsers.find((user) => safeString(user.email).toLowerCase() === normalizedEmail) ?? null;
}

async function listAllAuthUsers(supabase: ServiceSupabase): Promise<ExistingAuthUser[]> {
  const cacheKey = supabase as unknown as object;
  const cached = authUsersListCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const pending = (async () => {
    const users: ExistingAuthUser[] = [];
    const perPage = 1000;
    let page = 1;

    while (true) {
      const { data, error } = await supabase.auth.admin.listUsers({
        page,
        perPage
      });

      if (error) {
        throw new Error(`Failed to list auth users: ${error.message}`);
      }

      const pageUsers = data?.users ?? [];
      pageUsers.forEach((user) => {
        users.push({
          id: user.id,
          email: user.email ?? null,
          email_confirmed_at: user.email_confirmed_at ?? null,
          raw_user_meta_data: safeObject(user.user_metadata)
        });
      });

      if (pageUsers.length < perPage) {
        break;
      }

      page += 1;
      if (page > 10_000) {
        break;
      }
    }

    return users;
  })();

  authUsersListCache.set(cacheKey, pending);
  return pending;
}

async function createImportedAuthUser(supabase: ServiceSupabase, email: string) {
  const randomPassword = `${randomUUID()}${randomUUID()}`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: randomPassword,
    email_confirm: false,
    user_metadata: {
      sportsconnect_imported: true,
      sportsconnect_activation_required: true,
      sportsconnect_imported_at: new Date().toISOString()
    }
  });

  if (!error && data.user) {
    return data.user.id;
  }

  const existing = await findAuthUserByEmail(supabase, email);
  if (existing) {
    return existing.id;
  }

  throw new Error(error?.message ?? "Unable to create imported user account.");
}

async function upsertOrgMembership(supabase: ServiceSupabase, orgId: string, userId: string) {
  const { error } = await supabase.schema("orgs").from("org_memberships").upsert(
    {
      org_id: orgId,
      user_id: userId,
      role: "member"
    },
    {
      onConflict: "org_id,user_id",
      ignoreDuplicates: true
    }
  );

  if (error) {
    throw new Error(`Failed to upsert org membership: ${error.message}`);
  }
}

function isBlankValue(value: unknown) {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === "string") {
    return value.trim().length === 0;
  }

  return false;
}

async function fillUserProfileBlanks(input: {
  supabase: ServiceSupabase;
  userId: string;
  firstName: string | null;
  lastName: string | null;
  phonePrimary: string | null;
  phoneSecondary: string | null;
  phoneOther: string | null;
  street1: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}) {
  const { data: existing, error: existingError } = await input.supabase
    .schema("people").from("user_profiles")
    .select("user_id, first_name, last_name, phone_primary, phone_secondary, phone_other, street_1, street_2, city, state, postal_code")
    .eq("user_id", input.userId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to load user profile: ${existingError.message}`);
  }

  if (!existing) {
    const { error: insertError } = await input.supabase.schema("people").from("user_profiles").insert({
      user_id: input.userId,
      first_name: input.firstName,
      last_name: input.lastName,
      phone_primary: input.phonePrimary,
      phone_secondary: input.phoneSecondary,
      phone_other: input.phoneOther,
      street_1: input.street1,
      street_2: input.street2,
      city: input.city,
      state: input.state,
      postal_code: input.postalCode
    });

    if (insertError) {
      throw new Error(`Failed to create user profile: ${insertError.message}`);
    }

    return;
  }

  const updates: Record<string, unknown> = {};

  const candidates: Array<{ key: string; nextValue: string | null }> = [
    { key: "first_name", nextValue: input.firstName },
    { key: "last_name", nextValue: input.lastName },
    { key: "phone_primary", nextValue: input.phonePrimary },
    { key: "phone_secondary", nextValue: input.phoneSecondary },
    { key: "phone_other", nextValue: input.phoneOther },
    { key: "street_1", nextValue: input.street1 },
    { key: "street_2", nextValue: input.street2 },
    { key: "city", nextValue: input.city },
    { key: "state", nextValue: input.state },
    { key: "postal_code", nextValue: input.postalCode }
  ];

  candidates.forEach((candidate) => {
    const currentValue = (existing as Record<string, unknown>)[candidate.key];
    if (isBlankValue(currentValue) && candidate.nextValue) {
      updates[candidate.key] = candidate.nextValue;
    }
  });

  if (Object.keys(updates).length === 0) {
    return;
  }

  const { error: updateError } = await input.supabase.schema("people").from("user_profiles").update(updates).eq("user_id", input.userId);
  if (updateError) {
    throw new Error(`Failed to update user profile: ${updateError.message}`);
  }
}

async function getNextSortIndex(input: {
  supabase: ServiceSupabase;
  programId: string;
  parentId: string | null;
}) {
  const query = input.supabase
    .schema("programs").from("program_structure_nodes")
    .select("sort_index")
    .eq("program_id", input.programId)
    .order("sort_index", { ascending: false })
    .limit(1);

  const { data, error } = input.parentId === null ? await query.is("parent_id", null).maybeSingle() : await query.eq("parent_id", input.parentId).maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve node sort index: ${error.message}`);
  }

  if (!data || typeof data.sort_index !== "number") {
    return 0;
  }

  return data.sort_index + 1;
}

function buildStableSlug(seed: string, key: string) {
  const base = normalizeSlug(seed).slice(0, 48);
  const hash = createHash("sha1").update(key).digest("hex").slice(0, 8);
  return `${base}-${hash}`;
}

async function ensureProgram(input: {
  supabase: ServiceSupabase;
  orgId: string;
  programKey: string;
  programName: string;
  requirementByKey: Map<string, SportsConnectMappingRequirement>;
  summary: SportsConnectCommitSummary;
  cache: Map<string, string>;
}) {
  const cacheHit = input.cache.get(input.programKey);
  if (cacheHit) {
    return {
      programId: cacheHit,
      programName: input.programName
    } satisfies ResolvedProgramContext;
  }

  const requirement = input.requirementByKey.get(`program:${input.programKey}`);
  if (requirement?.selectedMode === "existing" && requirement.selectedCandidateId) {
    input.cache.set(input.programKey, requirement.selectedCandidateId);
    return {
      programId: requirement.selectedCandidateId,
      programName: input.programName
    };
  }

  const slug = buildStableSlug(input.programName, input.programKey);
  const { data, error } = await input.supabase
    .schema("programs").from("programs")
    .insert({
      org_id: input.orgId,
      slug,
      name: input.programName,
      description: "Imported from SportsConnect",
      program_type: "custom",
      custom_type_label: "SportsConnect",
      status: "draft",
      settings_json: {
        imported: true,
        source: "sportsconnect"
      }
    })
    .select("id")
    .single();

  if (error) {
    const { data: existing, error: existingError } = await input.supabase
      .schema("programs").from("programs")
      .select("id")
      .eq("org_id", input.orgId)
      .eq("slug", slug)
      .maybeSingle();

    if (existingError || !existing?.id) {
      throw new Error(`Failed to create program '${input.programName}': ${error.message}`);
    }

    input.cache.set(input.programKey, existing.id);
    return {
      programId: existing.id,
      programName: input.programName
    };
  }

  input.summary.createdPrograms += 1;
  input.cache.set(input.programKey, data.id);

  return {
    programId: data.id,
    programName: input.programName
  };
}

async function ensureDivision(input: {
  supabase: ServiceSupabase;
  programId: string;
  divisionKey: string;
  divisionName: string;
  requirementByKey: Map<string, SportsConnectMappingRequirement>;
  summary: SportsConnectCommitSummary;
  cache: Map<string, string>;
}) {
  const cacheHit = input.cache.get(input.divisionKey);
  if (cacheHit) {
    return {
      divisionNodeId: cacheHit,
      divisionName: input.divisionName
    } satisfies ResolvedDivisionContext;
  }

  const requirement = input.requirementByKey.get(`division:${input.divisionKey}`);
  if (requirement?.selectedMode === "existing" && requirement.selectedCandidateId) {
    input.cache.set(input.divisionKey, requirement.selectedCandidateId);
    return {
      divisionNodeId: requirement.selectedCandidateId,
      divisionName: input.divisionName
    };
  }

  const sortIndex = await getNextSortIndex({
    supabase: input.supabase,
    programId: input.programId,
    parentId: null
  });

  const slug = buildStableSlug(input.divisionName, input.divisionKey);
  const { data, error } = await input.supabase
    .schema("programs").from("program_structure_nodes")
    .insert({
      program_id: input.programId,
      parent_id: null,
      name: input.divisionName,
      slug,
      node_kind: "division",
      waitlist_enabled: true,
      sort_index: sortIndex,
      settings_json: {
        imported: true,
        source: "sportsconnect"
      }
    })
    .select("id")
    .single();

  if (error) {
    const { data: existing, error: existingError } = await input.supabase
      .schema("programs").from("program_structure_nodes")
      .select("id")
      .eq("program_id", input.programId)
      .eq("node_kind", "division")
      .eq("slug", slug)
      .maybeSingle();

    if (existingError || !existing?.id) {
      throw new Error(`Failed to create division '${input.divisionName}': ${error.message}`);
    }

    input.cache.set(input.divisionKey, existing.id);
    return {
      divisionNodeId: existing.id,
      divisionName: input.divisionName
    };
  }

  input.summary.createdDivisions += 1;
  input.cache.set(input.divisionKey, data.id);

  return {
    divisionNodeId: data.id,
    divisionName: input.divisionName
  };
}

async function ensureTeam(input: {
  supabase: ServiceSupabase;
  programId: string;
  divisionNodeId: string;
  teamKey: string | null;
  teamName: string | null;
  isUnallocatedTeam: boolean;
  requirementByKey: Map<string, SportsConnectMappingRequirement>;
  summary: SportsConnectCommitSummary;
  cache: Map<string, string>;
}) {
  if (!input.teamKey || input.isUnallocatedTeam || !input.teamName) {
    return {
      teamNodeId: null,
      teamName: null
    } satisfies ResolvedTeamContext;
  }

  const cacheHit = input.cache.get(input.teamKey);
  if (cacheHit) {
    return {
      teamNodeId: cacheHit,
      teamName: input.teamName
    } satisfies ResolvedTeamContext;
  }

  const requirement = input.requirementByKey.get(`team:${input.teamKey}`);
  if (requirement?.selectedMode === "existing" && requirement.selectedCandidateId) {
    input.cache.set(input.teamKey, requirement.selectedCandidateId);
    return {
      teamNodeId: requirement.selectedCandidateId,
      teamName: input.teamName
    };
  }

  const sortIndex = await getNextSortIndex({
    supabase: input.supabase,
    programId: input.programId,
    parentId: input.divisionNodeId
  });

  const slug = buildStableSlug(input.teamName, input.teamKey);
  const { data, error } = await input.supabase
    .schema("programs").from("program_structure_nodes")
    .insert({
      program_id: input.programId,
      parent_id: input.divisionNodeId,
      name: input.teamName,
      slug,
      node_kind: "team",
      waitlist_enabled: true,
      sort_index: sortIndex,
      settings_json: {
        imported: true,
        source: "sportsconnect"
      }
    })
    .select("id")
    .single();

  if (error) {
    const { data: existing, error: existingError } = await input.supabase
      .schema("programs").from("program_structure_nodes")
      .select("id")
      .eq("program_id", input.programId)
      .eq("node_kind", "team")
      .eq("parent_id", input.divisionNodeId)
      .eq("slug", slug)
      .maybeSingle();

    if (existingError || !existing?.id) {
      throw new Error(`Failed to create team '${input.teamName}': ${error.message}`);
    }

    input.cache.set(input.teamKey, existing.id);
    return {
      teamNodeId: existing.id,
      teamName: input.teamName
    };
  }

  input.summary.createdTeams += 1;
  input.cache.set(input.teamKey, data.id);

  return {
    teamNodeId: data.id,
    teamName: input.teamName
  };
}

async function findPlayerByLegacyId(input: {
  supabase: ServiceSupabase;
  legacyId: string;
}) {
  const lookups: Array<Record<string, unknown>> = [
    { sportsconnect_player_id: input.legacyId },
    { sportsconnect_association_player_id: input.legacyId },
    { sportsconnect_order_detail_player_id: input.legacyId }
  ];

  for (const contains of lookups) {
    const { data, error } = await input.supabase
      .schema("people").from("players")
      .select("id, owner_user_id, first_name, last_name, date_of_birth, metadata_json")
      .contains("metadata_json", contains)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to resolve player legacy ID: ${error.message}`);
    }

    if (data?.id) {
      return data;
    }
  }

  return null;
}

async function findPlayerByExactFallback(input: {
  supabase: ServiceSupabase;
  orgId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
}) {
  let query = input.supabase
    .schema("people").from("players")
    .select("id, owner_user_id, first_name, last_name, date_of_birth, metadata_json, program_registrations!inner(org_id)")
    .eq("program_registrations.org_id", input.orgId)
    .eq("first_name", input.firstName)
    .eq("last_name", input.lastName)
    .limit(1);

  if (input.dateOfBirth) {
    query = query.eq("date_of_birth", input.dateOfBirth);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve player by fallback match: ${error.message}`);
  }

  return data ?? null;
}

async function ensurePlayer(input: {
  supabase: ServiceSupabase;
  orgId: string;
  row: SportsConnectNormalizedRow;
  guardianUserId: string;
  summary: SportsConnectCommitSummary;
  warnings: string[];
  firstGuardianByPlayerId: Set<string>;
}) {
  const legacyId = pickFirst(input.row.playerLegacyId, input.row.playerAssociationId, input.row.orderDetailPlayerId);

  const fallbackDob = normalizeDateOfBirthIso(input.row.playerBirthDateIso);
  const fallbackMatch = await findPlayerByExactFallback({
    supabase: input.supabase,
    orgId: input.orgId,
    firstName: input.row.playerFirstName,
    lastName: input.row.playerLastName,
    dateOfBirth: fallbackDob
  });

  const legacyMatch = legacyId
    ? await findPlayerByLegacyId({
        supabase: input.supabase,
        legacyId
      })
    : null;

  let playerId: string;

  if (legacyMatch) {
    playerId = legacyMatch.id;

    if (fallbackMatch && fallbackMatch.id !== legacyMatch.id) {
      input.warnings.push("Legacy player ID matched a different player than exact-name fallback. Legacy ID match was used.");
    }
  } else if (fallbackMatch) {
    playerId = fallbackMatch.id;
  } else {
    const metadataJson = buildPlayerLegacyMetadata(input.row);
    const { data: inserted, error: insertError } = await input.supabase
      .schema("people").from("players")
      .insert({
        owner_user_id: input.guardianUserId,
        first_name: input.row.playerFirstName,
        last_name: input.row.playerLastName,
        preferred_name: null,
        date_of_birth: fallbackDob,
        gender: input.row.playerGender,
        jersey_size: input.row.jerseySize,
        medical_notes: null,
        allergies: input.row.allergies,
        physical_conditions: input.row.physicalConditions,
        insurance_company: input.row.insuranceCompany,
        insurance_policy_holder: input.row.insurancePolicyHolder,
        metadata_json: metadataJson
      })
      .select("id")
      .single();

    if (insertError || !inserted?.id) {
      throw new Error(`Failed to create player: ${insertError?.message ?? "unknown"}`);
    }

    playerId = inserted.id;
    input.summary.createdPlayers += 1;
  }

  if (!input.firstGuardianByPlayerId.has(playerId)) {
    const { error: ownerError } = await input.supabase
      .schema("people").from("players")
      .update({
        owner_user_id: input.guardianUserId
      })
      .eq("id", playerId);

    if (ownerError) {
      throw new Error(`Failed to assign player owner: ${ownerError.message}`);
    }

    input.firstGuardianByPlayerId.add(playerId);
  }

  const { error: guardianError } = await input.supabase.schema("people").from("player_guardians").upsert(
    {
      player_id: playerId,
      guardian_user_id: input.guardianUserId,
      relationship: "guardian",
      can_manage: true
    },
    {
      onConflict: "player_id,guardian_user_id"
    }
  );

  if (guardianError) {
    throw new Error(`Failed to link player guardian: ${guardianError.message}`);
  }

  input.summary.linkedGuardians += 1;
  return playerId;
}

async function ensureImportForm(input: {
  supabase: ServiceSupabase;
  orgId: string;
  programId: string;
  programName: string;
  actorUserId: string;
  cache: Map<string, { formId: string; versionId: string }>;
}) {
  const cacheHit = input.cache.get(input.programId);
  if (cacheHit) {
    return cacheHit;
  }

  const { data: existingForm, error: existingFormError } = await input.supabase
    .schema("forms").from("org_forms")
    .select("id")
    .eq("org_id", input.orgId)
    .eq("program_id", input.programId)
    .eq("form_kind", "program_registration")
    .contains("settings_json", { system_import_source: "sportsconnect" })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingFormError) {
    throw new Error(`Failed to load import form: ${existingFormError.message}`);
  }

  const formId =
    existingForm?.id ??
    (
      await (async () => {
        const slug = `sportsconnect-import-${input.programId.slice(0, 8)}`;
        const schema = createDefaultFormSchema(`SportsConnect Import (${input.programName})`, "program_registration");
        const { data: createdForm, error: createdFormError } = await input.supabase
          .schema("forms").from("org_forms")
          .insert({
            org_id: input.orgId,
            slug,
            name: `SportsConnect Import (${input.programName})`,
            description: "System archived form created for SportsConnect import lineage.",
            form_kind: "program_registration",
            status: "archived",
            program_id: input.programId,
            target_mode: "choice",
            locked_program_node_id: null,
            schema_json: schema,
            ui_json: {},
            settings_json: {
              system: true,
              system_import_source: "sportsconnect",
              archived: true
            },
            created_by: input.actorUserId
          })
          .select("id")
          .single();

        if (createdFormError || !createdForm?.id) {
          const { data: fallbackForm, error: fallbackError } = await input.supabase
            .schema("forms").from("org_forms")
            .select("id")
            .eq("org_id", input.orgId)
            .eq("slug", slug)
            .maybeSingle();

          if (fallbackError || !fallbackForm?.id) {
            throw new Error(`Failed to create import form: ${createdFormError?.message ?? "unknown"}`);
          }

          return fallbackForm.id;
        }

        return createdForm.id;
      })()
    );

  const { data: latestVersion, error: latestVersionError } = await input.supabase
    .schema("forms").from("org_form_versions")
    .select("id, version_number")
    .eq("form_id", formId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestVersionError) {
    throw new Error(`Failed to load import form version: ${latestVersionError.message}`);
  }

  let versionId = latestVersion?.id ?? null;
  if (!versionId) {
    const schema = createDefaultFormSchema(`SportsConnect Import (${input.programName})`, "program_registration");
    const { data: createdVersion, error: createdVersionError } = await input.supabase
      .schema("forms").from("org_form_versions")
      .insert({
        org_id: input.orgId,
        form_id: formId,
        version_number: 1,
        snapshot_json: schema,
        created_by: input.actorUserId
      })
      .select("id")
      .single();

    if (createdVersionError || !createdVersion?.id) {
      throw new Error(`Failed to create import form version: ${createdVersionError?.message ?? "unknown"}`);
    }

    versionId = createdVersion.id;
  }

  const result = {
    formId,
    versionId
  };

  input.cache.set(input.programId, result);
  return result;
}

async function ensureOrder(input: {
  supabase: ServiceSupabase;
  orgId: string;
  row: SportsConnectNormalizedRow;
  rowHash: string;
  createdAtIso: string | null;
  playerId: string;
  programId: string;
  divisionNodeId: string;
  teamNodeId: string | null;
  summary: SportsConnectCommitSummary;
}) {
  const sourceOrderId = buildOrderSourceId(input.row, input.rowHash);
  const sourceLineKey = buildOrderItemSourceKey(input.row, input.rowHash);
  const sourcePaymentKey = buildPaymentSourceKey(input.row, input.rowHash);

  const { data: existingOrder, error: existingOrderError } = await input.supabase
    .schema("commerce").from("orders")
    .select("id")
    .eq("org_id", input.orgId)
    .eq("source_system", "sportsconnect")
    .eq("source_order_id", sourceOrderId)
    .maybeSingle();

  if (existingOrderError) {
    throw new Error(`Failed to check existing order: ${existingOrderError.message}`);
  }

  const orderWasExisting = Boolean(existingOrder?.id);

  const orderPayload = {
    org_id: input.orgId,
    source_system: "sportsconnect",
    source_order_id: sourceOrderId,
    source_order_no: input.row.sourceOrderNo,
    source_payment_status: input.row.sourcePaymentStatus,
    order_status: input.row.orderStatus,
    order_date: input.createdAtIso,
    order_time_stamp: input.createdAtIso,
    billing_first_name: input.row.billingFirstName,
    billing_last_name: input.row.billingLastName,
    billing_address: input.row.billingAddress,
    total_amount: parseMoney(input.row.orderAmount),
    total_paid_amount: parseMoney(input.row.totalPaymentAmount),
    balance_amount: parseMoney(input.row.orderItemBalance),
    metadata_json: {
      sourceOrderId,
      sourceOrderNo: input.row.sourceOrderNo,
      sourcePaymentStatus: input.row.sourcePaymentStatus,
      orderDetailProgramName: input.row.orderDetailProgramName,
      orderDetailDivisionName: input.row.orderDetailDivisionName
    }
  };

  const { data: orderData, error: orderError } = await input.supabase
    .schema("commerce").from("orders")
    .upsert(orderPayload, {
      onConflict: "org_id,source_system,source_order_id"
    })
    .select("id, items_json")
    .single();

  if (orderError || !orderData?.id) {
    throw new Error(`Failed to upsert order ledger row: ${orderError?.message ?? "unknown"}`);
  }

  const orderId = orderData.id;

  const existingItems = Array.isArray(orderData.items_json) ? [...orderData.items_json] : [];
  const existingIndex = existingItems.findIndex((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    return (value as { source_line_key?: unknown }).source_line_key === sourceLineKey;
  });

  const itemPayload = {
    id: sourceLineKey,
    source_line_key: sourceLineKey,
    description: input.row.orderDetailDescription,
    source_program_name: input.row.orderDetailProgramName ?? input.row.programName,
    source_division_name: input.row.orderDetailDivisionName ?? input.row.divisionName,
    source_team_name: input.row.teamName,
    player_id: input.playerId,
    program_id: input.programId,
    division_node_id: input.divisionNodeId,
    team_node_id: input.teamNodeId,
    amount: parseMoney(input.row.orderItemAmount),
    amount_paid: parseMoney(input.row.orderItemAmountPaid),
    balance_amount: parseMoney(input.row.orderItemBalance),
    metadata_json: {
      sourceOrderDetailId: input.row.sourceOrderDetailId,
      sourceOrderDetailPaymentId: input.row.sourceOrderDetailPaymentId,
      sourcePaymentHistoryId: input.row.sourcePaymentHistoryId
    }
  };

  if (existingIndex >= 0) {
    existingItems[existingIndex] = itemPayload;
  } else {
    existingItems.push(itemPayload);
  }

  const { error: itemError } = await input.supabase
    .schema("commerce").from("orders")
    .update({ items_json: existingItems })
    .eq("org_id", input.orgId)
    .eq("id", orderId);

  if (itemError) {
    throw new Error(`Failed to update order items payload: ${itemError.message}`);
  }

  const hasPaymentSignal =
    Boolean(input.row.sourcePaymentStatus) ||
    Boolean(input.row.orderPaymentAmount) ||
    Boolean(input.row.totalPaymentAmount) ||
    Boolean(input.row.sourceOrderPaymentHistoryId) ||
    Boolean(input.row.sourcePaymentHistoryId) ||
    Boolean(input.row.sourceOrderDetailPaymentId);

  let paymentCreated = false;
  if (hasPaymentSignal) {
    const { data: existingPayment, error: existingPaymentError } = await input.supabase
      .schema("commerce").from("payments")
      .select("id")
      .eq("order_id", orderId)
      .eq("source_payment_key", sourcePaymentKey)
      .maybeSingle();

    if (existingPaymentError) {
      throw new Error(`Failed to check existing order payment: ${existingPaymentError.message}`);
    }

    const paymentPayload = {
      org_id: input.orgId,
      order_id: orderId,
      source_payment_key: sourcePaymentKey,
      payment_status: input.row.sourcePaymentStatus,
      payment_date: input.createdAtIso,
      payment_amount: parseMoney(input.row.orderPaymentAmount) ?? parseMoney(input.row.totalPaymentAmount),
      paid_registration_fee: parseMoney(input.row.userPaidRegistrationFee),
      paid_cc_fee: parseMoney(input.row.userPaidCcFee),
      metadata_json: {
        sourceOrderPaymentHistoryId: input.row.sourceOrderPaymentHistoryId,
        sourcePaymentHistoryId: input.row.sourcePaymentHistoryId,
        sourceOrderDetailPaymentId: input.row.sourceOrderDetailPaymentId
      }
    };

    const { error: paymentError } = await input.supabase.schema("commerce").from("payments").upsert(paymentPayload, {
      onConflict: "order_id,source_payment_key"
    });

    if (paymentError) {
      throw new Error(`Failed to upsert order payment ledger row: ${paymentError.message}`);
    }

    paymentCreated = !existingPayment?.id;
  }

  return {
    orderId,
    sourceOrderId,
    sourceOrderNo: input.row.sourceOrderNo,
    sourcePaymentStatus: input.row.sourcePaymentStatus,
    orderCreated: !orderWasExisting,
    itemCreated: existingIndex < 0,
    paymentCreated
  };
}

async function ensureTeamIdForNode(input: {
  supabase: ServiceSupabase;
  orgId: string;
  programId: string;
  teamNodeId: string;
  cache: Map<string, string>;
}) {
  const cacheHit = input.cache.get(input.teamNodeId);
  if (cacheHit) {
    return cacheHit;
  }

  const { data: existing, error: existingError } = await input.supabase
    .schema("programs").from("program_teams")
    .select("id")
    .eq("program_node_id", input.teamNodeId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to load team record: ${existingError.message}`);
  }

  if (existing?.id) {
    input.cache.set(input.teamNodeId, existing.id);
    return existing.id;
  }

  const { data: inserted, error: insertError } = await input.supabase
    .schema("programs").from("program_teams")
    .insert({
      org_id: input.orgId,
      program_id: input.programId,
      program_node_id: input.teamNodeId
    })
    .select("id")
    .single();

  if (insertError || !inserted?.id) {
    throw new Error(`Failed to create team record: ${insertError?.message ?? "unknown"}`);
  }

  input.cache.set(input.teamNodeId, inserted.id);
  return inserted.id;
}

function ensureSummary(): SportsConnectCommitSummary {
  return {
    processedRows: 0,
    skippedRows: 0,
    failedRows: 0,
    createdUsers: 0,
    linkedExistingUsers: 0,
    createdPlayers: 0,
    linkedGuardians: 0,
    createdPrograms: 0,
    createdDivisions: 0,
    createdTeams: 0,
    createdSubmissions: 0,
    createdRegistrations: 0,
    createdTeamMembers: 0,
    createdOrders: 0,
    createdOrderItems: 0,
    createdOrderPayments: 0
  };
}

export async function createDryRun(input: z.input<typeof createDryRunSchema>): Promise<SportsConnectDryRunResult> {
  const parsed = createDryRunSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Invalid import request.");
  }

  const payload = parsed.data;
  const org = await requireOrgPermission(payload.orgSlug, "org.manage.read");
  const serviceSupabase = createOptionalSupabaseServiceRoleClient();

  if (!serviceSupabase) {
    throw new Error("SportsConnect import requires SUPABASE_SERVICE_ROLE_KEY.");
  }

  const parsedCsv = parseSportsConnectCsv(payload.csvContent);
  if (parsedCsv.headerWarnings.length > 0) {
    throw new Error(parsedCsv.headerWarnings.map((issue) => issue.message).join(" "));
  }

  const existingData = await listExistingProgramsAndNodes(serviceSupabase, org.orgId);

  const runRows = parsedCsv.parsedRows.map((row) => ({
    rowNumber: row.rowNumber,
    rowHash: row.rowHash,
    raw: row.raw,
    normalized: row.normalized,
    issues: row.issues,
    warnings: row.warnings
  }));

  const mappingRequirements = buildMappingRequirements({
    rows: runRows,
    programs: existingData.programs,
    nodes: existingData.nodes,
    existingDecisions: []
  });

  const summary = summarizeDryRun({
    rows: runRows.map((row) => ({
      normalized: row.normalized,
      issues: parseIssues(row.issues)
    })),
    requirements: mappingRequirements
  });

  const status = summary.unresolvedMappings === 0 ? "ready" : "dry_run";
  const sourceTimezone = isValidTimezone(payload.sourceTimezone) ? payload.sourceTimezone : "America/Detroit";

  const { data: createdRun, error: createRunError } = await serviceSupabase
    .schema("imports").from("sportsconnect_import_runs")
    .insert({
      org_id: org.orgId,
      created_by_user_id: org.userId,
      status,
      source_filename: payload.sourceFilename ?? null,
      source_timezone: sourceTimezone,
      row_count: runRows.length,
      summary_json: summary,
      mapping_json: {
        requirements: mappingRequirements,
        decisions: mappingRequirements
          .filter((requirement) => requirement.selectedMode)
          .map((requirement) => ({
            key: requirement.key,
            mode: requirement.selectedMode,
            candidateId: requirement.selectedCandidateId
          }))
      }
    })
    .select("id")
    .single();

  if (createRunError || !createdRun?.id) {
    throw new Error(`Unable to create import run: ${createRunError?.message ?? "unknown"}`);
  }

  await insertRunRows({
    supabase: serviceSupabase,
    runId: createdRun.id,
    orgId: org.orgId,
    rows: runRows
  });

  return {
    runId: createdRun.id,
    status,
    sourceFilename: payload.sourceFilename ?? null,
    summary,
    mappingRequirements,
    rowIssues: runRows
      .map((row) => ({
        rowNumber: row.rowNumber,
        messages: parseIssues(row.issues)
      }))
      .filter((entry) => entry.messages.length > 0)
  };
}

export async function resolveMappings(input: z.input<typeof resolveMappingsSchema>): Promise<SportsConnectResolveMappingResult> {
  const parsed = resolveMappingsSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Invalid mapping payload.");
  }

  const payload = parsed.data;
  const org = await requireOrgPermission(payload.orgSlug, "org.manage.read");
  const serviceSupabase = createOptionalSupabaseServiceRoleClient();

  if (!serviceSupabase) {
    throw new Error("SportsConnect import requires SUPABASE_SERVICE_ROLE_KEY.");
  }

  const loaded = await loadRunWithRows({
    supabase: serviceSupabase,
    runId: payload.runId,
    orgId: org.orgId
  });

  if (loaded.run.status === "committed") {
    throw new Error("Cannot update mappings after commit.");
  }

  const existingData = await listExistingProgramsAndNodes(serviceSupabase, org.orgId);
  const rowPayload = loaded.rows.map((row) => ({
    normalized: mapNormalizedRow(safeObject(row.normalized_row_json))
  }));

  const mappingRequirements = buildMappingRequirements({
    rows: rowPayload,
    programs: existingData.programs,
    nodes: existingData.nodes,
    existingDecisions: payload.decisions.map((decision) => ({
      key: decision.key,
      mode: decision.mode,
      candidateId: decision.candidateId ?? null
    }))
  });

  const unresolvedMappings = mappingRequirements.filter((requirement) => requirement.required && requirement.selectedMode === null).length;
  const status = unresolvedMappings === 0 ? "ready" : "dry_run";

  const { error: updateError } = await serviceSupabase
    .schema("imports").from("sportsconnect_import_runs")
    .update({
      status,
      mapping_json: {
        requirements: mappingRequirements,
        decisions: payload.decisions
      },
      summary_json: {
        ...safeObject(loaded.run.summary_json),
        unresolvedMappings
      }
    })
    .eq("id", payload.runId)
    .eq("org_id", org.orgId);

  if (updateError) {
    throw new Error(`Failed to save mapping decisions: ${updateError.message}`);
  }

  return {
    runId: payload.runId,
    status,
    unresolvedMappings,
    mappingRequirements
  };
}

export async function commitRun(input: z.input<typeof commitRunSchema>): Promise<SportsConnectCommitResult> {
  const parsed = commitRunSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Invalid commit payload.");
  }

  const payload = parsed.data;
  const org = await requireOrgPermission(payload.orgSlug, "org.manage.read");
  const serviceSupabase = createOptionalSupabaseServiceRoleClient();

  if (!serviceSupabase) {
    throw new Error("SportsConnect import requires SUPABASE_SERVICE_ROLE_KEY.");
  }

  const loaded = await loadRunWithRows({
    supabase: serviceSupabase,
    runId: payload.runId,
    orgId: org.orgId
  });

  if (loaded.run.status === "committed") {
    return {
      runId: payload.runId,
      status: "committed",
      summary: ensureSummary(),
      failures: [],
      warnings: [],
      orders: []
    };
  }

  const mappingJson = safeObject(loaded.run.mapping_json);
  const mappingRequirements = (parseJsonArray(mappingJson.requirements) as unknown[])
    .map((entry) => entry as SportsConnectMappingRequirement)
    .filter((entry) => entry && typeof entry === "object" && typeof entry.key === "string");

  const unresolvedMappings = mappingRequirements.filter((requirement) => requirement.required && requirement.selectedMode === null).length;
  if (unresolvedMappings > 0) {
    throw new Error("Resolve all required mappings before committing.");
  }

  const requirementByKey = new Map(mappingRequirements.map((requirement) => [requirement.key, requirement]));
  const summary = ensureSummary();
  const failures: Array<{ rowNumber: number; message: string }> = [];
  const warnings: Array<{ rowNumber: number; message: string }> = [];
  const importedOrders = new Map<string, { orderId: string; sourceOrderId: string; sourceOrderNo: string | null; sourcePaymentStatus: string | null }>();

  const rowHashes = loaded.rows.map((row) => row.row_hash);
  const appliedHashSet = new Set<string>();

  const loadAppliedHashesChunk = async (chunk: string[]): Promise<string[]> => {
    const { data, error } = await serviceSupabase
      .schema("imports").from("sportsconnect_import_applied_rows")
      .select("row_hash")
      .eq("org_id", org.orgId)
      .in("row_hash", chunk);

    if (!error) {
      return (data ?? [])
        .map((row) => (typeof row.row_hash === "string" ? row.row_hash : null))
        .filter((value): value is string => value !== null);
    }

    const isLikelyTransportFailure = error.message.toLowerCase().includes("fetch failed");
    if (chunk.length > 1 && isLikelyTransportFailure) {
      const splitIndex = Math.ceil(chunk.length / 2);
      const left = await loadAppliedHashesChunk(chunk.slice(0, splitIndex));
      const right = await loadAppliedHashesChunk(chunk.slice(splitIndex));
      return left.concat(right);
    }

    throw new Error(`Failed to load idempotency hashes: ${error.message}`);
  };

  const hashPageSize = 300;
  for (let i = 0; i < rowHashes.length; i += hashPageSize) {
    const chunk = rowHashes.slice(i, i + hashPageSize);
    const chunkHashes = await loadAppliedHashesChunk(chunk);
    chunkHashes.forEach((hash) => appliedHashSet.add(hash));
  }

  const runTimezone = safeString(loaded.run.source_timezone) || "America/Detroit";
  const sourceTimezone = isValidTimezone(runTimezone) ? runTimezone : "America/Detroit";

  const programCache = new Map<string, string>();
  const divisionCache = new Map<string, string>();
  const teamCache = new Map<string, string>();
  const teamIdByNodeCache = new Map<string, string>();
  const importFormCache = new Map<string, { formId: string; versionId: string }>();
  const firstGuardianByPlayerId = new Set<string>();

  for (const rowRecord of loaded.rows) {
    const rowNumber = rowRecord.row_number;

    if (appliedHashSet.has(rowRecord.row_hash)) {
      summary.skippedRows += 1;
      continue;
    }

    const issueMessages = parseIssues(rowRecord.issues_json);
    if (issueMessages.length > 0) {
      summary.failedRows += 1;
      failures.push({
        rowNumber,
        message: issueMessages.join(" ")
      });
      continue;
    }

    try {
      const normalized = mapNormalizedRow(safeObject(rowRecord.normalized_row_json));
      const rowWarnings: string[] = [];

      const programContext = await ensureProgram({
        supabase: serviceSupabase,
        orgId: org.orgId,
        programKey: normalized.programKey,
        programName: normalized.programName,
        requirementByKey,
        summary,
        cache: programCache
      });

      const divisionContext = await ensureDivision({
        supabase: serviceSupabase,
        programId: programContext.programId,
        divisionKey: normalized.divisionKey,
        divisionName: normalized.divisionName,
        requirementByKey,
        summary,
        cache: divisionCache
      });

      const teamContext = await ensureTeam({
        supabase: serviceSupabase,
        programId: programContext.programId,
        divisionNodeId: divisionContext.divisionNodeId,
        teamKey: normalized.teamKey,
        teamName: normalized.teamName,
        isUnallocatedTeam: normalized.isUnallocatedTeam,
        requirementByKey,
        summary,
        cache: teamCache
      });

      const guardianEmail = normalized.guardianEmail;
      const existingGuardian = await findAuthUserByEmail(serviceSupabase, guardianEmail);
      const guardianUserId = existingGuardian?.id ?? (await createImportedAuthUser(serviceSupabase, guardianEmail));

      if (existingGuardian) {
        summary.linkedExistingUsers += 1;
      } else {
        summary.createdUsers += 1;
      }

      await upsertOrgMembership(serviceSupabase, org.orgId, guardianUserId);
      await fillUserProfileBlanks({
        supabase: serviceSupabase,
        userId: guardianUserId,
        firstName: maybeString(normalized.accountFirstName),
        lastName: maybeString(normalized.accountLastName),
        phonePrimary: normalized.phonePrimary,
        phoneSecondary: normalized.phoneSecondary,
        phoneOther: normalized.phoneOther,
        street1: normalized.street1,
        street2: normalized.street2,
        city: normalized.city,
        state: normalized.state,
        postalCode: normalized.postalCode
      });

      const playerId = await ensurePlayer({
        supabase: serviceSupabase,
        orgId: org.orgId,
        row: normalized,
        guardianUserId,
        summary,
        warnings: rowWarnings,
        firstGuardianByPlayerId
      });

      const createdAtIso = parseRowTimestampIso(normalized, sourceTimezone);

      const orderRow = await ensureOrder({
        supabase: serviceSupabase,
        orgId: org.orgId,
        row: normalized,
        rowHash: rowRecord.row_hash,
        createdAtIso,
        playerId,
        programId: programContext.programId,
        divisionNodeId: divisionContext.divisionNodeId,
        teamNodeId: teamContext.teamNodeId,
        summary
      });

      importedOrders.set(orderRow.orderId, orderRow);

      const importForm = await ensureImportForm({
        supabase: serviceSupabase,
        orgId: org.orgId,
        programId: programContext.programId,
        programName: programContext.programName,
        actorUserId: org.userId,
        cache: importFormCache
      });

      const { data: submissionRow, error: submissionError } = await serviceSupabase
        .schema("forms").from("org_form_submissions")
        .insert({
          org_id: org.orgId,
          form_id: importForm.formId,
          version_id: importForm.versionId,
          submitted_by_user_id: guardianUserId,
          status: "submitted",
          answers_json: {},
          metadata_json: {
            source: "sportsconnect_import",
            importRunId: payload.runId,
            rowNumber,
            rowHash: rowRecord.row_hash
          },
          order_id: orderRow.orderId,
          source_payment_status: normalized.sourcePaymentStatus,
          ...(createdAtIso
            ? {
                created_at: createdAtIso,
                updated_at: createdAtIso
              }
            : {})
        })
        .select("id")
        .single();

      if (submissionError || !submissionRow?.id) {
        throw new Error(`Failed to create submission: ${submissionError?.message ?? "unknown"}`);
      }

      summary.createdSubmissions += 1;

      const programNodeId = teamContext.teamNodeId ?? divisionContext.divisionNodeId;

      const { error: entryError } = await serviceSupabase.from("org_form_submission_entries").insert({
        submission_id: submissionRow.id,
        player_id: playerId,
        program_node_id: programNodeId,
        answers_json: {},
        ...(createdAtIso
          ? {
              created_at: createdAtIso
            }
          : {})
      });

      if (entryError) {
        throw new Error(`Failed to create submission entry: ${entryError.message}`);
      }

      const registrationLookupBase = serviceSupabase
        .schema("programs").from("program_registrations")
        .select("id")
        .eq("org_id", org.orgId)
        .eq("program_id", programContext.programId)
        .eq("player_id", playerId)
        .in("status", [...ACTIVE_REGISTRATION_STATUSES]);

      const { data: existingRegistration, error: existingRegistrationError } = programNodeId
        ? await registrationLookupBase.eq("program_node_id", programNodeId).maybeSingle()
        : await registrationLookupBase.is("program_node_id", null).maybeSingle();

      if (existingRegistrationError) {
        throw new Error(`Failed to load existing registration: ${existingRegistrationError.message}`);
      }

      let registrationId = existingRegistration?.id ?? null;

      if (!registrationId) {
        const { data: createdRegistration, error: registrationError } = await serviceSupabase
          .schema("programs").from("program_registrations")
          .insert({
            org_id: org.orgId,
            program_id: programContext.programId,
            program_node_id: programNodeId,
            player_id: playerId,
            submission_id: submissionRow.id,
            status: "submitted",
            ...(createdAtIso
              ? {
                  created_at: createdAtIso,
                  updated_at: createdAtIso
                }
              : {})
          })
          .select("id")
          .single();

        if (registrationError || !createdRegistration?.id) {
          throw new Error(`Failed to create registration: ${registrationError?.message ?? "unknown"}`);
        }

        registrationId = createdRegistration.id;
        summary.createdRegistrations += 1;
      }

      if (teamContext.teamNodeId) {
        const teamId = await ensureTeamIdForNode({
          supabase: serviceSupabase,
          orgId: org.orgId,
          programId: programContext.programId,
          teamNodeId: teamContext.teamNodeId,
          cache: teamIdByNodeCache
        });

        const { data: existingTeamMember, error: existingTeamMemberError } = await serviceSupabase
          .schema("programs").from("program_team_members")
          .select("id")
          .eq("program_id", programContext.programId)
          .eq("player_id", playerId)
          .in("status", [...TEAM_ACTIVE_STATUSES])
          .maybeSingle();

        if (existingTeamMemberError) {
          throw new Error(`Failed to load existing team member: ${existingTeamMemberError.message}`);
        }

        if (!existingTeamMember?.id) {
          const { error: teamMemberError } = await serviceSupabase.schema("programs").from("program_team_members").insert({
            team_id: teamId,
            org_id: org.orgId,
            program_id: programContext.programId,
            player_id: playerId,
            registration_id: registrationId,
            status: "pending",
            role: "player",
            assigned_by_user_id: org.userId,
            ...(createdAtIso
              ? {
                  created_at: createdAtIso,
                  updated_at: createdAtIso
                }
              : {})
          });

          if (teamMemberError) {
            throw new Error(`Failed to create team member: ${teamMemberError.message}`);
          }

          summary.createdTeamMembers += 1;
        }
      }

      const createdEntityIdsJson = {
        authUserId: guardianUserId,
        playerId,
        programId: programContext.programId,
        divisionNodeId: divisionContext.divisionNodeId,
        teamNodeId: teamContext.teamNodeId,
        orderId: orderRow.orderId,
        submissionId: submissionRow.id,
        registrationId
      };

      const { error: appliedRowError } = await serviceSupabase
        .schema("imports").from("sportsconnect_import_applied_rows")
        .insert({
          org_id: org.orgId,
          run_id: payload.runId,
          run_row_id: rowRecord.id,
          row_hash: rowRecord.row_hash,
          applied_by_user_id: org.userId,
          auth_user_id: guardianUserId,
          player_id: playerId,
          program_id: programContext.programId,
          division_node_id: divisionContext.divisionNodeId,
          team_node_id: teamContext.teamNodeId,
          order_id: orderRow.orderId,
          submission_id: submissionRow.id,
          registration_id: registrationId
        });

      if (appliedRowError) {
        throw new Error(`Failed to persist row idempotency marker: ${appliedRowError.message}`);
      }

      const { error: markAppliedError } = await serviceSupabase
        .schema("imports").from("sportsconnect_import_rows")
        .update({
          applied: true,
          applied_at: new Date().toISOString(),
          warnings_json: rowWarnings,
          created_entity_ids_json: createdEntityIdsJson
        })
        .eq("id", rowRecord.id)
        .eq("run_id", payload.runId);

      if (markAppliedError) {
        throw new Error(`Failed to update row audit: ${markAppliedError.message}`);
      }

      if (orderRow.orderCreated) {
        summary.createdOrders += 1;
      }
      if (orderRow.itemCreated) {
        summary.createdOrderItems += 1;
      }
      if (orderRow.paymentCreated) {
        summary.createdOrderPayments += 1;
      }

      summary.processedRows += 1;

      rowWarnings.forEach((message) => {
        warnings.push({
          rowNumber,
          message
        });
      });
    } catch (error) {
      summary.failedRows += 1;
      failures.push({
        rowNumber,
        message: error instanceof Error ? error.message : "Failed to process row."
      });
    }
  }

  const finalStatus: "committed" | "failed" = summary.failedRows > 0 ? "failed" : "committed";
  const orderRefs = Array.from(importedOrders.values()).slice(0, 25);

  const { error: updateRunError } = await serviceSupabase
    .schema("imports").from("sportsconnect_import_runs")
    .update({
      status: finalStatus,
      committed_at: new Date().toISOString(),
      summary_json: {
        ...summary,
        failuresCount: failures.length,
        warningsCount: warnings.length,
        order_refs: orderRefs
      },
      error_text: failures.length > 0 ? `${failures.length} row(s) failed during commit.` : null
    })
    .eq("id", payload.runId)
    .eq("org_id", org.orgId);

  if (updateRunError) {
    throw new Error(`Failed to finalize import run: ${updateRunError.message}`);
  }

  revalidatePath(`/${org.orgSlug}/tools/sportsconnect`);
  revalidatePath(`/${org.orgSlug}/tools/sportsconnect`);
  revalidatePath(`/${org.orgSlug}/tools/forms`);

  return {
    runId: payload.runId,
    status: finalStatus,
    summary,
    failures,
    warnings,
    orders: orderRefs
  };
}

export async function getRunProjection(input: z.input<typeof runProjectionSchema>): Promise<SportsConnectRunProjection> {
  const parsed = runProjectionSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Invalid projection request.");
  }

  const payload = parsed.data;
  const org = await requireOrgPermission(payload.orgSlug, "org.manage.read");
  const serviceSupabase = createOptionalSupabaseServiceRoleClient();

  if (!serviceSupabase) {
    throw new Error("SportsConnect import requires SUPABASE_SERVICE_ROLE_KEY.");
  }

  const loaded = await loadRunWithRows({
    supabase: serviceSupabase,
    runId: payload.runId,
    orgId: org.orgId
  });

  const mappingJson = safeObject(loaded.run.mapping_json);
  const requirements = (parseJsonArray(mappingJson.requirements) as unknown[])
    .map((entry) => entry as SportsConnectMappingRequirement)
    .filter((entry) => entry && typeof entry === "object" && typeof entry.key === "string");

  const requirementByKey = new Map(requirements.map((requirement) => [requirement.key, requirement]));
  const unresolvedMappings = requirements.filter((requirement) => requirement.required && requirement.selectedMode === null).length;

  const resolveLabel = (kind: "program" | "division" | "team", sourceKey: string, fallback: string) => {
    const requirement = requirementByKey.get(`${kind}:${sourceKey}`);
    if (!requirement || requirement.selectedMode !== "existing" || !requirement.selectedCandidateId) {
      return fallback;
    }

    const candidate = requirement.candidates.find((entry) => entry.id === requirement.selectedCandidateId);
    return safeString(candidate?.label) || fallback;
  };

  const programs = new Map<
    string,
    {
      key: string;
      name: string;
      divisions: Map<
        string,
        {
          key: string;
          name: string;
          teams: Map<string, { key: string; name: string; players: Map<string, { key: string; name: string; birthDateIso: string | null; guardianEmail: string | null; rowCount: number }> }>;
          unallocatedPlayers: Map<string, { key: string; name: string; birthDateIso: string | null; guardianEmail: string | null; rowCount: number }>;
        }
      >;
    }
  >();

  let skippedRowsWithIssues = 0;
  const sourceProgramKeys = new Set<string>();
  const sourceDivisionKeys = new Set<string>();
  const sourceTeamKeys = new Set<string>();
  const accountEmails = new Set<string>();
  const playerSamples = new Map<string, SportsConnectNormalizedRow>();

  for (const rowRecord of loaded.rows) {
    if (parseIssues(rowRecord.issues_json).length > 0) {
      skippedRowsWithIssues += 1;
      continue;
    }

    const normalized = mapNormalizedRow(safeObject(rowRecord.normalized_row_json));
    const programName = resolveLabel("program", normalized.programKey, normalized.programName);
    const divisionName = resolveLabel("division", normalized.divisionKey, normalized.divisionName);
    const teamName =
      normalized.teamKey && !normalized.isUnallocatedTeam && normalized.teamName ? resolveLabel("team", normalized.teamKey, normalized.teamName) : null;

    const programKey = normalized.programKey || normalizeKey(programName);
    const divisionKey = normalized.divisionKey || `${programKey}::${normalizeKey(divisionName)}`;
    const resolvedTeamKey = teamName ? normalized.teamKey || `${divisionKey}::${normalizeKey(teamName)}` : null;
    const playerKey = normalized.playerKey || `${normalizeKey(normalized.playerFirstName)}|${normalizeKey(normalized.playerLastName)}|${normalized.playerBirthDateIso ?? ""}`;

    sourceProgramKeys.add(normalized.programKey || programKey);
    sourceDivisionKeys.add(normalized.divisionKey || divisionKey);
    if (normalized.teamKey && !normalized.isUnallocatedTeam) {
      sourceTeamKeys.add(normalized.teamKey);
    }
    const guardianEmail = maybeString(normalized.guardianEmail)?.toLowerCase() ?? null;
    if (guardianEmail) {
      accountEmails.add(guardianEmail);
    }
    if (!playerSamples.has(playerKey)) {
      playerSamples.set(playerKey, normalized);
    }

    const playerName = [normalized.playerFirstName, normalized.playerLastName].filter((entry) => entry && entry.trim().length > 0).join(" ").trim() || "Unnamed player";
    const playerPayload = {
      key: playerKey,
      name: playerName,
      birthDateIso: normalizeDateOfBirthIso(normalized.playerBirthDateIso),
      guardianEmail: maybeString(normalized.guardianEmail),
      rowCount: 1
    };

    const programEntry =
      programs.get(programKey) ??
      (() => {
        const created = {
          key: programKey,
          name: programName || "Program",
          divisions: new Map<
            string,
            {
              key: string;
              name: string;
              teams: Map<string, { key: string; name: string; players: Map<string, { key: string; name: string; birthDateIso: string | null; guardianEmail: string | null; rowCount: number }> }>;
              unallocatedPlayers: Map<string, { key: string; name: string; birthDateIso: string | null; guardianEmail: string | null; rowCount: number }>;
            }
          >()
        };
        programs.set(programKey, created);
        return created;
      })();

    const divisionEntry =
      programEntry.divisions.get(divisionKey) ??
      (() => {
        const created = {
          key: divisionKey,
          name: divisionName || "Division",
          teams: new Map<string, { key: string; name: string; players: Map<string, { key: string; name: string; birthDateIso: string | null; guardianEmail: string | null; rowCount: number }> }>(),
          unallocatedPlayers: new Map<string, { key: string; name: string; birthDateIso: string | null; guardianEmail: string | null; rowCount: number }>()
        };
        programEntry.divisions.set(divisionKey, created);
        return created;
      })();

    if (!resolvedTeamKey || !teamName) {
      const existingPlayer = divisionEntry.unallocatedPlayers.get(playerKey);
      if (existingPlayer) {
        existingPlayer.rowCount += 1;
      } else {
        divisionEntry.unallocatedPlayers.set(playerKey, playerPayload);
      }
      continue;
    }

    const teamEntry =
      divisionEntry.teams.get(resolvedTeamKey) ??
      (() => {
        const created = {
          key: resolvedTeamKey,
          name: teamName,
          players: new Map<string, { key: string; name: string; birthDateIso: string | null; guardianEmail: string | null; rowCount: number }>()
        };
        divisionEntry.teams.set(resolvedTeamKey, created);
        return created;
      })();

    const existingPlayer = teamEntry.players.get(playerKey);
    if (existingPlayer) {
      existingPlayer.rowCount += 1;
    } else {
      teamEntry.players.set(playerKey, playerPayload);
    }
  }

  const programList = Array.from(programs.values()).map((program) => ({
    key: program.key,
    name: program.name,
    divisions: Array.from(program.divisions.values()).map((division) => ({
      key: division.key,
      name: division.name,
      teams: Array.from(division.teams.values()).map((team) => ({
        key: team.key,
        name: team.name,
        players: Array.from(team.players.values())
      })),
      unallocatedPlayers: Array.from(division.unallocatedPlayers.values())
    }))
  }));

  let divisionCount = 0;
  let teamCount = 0;
  let playerCount = 0;
  let unallocatedPlayerCount = 0;

  for (const program of programList) {
    divisionCount += program.divisions.length;
    for (const division of program.divisions) {
      teamCount += division.teams.length;
      unallocatedPlayerCount += division.unallocatedPlayers.length;
      playerCount += division.unallocatedPlayers.length;
      for (const team of division.teams) {
        playerCount += team.players.length;
      }
    }
  }

  const countModes = (
    kind: "program" | "division" | "team",
    keys: Set<string>
  ): {
    total: number;
    created: number;
    existing: number;
  } => {
    let created = 0;
    let existing = 0;

    keys.forEach((key) => {
      const requirement = requirementByKey.get(`${kind}:${key}`);
      if (requirement?.selectedMode === "existing") {
        existing += 1;
      } else {
        created += 1;
      }
    });

    return {
      total: keys.size,
      created,
      existing
    };
  };

  const programCounts = countModes("program", sourceProgramKeys);
  const divisionCounts = countModes("division", sourceDivisionKeys);
  const teamCounts = countModes("team", sourceTeamKeys);

  const existingAccountEmails = new Set<string>();
  const allAuthUsers = await listAllAuthUsers(serviceSupabase).catch((error) => {
    throw new Error(error instanceof Error ? `Failed to project account summary: ${error.message}` : "Failed to project account summary.");
  });
  allAuthUsers.forEach((user) => {
    const email = safeString(user.email).toLowerCase();
    if (email && accountEmails.has(email)) {
      existingAccountEmails.add(email);
    }
  });

  let existingPlayers = 0;
  let newPlayers = 0;
  const legacyPlayerCache = new Map<string, string | null>();
  const fallbackPlayerCache = new Map<string, string | null>();

  for (const row of playerSamples.values()) {
    const legacyId = pickFirst(row.playerLegacyId, row.playerAssociationId, row.orderDetailPlayerId);
    let existingPlayerId: string | null = null;

    if (legacyId) {
      if (legacyPlayerCache.has(legacyId)) {
        existingPlayerId = legacyPlayerCache.get(legacyId) ?? null;
      } else {
        const match = await findPlayerByLegacyId({
          supabase: serviceSupabase,
          legacyId
        });
        existingPlayerId = match?.id ?? null;
        legacyPlayerCache.set(legacyId, existingPlayerId);
      }
    }

    if (!existingPlayerId) {
      const fallbackDob = normalizeDateOfBirthIso(row.playerBirthDateIso);
      const fallbackKey = `${normalizeKey(row.playerFirstName)}|${normalizeKey(row.playerLastName)}|${fallbackDob ?? ""}`;
      if (fallbackPlayerCache.has(fallbackKey)) {
        existingPlayerId = fallbackPlayerCache.get(fallbackKey) ?? null;
      } else {
        const match = await findPlayerByExactFallback({
          supabase: serviceSupabase,
          orgId: org.orgId,
          firstName: row.playerFirstName,
          lastName: row.playerLastName,
          dateOfBirth: fallbackDob
        });
        existingPlayerId = match?.id ?? null;
        fallbackPlayerCache.set(fallbackKey, existingPlayerId);
      }
    }

    if (existingPlayerId) {
      existingPlayers += 1;
    } else {
      newPlayers += 1;
    }
  }

  return {
    runId: payload.runId,
    status: unresolvedMappings === 0 ? "ready" : "dry_run",
    unresolvedMappings,
    summary: {
      programs: programCounts.total || programList.length,
      newPrograms: programCounts.created,
      existingPrograms: programCounts.existing,
      divisions: divisionCounts.total || divisionCount,
      newDivisions: divisionCounts.created,
      existingDivisions: divisionCounts.existing,
      teams: teamCounts.total || teamCount,
      newTeams: teamCounts.created,
      existingTeams: teamCounts.existing,
      players: playerCount,
      newPlayers,
      existingPlayers,
      accounts: accountEmails.size,
      newAccounts: Math.max(0, accountEmails.size - existingAccountEmails.size),
      existingAccounts: existingAccountEmails.size,
      unallocatedPlayers: unallocatedPlayerCount,
      skippedRowsWithIssues
    },
    programs: programList
  };
}

export async function listRunHistory(input: z.input<typeof runHistorySchema>): Promise<{ runs: SportsConnectRunHistoryItem[] }> {
  const parsed = runHistorySchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Invalid history request.");
  }

  const payload = parsed.data;
  const org = await requireOrgPermission(payload.orgSlug, "org.manage.read");
  const serviceSupabase = createOptionalSupabaseServiceRoleClient();

  if (!serviceSupabase) {
    throw new Error("SportsConnect import requires SUPABASE_SERVICE_ROLE_KEY.");
  }

  const { data, error } = await serviceSupabase
    .schema("imports").from("sportsconnect_import_runs")
    .select("id, status, source_filename, row_count, summary_json, created_at, committed_at, error_text")
    .eq("org_id", org.orgId)
    .order("created_at", { ascending: false })
    .limit(payload.limit);

  if (error) {
    throw new Error(`Failed to load run history: ${error.message}`);
  }

  const runs = (data ?? []).map((row) => ({
    id: safeString(row.id),
    status: (safeString(row.status) as SportsConnectRunHistoryItem["status"]) || "dry_run",
    sourceFilename: safeStringOrNull(row.source_filename),
    rowCount: Number(row.row_count ?? 0),
    summary: safeObject(row.summary_json),
    createdAt: safeString(row.created_at),
    committedAt: safeStringOrNull(row.committed_at),
    errorText: safeStringOrNull(row.error_text)
  }));

  return {
    runs
  };
}

export async function lookupActivationStateByEmail(
  input: z.input<typeof activationLookupSchema>
): Promise<SportsConnectActivationLookup> {
  const parsed = activationLookupSchema.safeParse(input);
  if (!parsed.success) {
    return {
      found: false,
      requiresActivation: false
    };
  }

  const serviceSupabase = createOptionalSupabaseServiceRoleClient();
  if (!serviceSupabase) {
    return {
      found: false,
      requiresActivation: false
    };
  }

  const user = await findAuthUserByEmail(serviceSupabase, parsed.data.email);
  if (!user) {
    return {
      found: false,
      requiresActivation: false
    };
  }

  const metadata = safeObject(user.raw_user_meta_data);
  const importedFlag = metadata.sportsconnect_imported === true || metadata.sportsconnect_activation_required === true;
  const requiresActivation = importedFlag && !user.email_confirmed_at;

  return {
    found: true,
    requiresActivation
  };
}

export async function sendActivationEmail(input: z.input<typeof activationSendSchema>): Promise<SportsConnectActivationSendResult> {
  const parsed = activationSendSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Invalid email address."
    };
  }

  try {
    const origin = await getRequestOrigin();
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent("/auth/reset?mode=update")}`;
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo
    });

    if (error) {
      return {
        ok: false,
        message: "Unable to send activation email right now."
      };
    }

    return {
      ok: true,
      message: "Activation email sent. Check your inbox to verify your email and set a password."
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return {
      ok: false,
      message: "Unable to send activation email right now."
    };
  }
}
