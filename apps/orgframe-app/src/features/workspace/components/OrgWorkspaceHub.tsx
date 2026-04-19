"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Boxes, FileSpreadsheet, Layers3, Plus, Trophy } from "lucide-react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Badge } from "@orgframe/ui/primitives/badge";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { Checkbox } from "@orgframe/ui/primitives/checkbox";
import { DataTable, type DataTableColumn } from "@orgframe/ui/primitives/data-table";
import { Panel } from "@orgframe/ui/primitives/panel";
import { Popup } from "@orgframe/ui/primitives/popup";
import { SelectionBox } from "@orgframe/ui/primitives/selection-box";
import { useToast } from "@orgframe/ui/primitives/toast";
import { useFileManager } from "@/src/features/files/manager";
import { useWorkspaceCopilot } from "@/src/features/workspace/copilot/WorkspaceCopilotProvider";
import {
  applyImportBatchAction,
  cancelImportRunAction,
  getImportRunStatusAction,
  listImportConflictsAction,
  listImportRunsAction,
  previewImportFileAction,
  processImportBatchAction,
  resolveConflictBatchAction,
  resolveConflictManuallyAction,
  startImportRunAction,
} from "@/src/features/imports/actions";
import { importProfiles, type ConflictRecord, type ImportProfileKey, type ImportRunListItem } from "@/src/features/imports/contracts";

type WorkspaceOverviewData = {
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

type OrgWorkspaceHubProps = {
  orgSlug: string;
  orgName: string;
  page: "dashboard" | "import" | "data";
  importRuns: ImportRunListItem[];
  unresolvedConflicts: number | null;
  canAccessImports: boolean;
  redirectedFromTool?: string | null;
  activeRunId: string | null;
  initialConflicts: ConflictRecord[];
  initialOverview: WorkspaceOverviewData;
};

type CanvasView = "overview" | "data_table" | "calendar" | "import_review" | "visualization" | "action_result";
type AddDataStep = "platform" | "upload" | "select";
type ImportPlatform = "spreadsheet" | "sportsconnect" | "stack_sports" | "other";

const PROCESS_BATCH_DEFAULT = 25;
const APPLY_BATCH_DEFAULT = 25;
const CONFLICT_BATCH_DEFAULT = 25;
const PROFILE_DEFAULTS: Record<
  ImportProfileKey,
  {
    label: string;
    description: string;
    fields: string[];
    defaults: string[];
  }
> = {
  people_roster: {
    label: "People Roster",
    description: "Players, guardians, and roster identity fields.",
    fields: ["display_name", "user_email", "jersey_number", "phone", "birth_date", "team_name"],
    defaults: ["display_name", "user_email", "jersey_number", "team_name"],
  },
  program_structure: {
    label: "Program Structure",
    description: "Programs, divisions, and team hierarchy data.",
    fields: ["program_name", "division_name", "team_name", "age_group", "season_label", "status"],
    defaults: ["program_name", "division_name", "team_name", "status"],
  },
  commerce_orders: {
    label: "Commerce Orders",
    description: "Payments, invoices, and order records.",
    fields: ["order_number", "customer_email", "status", "total_amount", "line_items", "paid_at"],
    defaults: ["order_number", "customer_email", "status", "total_amount"],
  },
};
const PLATFORM_OPTIONS: Array<{ key: ImportPlatform; label: string; description: string; suggestedProfile: ImportProfileKey }> = [
  {
    key: "spreadsheet",
    label: "Spreadsheet (Custom)",
    description: "CSV/XLSX exports from Google Sheets, Excel, or other custom sources.",
    suggestedProfile: "people_roster",
  },
  {
    key: "sportsconnect",
    label: "Sports Connect",
    description: "Exports from Sports Connect registration and roster tools.",
    suggestedProfile: "people_roster",
  },
  {
    key: "stack_sports",
    label: "Stack Sports",
    description: "Program and roster exports from Stack Sports.",
    suggestedProfile: "program_structure",
  },
  {
    key: "other",
    label: "Other Platform",
    description: "Any other source file; choose fields/rows before import.",
    suggestedProfile: "people_roster",
  },
];

const PROFILE_FIELD_ALIASES: Record<ImportProfileKey, Record<string, string[]>> = {
  people_roster: {
    display_name: ["display_name", "name", "full_name", "player_name", "athlete_name"],
    user_email: ["user_email", "email", "parent_email", "guardian_email"],
    jersey_number: ["jersey_number", "jersey", "number"],
    phone: ["phone", "phone_number", "mobile", "cell"],
    birth_date: ["birth_date", "dob", "date_of_birth", "birthday"],
    team_name: ["team_name", "team"],
  },
  program_structure: {
    program_name: ["program_name", "program"],
    division_name: ["division_name", "division"],
    team_name: ["team_name", "team"],
    age_group: ["age_group", "age", "age_bracket"],
    season_label: ["season_label", "season"],
    status: ["status", "state"],
  },
  commerce_orders: {
    order_number: ["order_number", "order_id", "invoice_number"],
    customer_email: ["customer_email", "email", "buyer_email", "parent_email"],
    status: ["status", "state", "payment_status"],
    total_amount: ["total_amount", "amount", "total", "order_total"],
    line_items: ["line_items", "items", "order_items"],
    paid_at: ["paid_at", "payment_date", "paid_date"],
  },
};

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function detectAvailableProfiles(headers: string[]): ImportProfileKey[] {
  const normalizedHeaders = new Set(headers.map((header) => normalizeHeader(header)));
  const matches = importProfiles.map((profile) => {
    const fields = PROFILE_FIELD_ALIASES[profile];
    const matchedFieldCount = Object.values(fields).reduce((count, aliases) => {
      const hasMatch = aliases.some((alias) => normalizedHeaders.has(normalizeHeader(alias)));
      return hasMatch ? count + 1 : count;
    }, 0);
    return { profile, matchedFieldCount };
  });

  const detected = matches.filter((entry) => entry.matchedFieldCount >= 2).map((entry) => entry.profile);
  if (detected.length > 0) {
    return detected;
  }

  const best = matches.sort((a, b) => b.matchedFieldCount - a.matchedFieldCount)[0];
  return best && best.matchedFieldCount > 0 ? [best.profile] : (["people_roster"] satisfies ImportProfileKey[]);
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}


function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }
  return new Date(value).toLocaleString();
}

