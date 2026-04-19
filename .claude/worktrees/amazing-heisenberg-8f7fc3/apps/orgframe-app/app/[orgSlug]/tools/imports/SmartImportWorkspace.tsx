"use client";

import { useEffect, useRef, useState } from "react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { Popup } from "@orgframe/ui/primitives/popup";
import { useToast } from "@orgframe/ui/primitives/toast";
import { useFileManager } from "@/src/features/files/manager";
import {
  applyImportBatchAction,
  cancelImportRunAction,
  getImportRunStatusAction,
  listImportConflictsAction,
  listImportRunsAction,
  processImportBatchAction,
  resolveConflictBatchAction,
  resolveConflictManuallyAction,
  startImportRunAction,
  undoImportRunAction
} from "@/src/features/imports/actions";
import { type ConflictRecord, type ImportRunListItem } from "@/src/features/imports/contracts";

type SmartImportWorkspaceProps = {
  orgSlug: string;
  initialRuns: ImportRunListItem[];
};

type FlowStage = "select_file" | "processing" | "conflicts" | "done";
const PROCESS_BATCH_DEFAULT = 25;
const APPLY_BATCH_DEFAULT = 25;
const CONFLICT_BATCH_DEFAULT = 25;
const MIN_BATCH_SIZE = 5;

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

