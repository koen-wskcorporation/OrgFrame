"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Boxes, FileSpreadsheet, Layers3, RefreshCw, Trophy } from "lucide-react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Chip } from "@orgframe/ui/primitives/chip";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { Checkbox } from "@orgframe/ui/primitives/checkbox";
import { DataTable, type DataTableColumn } from "@orgframe/ui/primitives/data-table";
import { SelectionBox } from "@orgframe/ui/primitives/selection-box";
import { useToast } from "@orgframe/ui/primitives/toast";
import { useFileManager } from "@/src/features/files/manager";
import {
  applyImportBatchAction,
  cancelImportRunAction,
  getImportRunStatusAction,
  listImportPlatformsAction,
  listImportConflictsAction,
  listImportRunsAction,
  previewSportsEngineDatasetAction,
  previewImportFileAction,
  processImportBatchAction,
  resolveConflictBatchAction,
  resolveConflictManuallyAction,
  startImportRunAction,
  undoImportRunAction
} from "@/src/features/imports/actions";
import {
  importProfiles,
  type ConflictRecord,
  type ImportPlatformCatalogItem,
  type ImportPlatformKey,
  type ImportProfileKey,
  type ImportRunListItem
} from "@/src/features/imports/contracts";

type SmartImportWorkspaceProps = {
  orgSlug: string;
  initialRuns: ImportRunListItem[];
};

type FlowStage = "select_file" | "processing" | "conflicts" | "done";
type AddDataStep = "platform" | "upload" | "select";
type RowSelectionMode = "all" | "subset";

const PROCESS_BATCH_DEFAULT = 25;
const APPLY_BATCH_DEFAULT = 25;
const CONFLICT_BATCH_DEFAULT = 25;
const MIN_BATCH_SIZE = 5;
const PREVIEW_PAGE_SIZE = 100;

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
    defaults: ["display_name", "user_email", "jersey_number", "team_name"]
  },
  program_structure: {
    label: "Program Structure",
    description: "Programs, divisions, and team hierarchy data.",
    fields: ["program_name", "division_name", "team_name", "age_group", "season_label", "status"],
    defaults: ["program_name", "division_name", "team_name", "status"]
  },
  commerce_orders: {
    label: "Commerce Orders",
    description: "Payments, invoices, and order records.",
    fields: ["order_number", "customer_email", "status", "total_amount", "line_items", "paid_at"],
    defaults: ["order_number", "customer_email", "status", "total_amount"]
  }
};

const PROFILE_FIELD_ALIASES: Record<ImportProfileKey, Record<string, string[]>> = {
  people_roster: {
    display_name: ["display_name", "name", "full_name", "player_name", "athlete_name"],
    user_email: ["user_email", "email", "parent_email", "guardian_email"],
    jersey_number: ["jersey_number", "jersey", "number"],
    phone: ["phone", "phone_number", "mobile", "cell"],
    birth_date: ["birth_date", "dob", "date_of_birth", "birthday"],
    team_name: ["team_name", "team"]
  },
  program_structure: {
    program_name: ["program_name", "program"],
    division_name: ["division_name", "division"],
    team_name: ["team_name", "team"],
    age_group: ["age_group", "age", "age_bracket"],
    season_label: ["season_label", "season"],
    status: ["status", "state"]
  },
  commerce_orders: {
    order_number: ["order_number", "order_id", "invoice_number"],
    customer_email: ["customer_email", "email", "buyer_email", "parent_email"],
    status: ["status", "state", "payment_status"],
    total_amount: ["total_amount", "amount", "total", "order_total"],
    line_items: ["line_items", "items", "order_items"],
    paid_at: ["paid_at", "payment_date", "paid_date"]
  }
};

function isTerminal(status: ImportRunListItem["status"]) {
  return status === "completed" || status === "failed" || status === "cancelled" || status === "undone";
}