function conflictRowLabel(conflict: ConflictRecord) {
  const payload = asObject(conflict.importedPayload);
  const normalized = asObject(payload.normalized);
  const name = typeof normalized.display_name === "string" ? normalized.display_name : "";
  const email = typeof normalized.user_email === "string" ? normalized.user_email : "";
  if (name) {
    return name;
  }
  if (email) {
    return email;
  }
  return conflict.rowId;
}

function buildImportConflictRateData(runs: ImportRunListItem[]) {
  return runs
    .slice(0, 8)
    .reverse()
    .map((run, index) => {
      const summary = asObject(run.summary);
      const conflicts = Number(summary.conflicts_total ?? summary.conflicts ?? summary.unresolved_conflicts ?? 0);
      const rows = Math.max(Number(run.rowCount) || 0, 1);
      return {
        name: run.sourceFilename ? run.sourceFilename.slice(0, 16) : `Run ${index + 1}`,
        rate: Number(((conflicts / rows) * 100).toFixed(1)),
      };
    });
}

function buildAttendanceTrendData(runs: ImportRunListItem[]) {
  return runs
    .slice(0, 8)
    .reverse()
    .map((run, index) => ({
      name: `${index + 1}`,
      trend: Math.max(0, Math.min(100, Math.round(run.progress))),
    }));
}

function buildOrgMixData(overview: WorkspaceOverviewData) {
  return [
    { name: "Players", value: Math.max(overview.kpis.players, 0) },
    { name: "Teams", value: Math.max(overview.kpis.activeTeams, 0) },
    { name: "Practices", value: Math.max(overview.kpis.upcomingPractices7d, 0) },
  ];
}

function maxValue(items: Array<{ value: number }>) {
  return items.reduce((max, item) => Math.max(max, item.value), 1);
}