export function SmartImportWorkspace({ orgSlug, initialRuns }: SmartImportWorkspaceProps) {
  const { toast } = useToast();
  const { openFileManager } = useFileManager();
  const [isBusy, setIsBusy] = useState(false);
  const drivingRef = useRef(false);

  const [selectedFile, setSelectedFile] = useState<{
    id: string;
    path: string;
    name: string;
    mime: string;
    size: number;
    bucket: string;
  } | null>(null);
  const [activeRun, setActiveRun] = useState<ImportRunListItem | null>(null);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [history, setHistory] = useState<ImportRunListItem[]>(initialRuns);

  useEffect(() => {
    setActiveRun(initialRuns.find((run) => !isTerminal(run.status)) ?? null);
    setHistory(initialRuns);
  }, [initialRuns]);

  async function refreshHistory() {
    const result = await listImportRunsAction({ orgSlug, limit: 20 });
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
      limit: 200
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
    if (!activeRun) {
      return;
    }

    if (isTerminal(activeRun.status)) {
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

  function launchFilePicker() {
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
        if (file) {
          setSelectedFile({
            id: file.id,
            path: file.path,
            name: file.name,
            mime: file.mime,
            size: file.size,
            bucket: file.bucket
          });
        }
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Unable to open file manager.",
          variant: "destructive"
        });
      } finally {
        setIsBusy(false);
      }
    })();
  }

  function startRun() {
    if (!selectedFile) {
      toast({ title: "Select a file first.", variant: "warning" });
      return;
    }

    void (async () => {
      setIsBusy(true);
      try {
        const response = await startImportRunAction({
          orgSlug,
          fileId: selectedFile.id,
          filePath: selectedFile.path,
          fileName: selectedFile.name,
          mimeType: selectedFile.mime,
          sizeBytes: selectedFile.size,
          bucket: selectedFile.bucket
        });

        const runId = typeof response.run_id === "string" ? response.run_id : null;
        if (!runId) {
          throw new Error("Import run was not created.");
        }

        const run = await refreshRun(runId);
        setConflicts([]);
        toast({ title: "Import started." });
        await refreshHistory();
        await driveRun(run.id);
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to start import run.",
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

  function openRun(run: ImportRunListItem) {
    void (async () => {
      setIsBusy(true);
      try {
        setActiveRun(run);
        setWizardOpen(true);
        if (run.status === "awaiting_conflicts" || run.status === "resolving_conflicts") {
          await loadConflicts(run.id);
        } else {
          setConflicts([]);
        }
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

  const stage = deriveStage(activeRun);
  const progressPercent = Math.max(0, Math.min(100, Math.round(activeRun?.progress ?? 0)));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Smart Import</CardTitle>
          <CardDescription>Upload, process, resolve conflicts, complete.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={() => setWizardOpen(true)} type="button">
            Open Import Wizard
          </Button>
          <div className="space-y-2">
            <p className="text-sm font-medium text-text">Recent imports</p>
            {history.length === 0 ? <p className="text-sm text-text-muted">No imports yet.</p> : null}
            {history.map((run) => (
              <div className="rounded-control border bg-surface px-3 py-2" key={run.id}>
                <p className="text-sm font-semibold text-text">{run.sourceFilename || run.id}</p>
                <p className="text-xs text-text-muted">
                  {run.status} • {Math.round(run.progress)}% • {formatDateTime(run.createdAt)}
                </p>
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
        </CardContent>
      </Card>

      <Popup
        onClose={() => setWizardOpen(false)}
        open={wizardOpen}
        size="lg"
        subtitle="Select file, continue, resolve conflicts if any, and finish."
        title="Smart Import Wizard"
        viewKey={stage}
      >
        <div className="space-y-4">
          {stage === "select_file" ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-text">Step 1 of 4: Upload</p>
              <div className="flex flex-wrap gap-2">
                <Button disabled={isBusy} onClick={launchFilePicker} type="button" variant="secondary">
                  {selectedFile ? "Change file" : "Select CSV/XLSX file"}
                </Button>
                <Button disabled={isBusy || !selectedFile} onClick={startRun} type="button">
                  Next
                </Button>
              </div>
              {selectedFile ? <Alert variant="info">Selected file: {selectedFile.name}</Alert> : null}
            </div>
          ) : null}

          {stage === "processing" && activeRun ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-text">Step 2 of 4: Processing</p>
              <Alert variant="info">
                Processing import... {activeRun.status} • {progressPercent}%
              </Alert>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                <div className="h-full bg-accent transition-all duration-300" style={{ width: `${progressPercent}%` }} />
              </div>
              <Button disabled={isBusy} onClick={cancelRun} type="button" variant="ghost">
                Cancel import
              </Button>
            </div>
          ) : null}

          {stage === "conflicts" ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-text">Step 3 of 4: Conflicts</p>
              <Alert variant="warning">Resolve conflicts to continue.</Alert>

              {conflicts.length === 0 ? <p className="text-sm text-text-muted">Loading conflicts...</p> : null}

              {conflicts.map((conflict) => (
                <div className="rounded-control border bg-surface p-3" key={conflict.id}>
                  {(() => {
                    const detail = extractConflictDetail(conflict);
                    const showUpdate = Boolean(conflict.aiSuggestion?.targetId) && !conflict.conflictType.startsWith("dependency_");
                    return (
                      <>
                        <p className="text-sm font-semibold text-text">{conflict.conflictType}</p>
                        <p className="text-xs text-text-muted">
                          {conflict.aiSuggestion?.userPrompt ?? humanizeReason(detail.blockingReason)}
                        </p>
                        {detail.failedStage ? <p className="text-xs text-text-muted">Stage: {detail.failedStage}</p> : null}
                        {detail.parentEmail ? <p className="text-xs text-text-muted">Parent email: {detail.parentEmail}</p> : null}
                        {detail.detailMessage ? <p className="text-xs text-danger">{detail.detailMessage}</p> : null}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button onClick={() => resolveConflict(conflict.id, "insert")} size="sm" type="button" variant="secondary">
                            Insert
                          </Button>
                          <Button onClick={() => resolveConflict(conflict.id, "skip")} size="sm" type="button" variant="ghost">
                            Skip
                          </Button>
                          {showUpdate ? (
                            <Button
                              onClick={() => resolveConflict(conflict.id, "update", conflict.aiSuggestion?.targetId ?? undefined)}
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
              ))}

              <Button disabled={isBusy} onClick={cancelRun} type="button" variant="ghost">
                Cancel import
              </Button>
            </div>
          ) : null}

          {stage === "done" ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-text">Step 4 of 4: Complete</p>
              {activeRun ? (
                <div className="rounded-control border bg-surface px-3 py-2">
                  <p className="text-sm font-semibold text-text">
                    {activeRun.status === "completed" ? "Import complete" : "Import finished"}
                  </p>
                  <p className="text-xs text-text-muted">{activeRun.status}</p>
                  {activeRun.errorText ? <p className="mt-1 text-xs text-danger">{activeRun.errorText}</p> : null}
                </div>
              ) : null}

              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setWizardOpen(false);
                    setActiveRun(null);
                    setSelectedFile(null);
                    setConflicts([]);
                  }}
                  type="button"
                >
                  Done
                </Button>
                <Button
                  disabled={isBusy || !canUndoRun(activeRun)}
                  onClick={undoRun}
                  type="button"
                  variant="secondary"
                >
                  Undo import
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </Popup>
    </div>
  );
}
