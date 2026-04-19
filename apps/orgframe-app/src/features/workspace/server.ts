import { createSupabaseServer } from "@/src/shared/data-api/server";
import { listImportConflictsAction, listImportRunsAction } from "@/src/features/imports/actions";
import type { ConflictRecord, ImportRunListItem } from "@/src/features/imports/contracts";

export type PendingWorkspaceAction = {
  id: string;
  intentType: string;
  summary: string;
  createdAt: string;
  hasAmbiguity: boolean;
};

export type WorkspaceOverviewData = {
  kpis: {
    players: number;
    activeTeams: number;
    upcomingPractices7d: number;
    unresolvedConflicts: number;
  };
  upcomingPractices: Array<{
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    teamId: string | null;
  }>;
  recentActivity: Array<{
    id: string;
    kind: "import" | "ai_action" | "conflict";
    label: string;
    at: string;
  }>;
};

export type WorkspaceImportData = {
  runs: ImportRunListItem[];
  unresolvedConflicts: number | null;
  canAccess: boolean;
  activeRunId: string | null;
  activeRunConflicts: ConflictRecord[];
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
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

async function countRows(input: {
  schema: string;
  table: string;
  orgId: string;
  filters?: Array<{ column: string; value: string }>;
}) {
  const supabase = await createSupabaseServer();
  let query = supabase.schema(input.schema).from(input.table).select("id", { count: "exact", head: true }).eq("org_id", input.orgId);
  for (const filter of input.filters ?? []) {
    query = query.eq(filter.column, filter.value);
  }

  const { count } = await query;
  return count ?? 0;
}

export async function getWorkspaceImportData(input: { orgSlug: string }): Promise<WorkspaceImportData> {
  try {
    const runsResult = await listImportRunsAction({
      orgSlug: input.orgSlug,
      limit: 20,
    });

    const activeRun = runsResult.runs.find((run) => run.status === "awaiting_conflicts" || run.status === "resolving_conflicts");
    if (!activeRun) {
      return {
        runs: runsResult.runs,
        unresolvedConflicts: 0,
        canAccess: true,
        activeRunId: null,
        activeRunConflicts: [],
      };
    }

    const conflicts = await listImportConflictsAction({
      orgSlug: input.orgSlug,
      runId: activeRun.id,
      state: "needs_review",
      limit: 200,
    });

    return {
      runs: runsResult.runs,
      unresolvedConflicts: conflicts.conflicts.length,
      canAccess: true,
      activeRunId: activeRun.id,
      activeRunConflicts: conflicts.conflicts,
    };
  } catch {
    return {
      runs: [],
      unresolvedConflicts: null,
      canAccess: false,
      activeRunId: null,
      activeRunConflicts: [],
    };
  }
}

export async function listWorkspacePendingActions(input: { orgId: string; limit?: number }): Promise<PendingWorkspaceAction[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("ai")
    .from("audit_logs")
    .select("id, created_at, detail_json")
    .eq("org_id", input.orgId)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 25);

  if (error) {
    return [];
  }

  return (data ?? [])
    .map((row) => {
      const detail = asObject((row as { detail_json?: unknown }).detail_json);
      const executed = detail.executed === true;
      const canceled = detail.canceled === true;
      const proposal = asObject(detail.proposal);
      const intentType = asString(proposal.intentType);
      const summary = asString(proposal.summary) || asString(detail.prompt) || "Pending action";
      const ambiguity = proposal.ambiguity;

      return {
        id: asString((row as { id?: unknown }).id),
        createdAt: asString((row as { created_at?: unknown }).created_at),
        intentType,
        summary,
        hasAmbiguity: Boolean(ambiguity && typeof ambiguity === "object"),
        executed,
        canceled,
      };
    })
    .filter((row) => !row.executed && !row.canceled && row.id)
    .slice(0, 12)
    .map(({ id, createdAt, intentType, summary, hasAmbiguity }) => ({ id, createdAt, intentType, summary, hasAmbiguity }));
}

export async function getWorkspaceOverviewData(input: {
  orgId: string;
  importData: WorkspaceImportData;
  pendingActions: PendingWorkspaceAction[];
}): Promise<WorkspaceOverviewData> {
  const [players, activeTeams, upcomingPractices] = await Promise.all([
    countRows({
      schema: "people",
      table: "profiles",
      orgId: input.orgId,
      filters: [{ column: "profile_type", value: "player" }],
    }).catch(() => 0),
    countRows({
      schema: "programs",
      table: "program_teams",
      orgId: input.orgId,
      filters: [{ column: "status", value: "active" }],
    }).catch(() => 0),
    (async () => {
      const supabase = await createSupabaseServer();
      const now = new Date();
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);
      const { data } = await supabase
        .schema("calendar")
        .from("calendar_item_occurrences")
        .select("id, starts_at_utc, ends_at_utc, item_id, metadata")
        .eq("org_id", input.orgId)
        .gte("starts_at_utc", now.toISOString())
        .lte("starts_at_utc", nextWeek.toISOString())
        .order("starts_at_utc", { ascending: true })
        .limit(25);

      const rows = (data ?? []).map((row) => ({
        id: asString(row.id),
        itemId: asString(row.item_id),
        startsAt: asString(row.starts_at_utc),
        endsAt: asString(row.ends_at_utc),
        teamId: typeof row.metadata === "object" && row.metadata && !Array.isArray(row.metadata) ? asString((row.metadata as Record<string, unknown>).host_team_id) || null : null,
      }));

      const withTitles = await Promise.all(
        rows.map(async (row) => {
          const { data: item } = await supabase
            .schema("calendar")
            .from("calendar_items")
            .select("title, host_team_id")
            .eq("org_id", input.orgId)
            .eq("id", row.itemId)
            .maybeSingle();

          return {
            id: row.id,
            title: asString(item?.title) || "Practice",
            startsAt: row.startsAt,
            endsAt: row.endsAt,
            teamId: asString(item?.host_team_id) || row.teamId,
          };
        })
      );

      return withTitles;
    })().catch(() => []),
  ]);

  const unresolvedConflicts = input.importData.unresolvedConflicts ?? 0;

  const recentActivity: WorkspaceOverviewData["recentActivity"] = [
    ...input.importData.runs.slice(0, 6).map((run) => ({
      id: `import-${run.id}`,
      kind: "import" as const,
      label: `${run.sourceFilename ?? "Import"} • ${run.status}`,
      at: run.updatedAt,
    })),
    ...input.pendingActions.slice(0, 6).map((action) => ({
      id: `ai-${action.id}`,
      kind: "ai_action" as const,
      label: action.summary,
      at: action.createdAt,
    })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 10);

  if (unresolvedConflicts > 0 && input.importData.activeRunId) {
    recentActivity.unshift({
      id: `conflict-${input.importData.activeRunId}`,
      kind: "conflict",
      label: `${unresolvedConflicts} unresolved Smart Import conflicts`,
      at: new Date().toISOString(),
    });
  }

  return {
    kpis: {
      players,
      activeTeams,
      upcomingPractices7d: upcomingPractices.length,
      unresolvedConflicts,
    },
    upcomingPractices: upcomingPractices.slice(0, 8),
    recentActivity,
  };
}

export function extractRunConflictCount(run: ImportRunListItem) {
  const summary = asObject(run.summary);
  const explicit = asNumber(summary.conflicts_total) || asNumber(summary.conflicts) || asNumber(summary.unresolved_conflicts);
  return explicit > 0 ? explicit : 0;
}