function isWorkerLimitError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("WORKER_LIMIT");
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function deriveStage(run: ImportRunListItem | null): FlowStage {
  if (!run) {
    return "select_file";
  }

  if (run.status === "awaiting_conflicts" || run.status === "resolving_conflicts") {
    return "conflicts";
  }

  if (isTerminal(run.status)) {
    return "done";
  }

  return "processing";
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function canUndoRun(run: ImportRunListItem | null) {
  return Boolean(run && ["completed", "cancelled"].includes(run.status));
}

function humanizeReason(reason: string | null) {
  if (!reason) {
    return "Unknown blocking reason.";
  }

  const map: Record<string, string> = {
    missing_user_email: "Missing or invalid parent email.",
    account_creation_failed: "Could not create the parent account in Auth.",
    profile_upsert_failed: "Could not write the parent profile.",
    membership_lookup_failed: "Could not verify org membership for this account.",
    membership_insert_failed: "Could not add this account to org membership.",
    missing_account_dependency: "Account stage did not complete, so player could not be created."
  };

  return map[reason] ?? reason.replaceAll("_", " ");
}

function extractConflictDetail(conflict: ConflictRecord) {
  const payload = conflict.importedPayload ?? {};
  const normalized = (payload.normalized as Record<string, unknown> | undefined) ?? {};
  const details = (payload.details as Record<string, unknown> | undefined) ?? {};
  const failedStage = typeof payload.failed_stage === "string" ? payload.failed_stage : null;
  const blockingReason = typeof payload.blocking_reason === "string" ? payload.blocking_reason : null;
  const parentEmail =
    typeof normalized.user_email === "string"
      ? normalized.user_email
      : typeof normalized.email === "string"
        ? normalized.email
        : null;
  const detailMessage = typeof details.message === "string" ? details.message : null;

  return { failedStage, blockingReason, parentEmail, detailMessage };
}

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

export function SmartImportWorkspace({ orgSlug, initialRuns }: SmartImportWorkspaceProps) {
  const { toast } = useToast();
  const { openFileManager } = useFileManager();
  const [isBusy, setIsBusy] = useState(false);
  const drivingRef = useRef(false);

  const [addDataStep, setAddDataStep] = useState<AddDataStep>("platform");
  const [platformCatalog, setPlatformCatalog] = useState<ImportPlatformCatalogItem[]>([]);
  const [sportsEngineConnected, setSportsEngineConnected] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<ImportPlatformKey>("spreadsheet");
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
  const [previewTotalRows, setPreviewTotalRows] = useState(0);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewTotalPages, setPreviewTotalPages] = useState(1);
  const [availableImportProfiles, setAvailableImportProfiles] = useState<ImportProfileKey[]>(["people_roster"]);
  const [selectedImportProfiles, setSelectedImportProfiles] = useState<ImportProfileKey[]>(["people_roster"]);
  const [sportsEngineRowsByProfile, setSportsEngineRowsByProfile] = useState<Record<ImportProfileKey, Array<Record<string, unknown>>>>({
    people_roster: [],
    program_structure: [],
    commerce_orders: []
  });
  const [importantFields, setImportantFields] = useState<string[]>(PROFILE_DEFAULTS.people_roster.defaults);
  const [rowSelectionMode, setRowSelectionMode] = useState<RowSelectionMode>("all");
  const [selectedRowNumbers, setSelectedRowNumbers] = useState<number[]>([]);
  const [excludedRowNumbers, setExcludedRowNumbers] = useState<number[]>([]);

  const [activeRun, setActiveRun] = useState<ImportRunListItem | null>(null);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [selectedConflictId, setSelectedConflictId] = useState<string | null>(null);
  const [history, setHistory] = useState<ImportRunListItem[]>(initialRuns);

  useEffect(() => {
    void (async () => {
      try {
        const result = await listImportPlatformsAction({ orgSlug });
        setPlatformCatalog(result.platforms);
        setSportsEngineConnected(result.sportsEngineConnected);
        setSelectedPlatform((current) => {
          if (result.platforms.some((platform) => platform.key === current)) {
            return current;
          }
          return result.platforms[0]?.key ?? "spreadsheet";
        });
      } catch {
        // no-op: legacy fallback still allows file upload path
      }
    })();
  }, [orgSlug]);

  useEffect(() => {
    setActiveRun(initialRuns.find((run) => !isTerminal(run.status)) ?? null);
    setHistory(initialRuns);
  }, [initialRuns]);

  async function refreshHistory() {
    const result = await listImportRunsAction({ orgSlug, limit: 50 });
    setHistory(result.runs);
    return result.runs;
  }

  async function refreshRun(runId: string) {
    const run = await getImportRunStatusAction({ orgSlug, runId });
    setActiveRun(run);
    return run;
  }

  async function loadConflicts(runId: string) {
    const result = await listImportConflictsAction({
      orgSlug,
      runId,
      state: "needs_review",
      limit: 500
    });
    setConflicts(result.conflicts);
    return result.conflicts;
  }

  async function driveRun(runId: string) {
    if (drivingRef.current) {
      return;
    }

    drivingRef.current = true;

    try {
      let processBatchSize = PROCESS_BATCH_DEFAULT;
      let applyBatchSize = APPLY_BATCH_DEFAULT;
      let conflictBatchSize = CONFLICT_BATCH_DEFAULT;

      for (let i = 0; i < 48; i += 1) {
        const run = await refreshRun(runId);

        if (isTerminal(run.status)) {
          setConflicts([]);
          await refreshHistory();
          return;
        }

        if (run.status === "awaiting_conflicts" || run.status === "resolving_conflicts") {
          try {
            await resolveConflictBatchAction({ orgSlug, runId, batchSize: conflictBatchSize });
          } catch (error) {
            if (!isWorkerLimitError(error) || conflictBatchSize <= MIN_BATCH_SIZE) {
              throw error;
            }

            conflictBatchSize = Math.max(MIN_BATCH_SIZE, Math.floor(conflictBatchSize / 2));
            toast({ title: `Conflict batch reduced to ${conflictBatchSize} due to compute limits.`, variant: "warning" });
            await sleep(300);
            continue;
          }
          const latest = await refreshRun(runId);

          if (latest.status === "awaiting_conflicts" || latest.status === "resolving_conflicts") {
            const pending = await loadConflicts(runId);
            if (pending.length > 0) {
              await refreshHistory();
              return;
            }
          }

          continue;
        }

        if (run.status === "queued" || run.status === "processing") {
          try {
            await processImportBatchAction({ orgSlug, runId, batchSize: processBatchSize });
          } catch (error) {
            if (!isWorkerLimitError(error) || processBatchSize <= MIN_BATCH_SIZE) {
              throw error;
            }

            processBatchSize = Math.max(MIN_BATCH_SIZE, Math.floor(processBatchSize / 2));
            toast({ title: `Process batch reduced to ${processBatchSize} due to compute limits.`, variant: "warning" });
            await sleep(300);
            continue;
          }
          continue;
        }

        if (run.status === "ready_to_apply" || run.status === "applying") {
          try {
            await applyImportBatchAction({ orgSlug, runId, batchSize: applyBatchSize });
          } catch (error) {
            if (!isWorkerLimitError(error) || applyBatchSize <= MIN_BATCH_SIZE) {
              throw error;
            }

            applyBatchSize = Math.max(MIN_BATCH_SIZE, Math.floor(applyBatchSize / 2));
            toast({ title: `Apply batch reduced to ${applyBatchSize} due to compute limits.`, variant: "warning" });
            await sleep(300);
            continue;
          }
          continue;
        }

        await refreshHistory();
        return;
      }
      await refreshHistory();
    } finally {
      drivingRef.current = false;
    }
  }

  useEffect(() => {
    if (!activeRun || isTerminal(activeRun.status)) {
      return;
    }

    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const run = await refreshRun(activeRun.id);
          if (run.status === "awaiting_conflicts" || run.status === "resolving_conflicts") {
            await loadConflicts(run.id);
            return;
          }

          if (!isTerminal(run.status)) {
            await driveRun(run.id);
          }
        } catch {
          // noop
        }
      })();
    }, 3000);

    return () => window.clearInterval(timer);
  }, [activeRun, orgSlug]);

  async function loadPreviewPage(page: number) {
    if (!uploadedFile) {
      return;
    }

    const preview = await previewImportFileAction({
      orgSlug,
      filePath: uploadedFile.path,
      fileName: uploadedFile.name,
      bucket: uploadedFile.bucket,
      mimeType: uploadedFile.mime,
      profileKey: "people_roster",
      page,
      pageSize: PREVIEW_PAGE_SIZE
    });

    setPreviewHeaders(preview.headers);
    setPreviewRows(preview.rows);
    setPreviewTotalRows(preview.totalRows);
    setPreviewPage(preview.page);
    setPreviewTotalPages(preview.totalPages);

    if (preview.headers.length > 0) {
      setImportantFields((current) => {
        const next = current.filter((field) => preview.headers.includes(field));
        return next.length > 0 ? next : preview.headers.slice(0, Math.min(4, preview.headers.length));
      });
    }
  }

  function connectSportsEngine() {
    const width = 520;
    const height = 720;
    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
    const popup = window.open(
      `/api/integrations/sportsengine/oauth/start?orgSlug=${encodeURIComponent(orgSlug)}`,
      "orgframe-sportsengine-oauth",
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );
    if (!popup) {
      toast({ title: "Enable popups to connect SportsEngine.", variant: "warning" });
      return;
    }

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      const payload = (event.data ?? {}) as { type?: string; error?: string };
      if (payload.type === "orgframe:sportsengine-oauth-connected") {
        setSportsEngineConnected(true);
        toast({ title: "SportsEngine connected." });
      } else if (payload.type === "orgframe:sportsengine-oauth-error") {
        toast({ title: payload.error ?? "SportsEngine connection failed.", variant: "destructive" });
      } else {
        return;
      }
      window.removeEventListener("message", onMessage);
    };

    window.addEventListener("message", onMessage);
  }

  function previewSportsEngine() {
    void (async () => {
      setIsBusy(true);
      try {
        const peoplePreview = await previewSportsEngineDatasetAction({
          orgSlug,
          profileKey: "people_roster",
          page: 1,
          pageSize: PREVIEW_PAGE_SIZE
        });
        const programPreview = await previewSportsEngineDatasetAction({
          orgSlug,
          profileKey: "program_structure",
          page: 1,
          pageSize: PREVIEW_PAGE_SIZE
        });
        const preview = peoplePreview.totalRows > 0 ? peoplePreview : programPreview;

        setUploadedFile({
          id: crypto.randomUUID(),
          path: "sportsengine:api",
          name: "sportsengine_api",
          mime: "application/json",
          size: preview.totalRows,
          bucket: "sportsengine"
        });
        setPreviewHeaders(preview.headers);
        setPreviewRows(preview.rows);
        setPreviewTotalRows(preview.totalRows);
        setPreviewPage(preview.page);
        setPreviewTotalPages(preview.totalPages);
        const merged = Array.from(new Set<ImportProfileKey>(["people_roster", "program_structure"]));
        setAvailableImportProfiles(merged);
        setSportsEngineRowsByProfile({
          people_roster: peoplePreview.rows.map((row) =>
            Object.fromEntries(Object.entries(row).filter(([key]) => key !== "__row_number"))
          ),
          program_structure: programPreview.rows.map((row) =>
            Object.fromEntries(Object.entries(row).filter(([key]) => key !== "__row_number"))
          ),
          commerce_orders: []
        });
        setSelectedImportProfiles((current) => {
          const next = current.filter((profile) => merged.includes(profile));
          return next.length > 0 ? next : ["people_roster"];
        });
        setAddDataStep("select");
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Unable to preview SportsEngine data.",
          variant: "destructive"
        });
      } finally {
        setIsBusy(false);
      }
    })();
  }

  function pickFileAndBuildPreview() {
    void (async () => {
      setIsBusy(true);
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
            key: "imports"
          }
        });

        const file = selected?.[0] ?? null;
        if (!file) {
          return;
        }

        const nextFile = {
          id: file.id,
          path: file.path,
          name: file.name,
          mime: file.mime,
          size: file.size,
          bucket: file.bucket
        };

        setUploadedFile(nextFile);
        setRowSelectionMode("all");
        setSelectedRowNumbers([]);
        setExcludedRowNumbers([]);

        const preview = await previewImportFileAction({
          orgSlug,
          filePath: nextFile.path,
          fileName: nextFile.name,
          bucket: nextFile.bucket,
          mimeType: nextFile.mime,
          profileKey: "people_roster",
          page: 1,
          pageSize: PREVIEW_PAGE_SIZE
        });

        const detectedProfiles = detectAvailableProfiles(preview.headers);
        const headers = preview.headers.length > 0 ? preview.headers : PROFILE_DEFAULTS[detectedProfiles[0] ?? "people_roster"].fields;

        setAvailableImportProfiles((current) => {
          const merged = new Set<ImportProfileKey>([...detectedProfiles, ...current]);
          return Array.from(merged);
        });
        setSelectedImportProfiles((current) => {
          const validCurrent = current.filter((profile) => detectedProfiles.includes(profile));
          return validCurrent.length > 0 ? validCurrent : [detectedProfiles[0] ?? "people_roster"];
        });
        setPreviewHeaders(headers);
        setPreviewRows(preview.rows);
        setPreviewTotalRows(preview.totalRows);
        setPreviewPage(preview.page);
        setPreviewTotalPages(preview.totalPages);
        setImportantFields((current) => {
          const next = current.filter((field) => headers.includes(field));
          return next.length > 0 ? next : headers.slice(0, Math.min(4, headers.length));
        });
        setAddDataStep("select");
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Unable to preview import file.",
          variant: "destructive"
        });
      } finally {
        setIsBusy(false);
      }
    })();
  }

  function startImportFromSelection() {
    if (!uploadedFile || selectedImportProfiles.length === 0) {
      toast({ title: "Upload a file and select at least one data type.", variant: "warning" });
      return;
    }

    void (async () => {
      setIsBusy(true);
      try {
        const createdRunIds: string[] = [];
        const importSessionId = crypto.randomUUID();
        for (const profileKey of selectedImportProfiles) {
          const sportsEngineInlineRows = selectedPlatform === "sportsengine" ? sportsEngineRowsByProfile[profileKey] ?? [] : [];
          const response = await startImportRunAction({
            orgSlug,
            fileId: selectedPlatform === "sportsengine" ? undefined : uploadedFile.id,
            filePath: selectedPlatform === "sportsengine" ? undefined : uploadedFile.path,
            fileName: selectedPlatform === "sportsengine" ? undefined : uploadedFile.name,
            mimeType: selectedPlatform === "sportsengine" ? undefined : uploadedFile.mime,
            sizeBytes: selectedPlatform === "sportsengine" ? undefined : uploadedFile.size,
            bucket: selectedPlatform === "sportsengine" ? "sportsengine" : uploadedFile.bucket,
            sourcePlatformKey: selectedPlatform,
            importSessionId,
            profileKey,
            importantFields,
            rowSelectionMode,
            selectedRowNumbers: rowSelectionMode === "subset" ? selectedRowNumbers : [],
            excludedRowNumbers: rowSelectionMode === "all" ? excludedRowNumbers : [],
            inlineRows: sportsEngineInlineRows
          });

          const runId = typeof response.run_id === "string" ? response.run_id : null;
          if (!runId) {
            throw new Error(`Import run was not created for ${PROFILE_DEFAULTS[profileKey].label}.`);
          }
          createdRunIds.push(runId);
        }

        const runId = createdRunIds[0] ?? null;
        if (!runId) {
          throw new Error("Import run was not created.");
        }

        const run = await refreshRun(runId);
        setConflicts([]);
        setSelectedConflictId(null);
        toast({ title: createdRunIds.length === 1 ? "Sync started." : `${createdRunIds.length} sync runs started.` });
        await refreshHistory();
        await driveRun(run.id);
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to start sync run.",
          variant: "destructive"
        });
      } finally {
        setIsBusy(false);
      }
    })();
  }

  function resolveConflict(conflictId: string, action: "insert" | "update" | "skip", targetId?: string) {
    if (!activeRun) {
      return;
    }

    void (async () => {
      setIsBusy(true);
      try {
        await resolveConflictManuallyAction({
          orgSlug,
          runId: activeRun.id,
          conflictId,
          action,
          targetId
        });

        const pending = await loadConflicts(activeRun.id);
        if (pending.length === 0) {
          await driveRun(activeRun.id);
        } else {
          await refreshRun(activeRun.id);
          await refreshHistory();
        }
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to resolve conflict.",
          variant: "destructive"
        });
      } finally {
        setIsBusy(false);
      }
    })();
  }

  function cancelRun() {
    if (!activeRun) {
      return;
    }

    void (async () => {
      setIsBusy(true);
      try {
        await cancelImportRunAction({ orgSlug, runId: activeRun.id });
        await refreshRun(activeRun.id);
        await refreshHistory();
        toast({ title: "Import cancelled." });
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to cancel import run.",
          variant: "destructive"
        });
      } finally {
        setIsBusy(false);
      }
    })();
  }

  function undoRun() {
    if (!activeRun) {
      return;
    }

    void (async () => {
      setIsBusy(true);
      try {
        await undoImportRunAction({ orgSlug, runId: activeRun.id });
        await refreshRun(activeRun.id);
        await refreshHistory();
        toast({ title: "Import changes undone." });
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to undo import run.",
          variant: "destructive"
        });
      } finally {
        setIsBusy(false);
      }
    })();
  }

  function undoRunById(runId: string) {
    void (async () => {
      setIsBusy(true);
      try {
        await undoImportRunAction({ orgSlug, runId });
        await refreshHistory();
        if (activeRun?.id === runId) {
          await refreshRun(runId);
        }
        toast({ title: "Import changes undone." });
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to undo import run.",
          variant: "destructive"
        });
      } finally {
        setIsBusy(false);
      }
    })();
  }

  function openRun(run: ImportRunListItem) {
    void (async () => {
      setIsBusy(true);
      try {
        setActiveRun(run);
        if (run.status === "awaiting_conflicts" || run.status === "resolving_conflicts") {
          const pending = await loadConflicts(run.id);
          setSelectedConflictId(pending[0]?.id ?? null);
        } else {
          setConflicts([]);
          setSelectedConflictId(null);
        }
      } finally {
        setIsBusy(false);
      }
    })();
  }

  function resetSetupFlow() {
    setAddDataStep("platform");
    setSelectedPlatform(platformCatalog[0]?.key ?? "spreadsheet");
    setUploadedFile(null);
    setPreviewHeaders([]);
    setPreviewRows([]);
    setPreviewTotalRows(0);
    setPreviewPage(1);
    setPreviewTotalPages(1);
    setAvailableImportProfiles(["people_roster"]);
    setSelectedImportProfiles(["people_roster"]);
    setImportantFields(PROFILE_DEFAULTS.people_roster.defaults);
    setRowSelectionMode("all");
    setSelectedRowNumbers([]);
    setExcludedRowNumbers([]);
    setSportsEngineRowsByProfile({
      people_roster: [],
      program_structure: [],
      commerce_orders: []
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

  function addManualProfile(profile: ImportProfileKey) {
    setAvailableImportProfiles((current) => (current.includes(profile) ? current : [...current, profile]));
    setSelectedImportProfiles((current) => (current.includes(profile) ? current : [...current, profile]));
  }

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

  function isRowSelected(rowNumber: number) {
    if (rowSelectionMode === "all") {
      return !excludedRowNumbers.includes(rowNumber);
    }
    return selectedRowNumbers.includes(rowNumber);
  }

  function togglePreviewRow(rowNumber: number) {
    if (rowSelectionMode === "all") {
      setExcludedRowNumbers((current) =>
        current.includes(rowNumber) ? current.filter((entry) => entry !== rowNumber) : [...current, rowNumber]
      );
      return;
    }

    setSelectedRowNumbers((current) =>
      current.includes(rowNumber) ? current.filter((entry) => entry !== rowNumber) : [...current, rowNumber]
    );
  }

  function toggleAllPreviewRows() {
    if (previewRows.length === 0) {
      return;
    }

    const visible = previewRows
      .map((row) => Number(row.__row_number))
      .filter((value) => Number.isInteger(value) && value > 0);

    if (rowSelectionMode === "all") {
      const allVisibleSelected = visible.every((rowNumber) => !excludedRowNumbers.includes(rowNumber));
      if (allVisibleSelected) {
        setExcludedRowNumbers((current) => Array.from(new Set([...current, ...visible])));
      } else {
        setExcludedRowNumbers((current) => current.filter((entry) => !visible.includes(entry)));
      }
      return;
    }

    const allVisibleSelected = visible.every((rowNumber) => selectedRowNumbers.includes(rowNumber));
    if (allVisibleSelected) {
      setSelectedRowNumbers((current) => current.filter((entry) => !visible.includes(entry)));
    } else {
      setSelectedRowNumbers((current) => Array.from(new Set([...current, ...visible])));
    }
  }

  const stage = deriveStage(activeRun);
  const progressPercent = Math.max(0, Math.min(100, Math.round(activeRun?.progress ?? 0)));
  const selectedConflict = conflicts.find((conflict) => conflict.id === selectedConflictId) ?? conflicts[0] ?? null;

  const selectedRowCount =
    rowSelectionMode === "all" ? Math.max(0, previewTotalRows - excludedRowNumbers.length) : selectedRowNumbers.length;

  const previewTableColumns = useMemo<DataTableColumn<Record<string, unknown>>[]>(() => {
    const base: DataTableColumn<Record<string, unknown>>[] = [
      {
        key: "__select__",
        label: "Use",
        defaultVisible: true,
        sortable: false,
        renderCell: (row) => {
          const rowNumber = Number(row.__row_number);
          return <Checkbox checked={isRowSelected(rowNumber)} onCheckedChange={() => togglePreviewRow(rowNumber)} />;
        }
      },
      {
        key: "__row_number",
        label: "Row",
        defaultVisible: true,
        sortable: true,
        renderCell: (row) => String(row.__row_number ?? ""),
        renderSortValue: (row) => Number(row.__row_number ?? 0)
      }
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
      renderSortValue: (row: Record<string, unknown>) => String(row[header] ?? "")
    })) satisfies DataTableColumn<Record<string, unknown>>[];

    return [...base, ...dynamic];
  }, [importantFields, previewHeaders, rowSelectionMode, selectedRowNumbers, excludedRowNumbers]);

  const groupedRuns = useMemo(() => {
    const groups = new Map<string, { key: string; sessionId: string | null; runs: ImportRunListItem[] }>();
    for (const run of history) {
      const key = run.importSessionId ?? run.id;
      const current = groups.get(key);
      if (current) {
        current.runs.push(run);
      } else {
        groups.set(key, {
          key,
          sessionId: run.importSessionId,
          runs: [run]
        });
      }
    }

    return Array.from(groups.values()).map((group) => ({
      ...group,
      runs: group.runs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    }));
  }, [history]);

  return (
    <div className="space-y-4 pb-3 sm:pb-4 md:pb-6">
      {activeRun ? (
        <div className="sticky top-2 z-20 rounded-control border bg-surface/95 px-3 py-2 shadow-sm backdrop-blur sm:hidden">
          <p className="text-xs font-semibold text-text">Active import</p>
          <p className="text-xs text-text-muted">
            {activeRun.status} • {progressPercent}%
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
        <div className="space-y-4">
          <Card id="import-setup">
            <CardHeader>
              <CardTitle>Import Setup</CardTitle>
              <CardDescription>Sync hub for recurring CSV/XLSX updates into OrgFrame.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert variant="info">
                OrgFrame compares incoming rows to existing records. Unchanged rows are skipped, changed rows are updated, and new rows are inserted.
              </Alert>

              <div className="flex items-center gap-2 text-xs text-text-muted">
                <Chip status={false} variant={addDataStep === "platform" ? "warning" : "neutral"}>1. Platform</Chip>
                <Chip status={false} variant={addDataStep === "upload" ? "warning" : "neutral"}>2. Upload</Chip>
                <Chip status={false} variant={addDataStep === "select" ? "warning" : "neutral"}>3. Select</Chip>
              </div>

              {addDataStep === "platform" ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-text">Select import platform</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(platformCatalog.length > 0 ? platformCatalog : []).map((platform) => (
                      <SelectionBox
                        description={
                          <span className="space-y-2">
                            <span>{platform.description}</span>
                            <span className="flex flex-wrap gap-1">
                              {platform.supportsApiPull ? <Chip status={false} variant="neutral">API</Chip> : null}
                              {platform.supportsFileUpload ? <Chip status={false} variant="neutral">File Upload</Chip> : null}
                              {platform.requiresOauth ? <Chip status={false} variant="warning">OAuth Required</Chip> : null}
                            </span>
                          </span>
                        }
                        key={platform.key}
                        label={
                          <span className="inline-flex items-center gap-2">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/60 bg-surface-muted text-text-muted">
                              {platform.logoAssetPath ? (
                                <img alt={`${platform.label} logo`} className="h-4 w-4 object-contain" src={platform.logoAssetPath} />
                              ) : platform.key === "spreadsheet" ? (
                                <FileSpreadsheet className="h-4 w-4" />
                              ) : platform.key === "sportsconnect" ? (
                                <Trophy className="h-4 w-4" />
                              ) : platform.key === "stack_sports" ? (
                                <Layers3 className="h-4 w-4" />
                              ) : (
                                <Boxes className="h-4 w-4" />
                              )}
                            </span>
                            <span>{platform.label}</span>
                          </span>
                        }
                        onClick={() => setSelectedPlatform(platform.key)}
                        selected={selectedPlatform === platform.key}
                      />
                    ))}
                  </div>
                  {platformCatalog.length === 0 ? <p className="text-xs text-text-muted">No active import platforms found.</p> : null}
                  <div className="flex justify-end gap-2">
                    <Button onClick={resetSetupFlow} type="button" variant="secondary">
                      Reset
                    </Button>
                    <Button
                      onClick={() => {
                        if (selectedPlatform === "sportsengine") {
                          setAddDataStep("upload");
                          return;
                        }
                        setAddDataStep("upload");
                      }}
                      type="button"
                    >
                      Continue
                    </Button>
                  </div>
                </div>
              ) : null}

              {addDataStep === "upload" ? (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-text">{selectedPlatform === "sportsengine" ? "Connect and pull SportsEngine data" : "Upload your file"}</p>
                  {uploadedFile ? (
                    <div className="rounded-md border border-border/60 p-2 text-sm">
                      <p className="font-medium text-text">{uploadedFile.name}</p>
                      <p className="text-xs text-text-muted">{uploadedFile.path}</p>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-2">
                    <Button onClick={() => setAddDataStep("platform")} type="button" variant="secondary">
                      Back
                    </Button>
                    {selectedPlatform === "sportsengine" ? (
                      <div className="flex gap-2">
                        <Button onClick={connectSportsEngine} type="button" variant="secondary">
                          {sportsEngineConnected ? "Reconnect SportsEngine" : "Connect SportsEngine"}
                        </Button>
                        <Button disabled={isBusy || !sportsEngineConnected} onClick={previewSportsEngine} type="button">
                          {isBusy ? "Pulling..." : "Pull and Preview"}
                        </Button>
                      </div>
                    ) : (
                      <Button disabled={isBusy} onClick={pickFileAndBuildPreview} type="button">
                        {isBusy ? "Uploading..." : "Upload and Preview"}
                      </Button>
                    )}
                  </div>
                </div>
              ) : null}

              {addDataStep === "select" ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-text">Select data types, columns, and rows</p>
                    <p className="text-xs text-text-muted">
                      Preview page {previewPage} of {previewTotalPages} • {previewTotalRows} total rows
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-text">Detected data types</p>
                      <p className="text-xs text-text-muted">Select one or more</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {availableImportProfiles.map((profile) => (
                        <SelectionBox
                          description={PROFILE_DEFAULTS[profile].description}
                          key={profile}
                          label={PROFILE_DEFAULTS[profile].label}
                          onClick={() => toggleImportProfile(profile)}
                          selected={selectedImportProfiles.includes(profile)}
                        />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {importProfiles
                        .filter((profile) => !availableImportProfiles.includes(profile))
                        .map((profile) => (
                          <Button key={profile} onClick={() => addManualProfile(profile)} size="sm" type="button" variant="secondary">
                            Add {PROFILE_DEFAULTS[profile].label}
                          </Button>
                        ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border bg-surface px-3 py-2">
                    <div>
                      <p className="text-sm font-semibold text-text">Row selection mode</p>
                      <p className="text-xs text-text-muted">Default is all rows selected with optional exclusions.</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => {
                          setRowSelectionMode("all");
                          setSelectedRowNumbers([]);
                        }}
                        size="sm"
                        type="button"
                        variant={rowSelectionMode === "all" ? "primary" : "secondary"}
                      >
                        All rows (default)
                      </Button>
                      <Button
                        onClick={() => {
                          setRowSelectionMode("subset");
                          setExcludedRowNumbers([]);
                        }}
                        size="sm"
                        type="button"
                        variant={rowSelectionMode === "subset" ? "primary" : "secondary"}
                      >
                        Explicit subset
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-text">Rows to import</p>
                      <Button onClick={toggleAllPreviewRows} size="sm" type="button" variant="secondary">
                        Toggle current page
                      </Button>
                    </div>
                    <div className="rounded-md border border-border/60 p-2">
                      <DataTable
                        ariaLabel="Import preview spreadsheet"
                        columns={previewTableColumns}
                        data={previewRows}
                        emptyState="No preview rows."
                        rowKey={(row) => String(row.__row_number ?? "")}
                        searchPlaceholder="Search this page"
                        storageKey={`imports-preview:${orgSlug}`}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Button
                        disabled={isBusy || previewPage <= 1}
                        onClick={() => void loadPreviewPage(previewPage - 1)}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        Previous page
                      </Button>
                      <span className="text-xs text-text-muted">Page {previewPage} / {previewTotalPages}</span>
                      <Button
                        disabled={isBusy || previewPage >= previewTotalPages}
                        onClick={() => void loadPreviewPage(previewPage + 1)}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        Next page
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button onClick={() => setAddDataStep("upload")} type="button" variant="secondary">
                      Back
                    </Button>
                    <Button
                      className="ml-auto"
                      disabled={
                        isBusy ||
                        importantFields.length === 0 ||
                        selectedImportProfiles.length === 0 ||
                        (rowSelectionMode === "subset" && selectedRowNumbers.length === 0)
                      }
                      onClick={startImportFromSelection}
                      type="button"
                      variant="primary"
                    >
                      <RefreshCw className={isBusy ? "animate-spin" : undefined} />
                      {isBusy
                        ? "Starting sync..."
                        : `Sync Org Data (${selectedRowCount} rows • ${selectedImportProfiles.length} ${selectedImportProfiles.length === 1 ? "type" : "types"})`}
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {stage === "processing" && activeRun ? (
            <Card>
              <CardHeader>
                <CardTitle>Active Run</CardTitle>
                <CardDescription>Processing and applying sync batches.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Alert variant="info">
                  Processing sync... {activeRun.status} • {progressPercent}%
                </Alert>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                  <div className="h-full bg-accent transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                </div>
                <Button disabled={isBusy} onClick={cancelRun} type="button" variant="ghost">
                  Stop sync
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {stage === "conflicts" ? (
            <Card>
              <CardHeader>
                <CardTitle>Conflict Detail</CardTitle>
                <CardDescription>Resolve queue items from the right sidebar.</CardDescription>
              </CardHeader>
              <CardContent>
                {selectedConflict ? (
                  <div className="space-y-3">
                    {(() => {
                      const detail = extractConflictDetail(selectedConflict);
                      const showUpdate =
                        Boolean(selectedConflict.aiSuggestion?.targetId) && !selectedConflict.conflictType.startsWith("dependency_");
                      return (
                        <>
                          <Alert variant="warning">{selectedConflict.conflictType}</Alert>
                          <p className="text-xs text-text-muted">{selectedConflict.aiSuggestion?.userPrompt ?? humanizeReason(detail.blockingReason)}</p>
                          {detail.failedStage ? <p className="text-xs text-text-muted">Stage: {detail.failedStage}</p> : null}
                          {detail.parentEmail ? <p className="text-xs text-text-muted">Parent email: {detail.parentEmail}</p> : null}
                          {detail.detailMessage ? <p className="text-xs text-danger">{detail.detailMessage}</p> : null}
                          <div className="flex flex-wrap gap-2">
                            <Button onClick={() => resolveConflict(selectedConflict.id, "insert")} size="sm" type="button" variant="secondary">
                              Insert
                            </Button>
                            <Button onClick={() => resolveConflict(selectedConflict.id, "skip")} size="sm" type="button" variant="ghost">
                              Skip
                            </Button>
                            {showUpdate ? (
                              <Button
                                onClick={() => resolveConflict(selectedConflict.id, "update", selectedConflict.aiSuggestion?.targetId ?? undefined)}
                                size="sm"
                                type="button"
                              >
                                Update target
                              </Button>
                            ) : null}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <p className="text-sm text-text-muted">Select a conflict from the queue to resolve.</p>
                )}
              </CardContent>
            </Card>
          ) : null}

          {stage === "done" ? (
            <Card>
              <CardHeader>
                <CardTitle>Sync Complete</CardTitle>
                <CardDescription>Latest run status and optional undo.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeRun ? (
                  <div className="rounded-control border bg-surface px-3 py-2">
                    <p className="text-sm font-semibold text-text">{activeRun.status === "completed" ? "Sync complete" : "Sync finished"}</p>
                    <p className="text-xs text-text-muted">{activeRun.status}</p>
                    {activeRun.errorText ? <p className="mt-1 text-xs text-danger">{activeRun.errorText}</p> : null}
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      setActiveRun(null);
                      setConflicts([]);
                      setSelectedConflictId(null);
                      resetSetupFlow();
                    }}
                    type="button"
                  >
                    Start new sync
                  </Button>
                  <Button disabled={isBusy || !canUndoRun(activeRun)} onClick={undoRun} type="button" variant="secondary">
                    Undo sync
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card className="xl:sticky xl:top-4">
            <CardHeader>
              <CardTitle>Runs and Queue</CardTitle>
              <CardDescription>Grouped import sessions, active status, and unresolved conflicts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeRun ? (
                <div className="rounded-control border bg-surface px-3 py-2">
                  <p className="text-sm font-semibold text-text">Active run</p>
                  <div className="mt-1 flex items-center gap-2">
                    {activeRun.sourcePlatformLogoPath ? (
                      <img alt={`${activeRun.sourcePlatformLabel ?? "Unknown"} logo`} className="h-4 w-4 object-contain" src={activeRun.sourcePlatformLogoPath} />
                    ) : null}
                    <Chip status={false} variant="neutral">{activeRun.sourcePlatformLabel ?? "Unknown Platform"}</Chip>
                  </div>
                  <p className="text-xs text-text-muted">{activeRun.status} • {progressPercent}%</p>
                </div>
              ) : (
                <p className="text-sm text-text-muted">No active run.</p>
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium text-text">Conflict queue</p>
                {conflicts.length === 0 ? <p className="text-xs text-text-muted">No unresolved conflicts.</p> : null}
                {conflicts.map((conflict) => (
                  <button
                    className={`w-full rounded-control border px-3 py-2 text-left ${selectedConflict?.id === conflict.id ? "border-warning bg-warning/10" : "bg-surface"}`}
                    key={conflict.id}
                    onClick={() => setSelectedConflictId(conflict.id)}
                    type="button"
                  >
                    <p className="text-sm font-semibold text-text">{conflict.conflictType}</p>
                    <p className="text-xs text-text-muted">{conflict.rowId}</p>
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-text">Recent import sessions</p>
                {groupedRuns.length === 0 ? <p className="text-sm text-text-muted">No imports yet.</p> : null}
                {groupedRuns.map((group) => {
                  const lead = group.runs[0];
                  return (
                    <details className="rounded-control border bg-surface" key={group.key}>
                      <summary className="cursor-pointer px-3 py-2">
                        <p className="text-sm font-semibold text-text">{lead?.sourceFilename || group.key}</p>
                        <div className="mt-1 flex items-center gap-2">
                          {lead?.sourcePlatformLogoPath ? (
                            <img alt={`${lead.sourcePlatformLabel ?? "Unknown"} logo`} className="h-4 w-4 object-contain" src={lead.sourcePlatformLogoPath} />
                          ) : null}
                          <Chip status={false} variant="neutral">{lead?.sourcePlatformLabel ?? "Unknown Platform"}</Chip>
                        </div>
                        <p className="text-xs text-text-muted">
                          {group.runs.length} run{group.runs.length === 1 ? "" : "s"} • {formatDateTime(lead?.createdAt ?? new Date().toISOString())}
                        </p>
                      </summary>
                      <div className="space-y-2 px-3 pb-3">
                        {group.runs.map((run) => (
                          <div className="rounded-control border bg-canvas/40 px-2 py-2" key={run.id}>
                            <p className="text-sm font-medium text-text">{PROFILE_DEFAULTS[run.profile].label}</p>
                            <div className="mt-1 flex items-center gap-2">
                              {run.sourcePlatformLogoPath ? (
                                <img alt={`${run.sourcePlatformLabel ?? "Unknown"} logo`} className="h-4 w-4 object-contain" src={run.sourcePlatformLogoPath} />
                              ) : null}
                              <Chip status={false} variant="neutral">{run.sourcePlatformLabel ?? "Unknown Platform"}</Chip>
                            </div>
                            <p className="text-xs text-text-muted">{run.status} • {Math.round(run.progress)}%</p>
                            <div className="mt-2 flex gap-2">
                              <Button disabled={isBusy} onClick={() => openRun(run)} size="sm" type="button" variant="secondary">
                                Open
                              </Button>
                              <Button
                                disabled={isBusy || !canUndoRun(run)}
                                onClick={() => undoRunById(run.id)}
                                size="sm"
                                type="button"
                                variant="ghost"
                              >
                                Undo
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