export function OrgWorkspaceHub({
  orgSlug,
  orgName,
  page,
  importRuns,
  unresolvedConflicts,
  canAccessImports,
  redirectedFromTool,
  activeRunId,
  initialConflicts,
  initialOverview,
}: OrgWorkspaceHubProps) {
  const { toast } = useToast();
  const { openFileManager } = useFileManager();
  const { setWorkspaceScope } = useWorkspaceCopilot();

  const [canvasView, setCanvasView] = useState<CanvasView>(page === "import" ? "import_review" : page === "data" ? "data_table" : "overview");

  const [runs, setRuns] = useState<ImportRunListItem[]>(importRuns);
  const [activeWorkspaceRunId, setActiveWorkspaceRunId] = useState<string | null>(activeRunId);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>(initialConflicts);
  const [selectedConflict, setSelectedConflict] = useState<ConflictRecord | null>(null);
  const [isResolvingConflict, setIsResolvingConflict] = useState(false);
  const [showCancelRunModal, setShowCancelRunModal] = useState(false);
  const [showAddDataPopup, setShowAddDataPopup] = useState(false);
  const [addDataStep, setAddDataStep] = useState<AddDataStep>("platform");
  const [isBusyImport, setIsBusyImport] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<ImportPlatform>("spreadsheet");
  const [selectedImportProfiles, setSelectedImportProfiles] = useState<ImportProfileKey[]>(["people_roster"]);
  const [availableImportProfiles, setAvailableImportProfiles] = useState<ImportProfileKey[]>(["people_roster"]);
  const [importantFields, setImportantFields] = useState<string[]>(PROFILE_DEFAULTS.people_roster.defaults);
  const [uploadedFile, setUploadedFile] = useState<{
    id: string;
    path: string;
    name: string;
    mime: string;
    size: number;
    bucket: string;
  } | null>(null);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Array<Record<string, unknown>>>([]);
  const [previewTotalRows, setPreviewTotalRows] = useState<number>(0);
  const [selectedRowNumbers, setSelectedRowNumbers] = useState<number[]>([]);

  const [overview] = useState<WorkspaceOverviewData>(initialOverview);

  const drivingRef = useRef(false);

  const scopeEntityIds = useMemo(() => {
    if (selectedConflict) {
      return [selectedConflict.id, selectedConflict.rowId];
    }
    if (activeWorkspaceRunId) {
      return [activeWorkspaceRunId];
    }
    return [];
  }, [activeWorkspaceRunId, selectedConflict]);

  async function refreshRuns() {
    try {
      const result = await listImportRunsAction({ orgSlug, limit: 20 });
      setRuns(result.runs);
      const active = result.runs.find((run) => run.status === "awaiting_conflicts" || run.status === "resolving_conflicts" || run.status === "queued" || run.status === "processing" || run.status === "ready_to_apply" || run.status === "applying");
      setActiveWorkspaceRunId(active?.id ?? null);
      return active?.id ?? null;
    } catch {
      return null;
    }
  }

  async function loadConflicts(runId: string) {
    try {
      const result = await listImportConflictsAction({
        orgSlug,
        runId,
        state: "needs_review",
        limit: 200,
      });
      setConflicts(result.conflicts);
      return result.conflicts;
    } catch {
      return [];
    }
  }

  async function refreshRun(runId: string) {
    return getImportRunStatusAction({ orgSlug, runId });
  }

  async function driveRun(runId: string) {
    if (drivingRef.current) {
      return;
    }

    drivingRef.current = true;
    let processBatchSize = PROCESS_BATCH_DEFAULT;
    let applyBatchSize = APPLY_BATCH_DEFAULT;
    let conflictBatchSize = CONFLICT_BATCH_DEFAULT;

    try {
      for (let i = 0; i < 30; i += 1) {
        const run = await refreshRun(runId);

        if (run.status === "awaiting_conflicts" || run.status === "resolving_conflicts") {
          await resolveConflictBatchAction({ orgSlug, runId, batchSize: conflictBatchSize });
          const pending = await loadConflicts(runId);
          if (pending.length > 0) {
            break;
          }
          continue;
        }

        if (run.status === "queued" || run.status === "processing") {
          await processImportBatchAction({ orgSlug, runId, batchSize: processBatchSize });
          continue;
        }

        if (run.status === "ready_to_apply" || run.status === "applying") {
          await applyImportBatchAction({ orgSlug, runId, batchSize: applyBatchSize });
          continue;
        }

        break;
      }
    } catch {
      // ignored; surfaced via status polling
    } finally {
      await refreshRuns();
      drivingRef.current = false;
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      void (async () => {
        const currentRunId = activeWorkspaceRunId ?? (await refreshRuns());
        if (!currentRunId) {
          return;
        }

        const run = await refreshRun(currentRunId).catch(() => null);
        if (!run) {
          return;
        }

        if (run.status === "awaiting_conflicts" || run.status === "resolving_conflicts") {
          await loadConflicts(currentRunId);
          return;
        }

        if (run.status === "queued" || run.status === "processing" || run.status === "ready_to_apply" || run.status === "applying") {
          await driveRun(currentRunId);
          return;
        }
      })();
    }, 3500);

    return () => window.clearInterval(timer);
  }, [activeWorkspaceRunId, orgSlug]);

  useEffect(() => {
    const initialView = page === "import" ? "import_review" : page === "data" ? "data_table" : "overview";
    setCanvasView(initialView);
  }, [page]);

  useEffect(() => {
    setWorkspaceScope({
      view: canvasView,
      entityType: selectedConflict ? "import_conflict" : activeWorkspaceRunId ? "import_run" : "organization",
      entityIds: scopeEntityIds,
      importRunId: activeWorkspaceRunId ?? undefined,
    });
  }, [activeWorkspaceRunId, canvasView, scopeEntityIds, selectedConflict, setWorkspaceScope]);

  useEffect(() => {
    const onExecutionResult = () => {
      void refreshRuns();
    };
    window.addEventListener("workspace-copilot:execution-result", onExecutionResult);
    return () => window.removeEventListener("workspace-copilot:execution-result", onExecutionResult);
  }, []);

  async function pickFileAndBuildPreview() {
    setIsBusyImport(true);
    try {
      const selected = await openFileManager({
        mode: "select",
        selectionType: "single",
        orgSlug,
        title: "Select import file",
        subtitle: "Choose a CSV or XLSX file for Smart Import.",
        fileTypes:
          ".csv,.cvs,.xlsx,text/csv,text/x-csv,application/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        defaultFolder: {
          kind: "system",
          key: "imports",
        },
      });

      const file = selected?.[0] ?? null;
      if (!file) {
        return;
      }

      setUploadedFile({
        id: file.id,
        path: file.path,
        name: file.name,
        mime: file.mime,
        size: file.size,
        bucket: file.bucket,
      });

      const preview = await previewImportFileAction({
        orgSlug,
        filePath: file.path,
        fileName: file.name,
        bucket: file.bucket,
        mimeType: file.mime,
        profileKey: "people_roster",
      });

      const detectedProfiles = detectAvailableProfiles(preview.headers);
      const headers = preview.headers.length > 0 ? preview.headers : PROFILE_DEFAULTS[detectedProfiles[0] ?? "people_roster"].fields;
      setAvailableImportProfiles(detectedProfiles);
      setSelectedImportProfiles((current) => {
        const validCurrent = current.filter((profile) => detectedProfiles.includes(profile));
        return validCurrent.length > 0 ? validCurrent : [detectedProfiles[0] ?? "people_roster"];
      });
      setPreviewHeaders(headers);
      setPreviewRows(preview.rows);
      setPreviewTotalRows(preview.totalRows);
      setImportantFields((current) => {
        const next = current.filter((field) => headers.includes(field));
        return next.length > 0 ? next : headers.slice(0, Math.min(4, headers.length));
      });
      setSelectedRowNumbers(
        preview.rows
          .map((row) => Number(row.__row_number))
          .filter((value) => Number.isInteger(value) && value > 0)
      );
      setAddDataStep("select");
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Unable to preview import file.",
        variant: "destructive",
      });
    } finally {
      setIsBusyImport(false);
    }
  }

  async function startImportFromSelection() {
    if (!uploadedFile || selectedImportProfiles.length === 0) {
      return;
    }

    setIsBusyImport(true);
    try {
      const createdRunIds: string[] = [];
      for (const profileKey of selectedImportProfiles) {
        const response = await startImportRunAction({
          orgSlug,
          fileId: uploadedFile.id,
          filePath: uploadedFile.path,
          fileName: uploadedFile.name,
          mimeType: uploadedFile.mime,
          sizeBytes: uploadedFile.size,
          bucket: uploadedFile.bucket,
          sourcePlatformKey: selectedPlatform,
          profileKey,
          importantFields,
          selectedRowNumbers,
        });

        const runId = typeof response.run_id === "string" ? response.run_id : null;
        if (!runId) {
          throw new Error(`Import run was not created for ${PROFILE_DEFAULTS[profileKey].label}.`);
        }
        createdRunIds.push(runId);
      }

      setActiveWorkspaceRunId(createdRunIds[0] ?? null);
      setCanvasView("import_review");
      setShowAddDataPopup(false);
      setAddDataStep("platform");
      setUploadedFile(null);
      setPreviewHeaders([]);
      setPreviewRows([]);
      setPreviewTotalRows(0);
      setSelectedRowNumbers([]);
      setAvailableImportProfiles(["people_roster"]);
      setSelectedImportProfiles(["people_roster"]);
      await refreshRuns();
      toast({
        title:
          createdRunIds.length === 1
            ? "Import started."
            : `${createdRunIds.length} imports started (${selectedImportProfiles.length} data types).`,
      });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Unable to start import.",
        variant: "destructive",
      });
    } finally {
      setIsBusyImport(false);
    }
  }

  async function resolveConflict(conflict: ConflictRecord, action: "insert" | "update" | "skip", targetId?: string) {
    if (!activeWorkspaceRunId) {
      return;
    }

    setIsResolvingConflict(true);
    try {
      await resolveConflictManuallyAction({
        orgSlug,
        runId: activeWorkspaceRunId,
        conflictId: conflict.id,
        action,
        targetId: targetId ?? undefined,
        rationale: "Resolved from AI Workspace command center.",
      });
      const next = await loadConflicts(activeWorkspaceRunId);
      if (next.length === 0) {
        await driveRun(activeWorkspaceRunId);
      }
      setSelectedConflict(null);
      toast({ title: "Conflict resolved." });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Unable to resolve conflict.",
        variant: "destructive",
      });
    } finally {
      setIsResolvingConflict(false);
    }
  }

  async function confirmCancelRun() {
    if (!activeWorkspaceRunId) {
      setShowCancelRunModal(false);
      return;
    }

    setIsBusyImport(true);
    try {
      await cancelImportRunAction({ orgSlug, runId: activeWorkspaceRunId });
      await refreshRuns();
      setConflicts([]);
      setSelectedConflict(null);
      setShowCancelRunModal(false);
      toast({ title: "Import run cancelled." });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Unable to cancel run.",
        variant: "destructive",
      });
    } finally {
      setIsBusyImport(false);
    }
  }

  const conflictRowsForTable = useMemo(() => {
    return conflicts.map((conflict) => {
      const payload = asObject(conflict.importedPayload);
      const normalized = asObject(payload.normalized);
      return {
        id: conflict.id,
        label: conflictRowLabel(conflict),
        conflictType: conflict.conflictType,
        stage: typeof payload.failed_stage === "string" ? payload.failed_stage : "review",
        email: typeof normalized.user_email === "string" ? normalized.user_email : "",
        confidence: typeof conflict.aiSuggestion?.confidence === "number" ? conflict.aiSuggestion.confidence : null,
        source: conflict,
      };
    });
  }, [conflicts]);

  const importConflictRateData = useMemo(() => buildImportConflictRateData(runs), [runs]);
  const attendanceTrendData = useMemo(() => buildAttendanceTrendData(runs), [runs]);
  const orgMixData = useMemo(() => buildOrgMixData(overview), [overview]);
  const attendanceMax = useMemo(() => maxValue(attendanceTrendData.map((item) => ({ value: item.trend }))), [attendanceTrendData]);
  const conflictMax = useMemo(() => maxValue(importConflictRateData.map((item) => ({ value: item.rate }))), [importConflictRateData]);
  const orgMixMax = useMemo(() => maxValue(orgMixData), [orgMixData]);

  const unresolvedConflictCount = unresolvedConflicts ?? conflicts.length;
  const selectedRowCount = selectedRowNumbers.length;
  const previewTableColumns = useMemo<DataTableColumn<Record<string, unknown>>[]>(() => {
    const base: DataTableColumn<Record<string, unknown>>[] = [
      {
        key: "__select__",
        label: "Use",
        defaultVisible: true,
        sortable: false,
        renderCell: (row) => {
          const rowNumber = Number(row.__row_number);
          return <Checkbox checked={selectedRowNumbers.includes(rowNumber)} onCheckedChange={() => togglePreviewRow(rowNumber)} />;
        },
      },
      {
        key: "__row_number",
        label: "Row",
        defaultVisible: true,
        sortable: true,
        renderCell: (row) => String(row.__row_number ?? ""),
        renderSortValue: (row) => Number(row.__row_number ?? 0),
      },
    ];

    const dynamic = previewHeaders.map((header) => ({
      key: header,
      label: header,
      defaultVisible: true,
      sortable: false,
      renderHeader: () => (
        <label className="inline-flex items-center gap-2">
          <Checkbox checked={importantFields.includes(header)} onCheckedChange={() => toggleImportantField(header)} />
          <span className="truncate">{header}</span>
        </label>
      ),
      renderCell: (row: Record<string, unknown>) => String(row[header] ?? ""),
      renderSearchValue: (row: Record<string, unknown>) => String(row[header] ?? ""),
      renderSortValue: (row: Record<string, unknown>) => String(row[header] ?? ""),
    })) satisfies DataTableColumn<Record<string, unknown>>[];

    return [...base, ...dynamic];
  }, [importantFields, previewHeaders, selectedRowNumbers]);

  function toggleImportantField(field: string) {
    setImportantFields((current) => {
      if (current.includes(field)) {
        if (current.length === 1) {
          return current;
        }
        return current.filter((entry) => entry !== field);
      }
      return [...current, field];
    });
  }

  function toggleImportProfile(profile: ImportProfileKey) {
    setSelectedImportProfiles((current) => {
      if (current.includes(profile)) {
        if (current.length === 1) {
          return current;
        }
        return current.filter((entry) => entry !== profile);
      }
      return [...current, profile];
    });
  }

  function startAddDataFlow() {
    setShowAddDataPopup(true);
    setAddDataStep("platform");
    setUploadedFile(null);
    setPreviewHeaders([]);
    setPreviewRows([]);
    setPreviewTotalRows(0);
    setSelectedRowNumbers([]);
    setAvailableImportProfiles(["people_roster"]);
    setSelectedImportProfiles(["people_roster"]);
    setImportantFields(PROFILE_DEFAULTS.people_roster.defaults);
  }

  function pickPlatform(platform: ImportPlatform) {
    setSelectedPlatform(platform);
  }

  function togglePreviewRow(rowNumber: number) {
    setSelectedRowNumbers((current) => {
      if (current.includes(rowNumber)) {
        if (current.length === 1) {
          return current;
        }
        return current.filter((entry) => entry !== rowNumber);
      }
      return [...current, rowNumber];
    });
  }

  function toggleAllPreviewRows() {
    if (previewRows.length === 0) {
      return;
    }
    const all = previewRows
      .map((row) => Number(row.__row_number))
      .filter((value) => Number.isInteger(value) && value > 0);
    const allSelected = all.every((value) => selectedRowNumbers.includes(value));
    setSelectedRowNumbers(allSelected ? [all[0] ?? 1] : all);
  }

  return (
    <div className="space-y-4 pb-3 sm:pb-4 md:pb-6">
      {redirectedFromTool ? (
        <Alert variant="info">{`The ${redirectedFromTool} module is disabled in AI-first mode. You were redirected to Workspace.`}</Alert>
      ) : null}
      {!canAccessImports ? <Alert variant="info">Smart Import history is unavailable for your current permission scope.</Alert> : null}
      {page === "import" ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-text">Add Data</p>
              <p className="text-sm text-text-muted">
                Upload CSV/XLSX continuously. Matching records are left unchanged, changed fields are updated, and new rows are inserted.
              </p>
            </div>
            <div className="flex gap-2">
              <Button href={`/${orgSlug}/manage/imports`} size="sm">
                <Plus className="h-4 w-4" />
                Add Data
              </Button>
              <Button onClick={() => setCanvasView("import_review")} size="sm" variant="secondary">
                Review Imports
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4">
        <Card className="min-h-[70vh]">
          <CardHeader className="space-y-3 border-b border-border/60 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>{page === "dashboard" ? "Dashboard" : page === "import" ? "Import" : "Data"}</CardTitle>
                <CardDescription>{`Dynamic workspace for ${orgName}.`}</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="neutral">{`View: ${canvasView}`}</Badge>
                {activeWorkspaceRunId ? <Badge variant="warning">{`Run ${activeWorkspaceRunId.slice(0, 8)}`}</Badge> : null}
                {selectedConflict ? <Badge variant="warning">Conflict Focus</Badge> : null}
              </div>
            </div>
            {page === "data" ? (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setCanvasView("data_table")} size="sm" variant={canvasView === "data_table" ? "primary" : "secondary"}>
                  Data Table
                </Button>
                <Button onClick={() => setCanvasView("visualization")} size="sm" variant={canvasView === "visualization" ? "primary" : "secondary"}>
                  Visualizations
                </Button>
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {page === "dashboard" ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Card>
                    <CardHeader className="pb-1"><CardDescription>Players</CardDescription></CardHeader>
                    <CardContent><p className="text-2xl font-semibold">{overview.kpis.players}</p></CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-1"><CardDescription>Active Teams</CardDescription></CardHeader>
                    <CardContent><p className="text-2xl font-semibold">{overview.kpis.activeTeams}</p></CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-1"><CardDescription>Upcoming Practices (7d)</CardDescription></CardHeader>
                    <CardContent><p className="text-2xl font-semibold">{overview.kpis.upcomingPractices7d}</p></CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-1"><CardDescription>Unresolved Conflicts</CardDescription></CardHeader>
                    <CardContent><p className="text-2xl font-semibold">{unresolvedConflictCount}</p></CardContent>
                  </Card>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Recent Activity</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {overview.recentActivity.length === 0 ? <p className="text-sm text-text-muted">No recent activity.</p> : null}
                      {overview.recentActivity.map((item) => (
                        <div className="rounded-md border border-border/60 p-2" key={item.id}>
                          <p className="text-sm font-medium text-text">{item.label}</p>
                          <p className="text-xs text-text-muted">{formatDateTime(item.at)}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Upcoming Schedule</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {overview.upcomingPractices.length === 0 ? <p className="text-sm text-text-muted">No practices scheduled for next 7 days.</p> : null}
                      {overview.upcomingPractices.map((item) => (
                        <div className="rounded-md border border-border/60 p-2" key={item.id}>
                          <p className="text-sm font-medium text-text">{item.title}</p>
                          <p className="text-xs text-text-muted">{`${formatDateTime(item.startsAt)} - ${formatDateTime(item.endsAt)}`}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : null}

            {page === "import" ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={unresolvedConflictCount > 0 ? "warning" : "success"}>{`Conflicts: ${unresolvedConflictCount}`}</Badge>
                    <Badge variant="neutral">{`Runs: ${runs.length}`}</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button href={`/${orgSlug}/manage/imports`} size="sm">
                      {isBusyImport ? "Starting..." : "Import File"}
                    </Button>
                    {activeWorkspaceRunId ? (
                      <Button disabled={isBusyImport} onClick={() => setShowCancelRunModal(true)} size="sm" variant="secondary">
                        Cancel Run
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="overflow-hidden rounded-md border border-border/60">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-surface-muted/60 text-xs uppercase tracking-wide text-text-muted">
                      <tr>
                        <th className="px-3 py-2">Record</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Stage</th>
                        <th className="px-3 py-2">Email</th>
                        <th className="px-3 py-2">AI Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conflictRowsForTable.length === 0 ? (
                        <tr>
                          <td className="px-3 py-4 text-text-muted" colSpan={5}>No unresolved conflicts.</td>
                        </tr>
                      ) : null}
                      {conflictRowsForTable.map((row) => (
                        <tr
                          className="cursor-pointer border-t border-border/40 bg-warning/5 hover:bg-warning/10"
                          key={row.id}
                          onClick={() => {
                            setSelectedConflict(row.source);
                          }}
                        >
                          <td className="px-3 py-2 font-medium">{row.label}</td>
                          <td className="px-3 py-2 text-text-muted">{row.conflictType}</td>
                          <td className="px-3 py-2 text-text-muted">{row.stage}</td>
                          <td className="px-3 py-2 text-text-muted">{row.email || "—"}</td>
                          <td className="px-3 py-2 text-text-muted">{row.confidence === null ? "—" : `${Math.round(row.confidence * 100)}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {page === "data" && canvasView === "data_table" ? (
              <div className="space-y-3">
                <p className="text-sm text-text-muted">Current table scope is Smart Import conflict records. Ask the Copilot to pivot to a roster dataset.</p>
                <div className="overflow-hidden rounded-md border border-border/60">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-surface-muted/60 text-xs uppercase tracking-wide text-text-muted">
                      <tr>
                        <th className="px-3 py-2">Conflict ID</th>
                        <th className="px-3 py-2">Conflict Type</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conflicts.slice(0, 25).map((conflict) => (
                        <tr className="border-t border-border/40" key={conflict.id}>
                          <td className="px-3 py-2 font-mono text-xs">{conflict.id}</td>
                          <td className="px-3 py-2">{conflict.conflictType}</td>
                          <td className="px-3 py-2">{conflict.resolutionState}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {page === "data" && canvasView === "visualization" ? (
              <div className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Attendance Trend (Proxy)</CardTitle>
                      <CardDescription>Import completion trend over recent runs.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {attendanceTrendData.map((point) => (
                        <div className="space-y-1" key={point.name}>
                          <div className="flex items-center justify-between text-xs text-text-muted">
                            <span>{`Run ${point.name}`}</span>
                            <span>{`${point.trend}%`}</span>
                          </div>
                          <div className="h-2 rounded bg-surface-muted">
                            <div
                              className="h-2 rounded bg-info"
                              style={{ width: `${Math.max(4, Math.round((point.trend / attendanceMax) * 100))}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Organization Mix</CardTitle>
                      <CardDescription>Players, teams, and upcoming practices.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {orgMixData.map((point) => (
                        <div className="space-y-1" key={point.name}>
                          <div className="flex items-center justify-between text-xs text-text-muted">
                            <span>{point.name}</span>
                            <span>{point.value}</span>
                          </div>
                          <div className="h-2 rounded bg-surface-muted">
                            <div
                              className="h-2 rounded bg-success"
                              style={{ width: `${Math.max(4, Math.round((point.value / orgMixMax) * 100))}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle>Import Conflict Rate by Run</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {importConflictRateData.map((point) => (
                      <div className="space-y-1" key={point.name}>
                        <div className="flex items-center justify-between text-xs text-text-muted">
                          <span>{point.name}</span>
                          <span>{`${point.rate}%`}</span>
                        </div>
                        <div className="h-2 rounded bg-surface-muted">
                          <div
                            className="h-2 rounded bg-warning"
                            style={{ width: `${Math.max(4, Math.round((point.rate / conflictMax) * 100))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Panel
        contentClassName="space-y-4"
        onClose={() => setSelectedConflict(null)}
        open={Boolean(selectedConflict)}
        pushMode="app"
        subtitle="Resolve the conflict with AI suggestions or manual decision."
        title="Conflict Resolution"
      >
        {selectedConflict ? (
          <div className="space-y-3">
            <Alert variant="warning">{selectedConflict.conflictType}</Alert>
            <div className="rounded-md border border-border/60 p-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">Imported Payload</p>
              <pre className="max-h-44 overflow-y-auto whitespace-pre-wrap text-xs text-text">{JSON.stringify(selectedConflict.importedPayload, null, 2)}</pre>
            </div>
            <div className="rounded-md border border-border/60 p-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">Candidates</p>
              {selectedConflict.candidateRecords.length === 0 ? <p className="text-sm text-text-muted">No deterministic candidates available.</p> : null}
              {selectedConflict.candidateRecords.slice(0, 8).map((candidate) => (
                <div className="mt-2 rounded-md border border-border/40 p-2" key={candidate.id}>
                  <p className="text-sm font-medium text-text">{candidate.id}</p>
                  <p className="text-xs text-text-muted">{`${Math.round(candidate.score * 100)}% • ${candidate.reason}`}</p>
                </div>
              ))}
            </div>
            {selectedConflict.aiSuggestion ? (
              <div className="rounded-md border border-border/60 p-3">
                <p className="text-xs uppercase tracking-wide text-text-muted">AI Suggestion</p>
                <p className="text-sm text-text">{`${selectedConflict.aiSuggestion.action.toUpperCase()} • ${Math.round(selectedConflict.aiSuggestion.confidence * 100)}% confidence`}</p>
                <p className="text-xs text-text-muted">{selectedConflict.aiSuggestion.rationale}</p>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {selectedConflict.aiSuggestion ? (
                <Button
                  disabled={isResolvingConflict}
                  onClick={() =>
                    void resolveConflict(
                      selectedConflict,
                      selectedConflict.aiSuggestion?.action ?? "skip",
                      selectedConflict.aiSuggestion?.targetId ?? undefined
                    )
                  }
                  size="sm"
                >
                  {isResolvingConflict ? "Resolving..." : "Accept AI Suggestion"}
                </Button>
              ) : null}
              <Button disabled={isResolvingConflict} onClick={() => void resolveConflict(selectedConflict, "skip")} size="sm" variant="secondary">
                Skip
              </Button>
              {selectedConflict.candidateRecords[0]?.id ? (
                <Button
                  disabled={isResolvingConflict}
                  onClick={() => void resolveConflict(selectedConflict, "update", selectedConflict.candidateRecords[0]?.id)}
                  size="sm"
                  variant="secondary"
                >
                  Match First Candidate
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Panel>

      <Popup
        onClose={() => setShowCancelRunModal(false)}
        open={showCancelRunModal}
        subtitle="This stops automated processing for the current import run."
        title="Cancel Import Run"
      >
        <div className="space-y-4">
          <Alert variant="warning">Canceling may leave unresolved conflicts pending review.</Alert>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setShowCancelRunModal(false)} variant="secondary">Keep Running</Button>
            <Button disabled={isBusyImport} onClick={() => void confirmCancelRun()}>
              {isBusyImport ? "Cancelling..." : "Cancel Run"}
            </Button>
          </div>
        </div>
      </Popup>
    </div>
  );
}
