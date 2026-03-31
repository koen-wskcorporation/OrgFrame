"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { Popup } from "@orgframe/ui/primitives/popup";
import { Select } from "@orgframe/ui/primitives/select";
import { useToast } from "@orgframe/ui/primitives/toast";
import { useFileManager } from "@/src/features/files/manager";
import {
  applyImportBatchAction,
  getImportRunStatusAction,
  listImportConflictsAction,
  listImportRunsAction,
  processImportBatchAction,
  resolveConflictBatchAction,
  resolveConflictManuallyAction,
  startImportRunAction
} from "@/src/features/imports/actions";
import { importProfiles, type ConflictRecord, type ImportProfileKey, type ImportRunListItem } from "@/src/features/imports/contracts";
import { importProfileRegistry } from "@/src/features/imports/profiles";

type SmartImportWorkspaceProps = {
  orgSlug: string;
  initialRuns: ImportRunListItem[];
};

type WizardStage = "upload" | "analyze" | "conflicts" | "commit" | "report";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function stageForStatus(status: ImportRunListItem["status"]): WizardStage {
  if (status === "queued" || status === "processing") {
    return "analyze";
  }

  if (status === "awaiting_conflicts" || status === "resolving_conflicts") {
    return "conflicts";
  }

  if (status === "ready_to_apply" || status === "applying") {
    return "commit";
  }

  return "report";
}

function buildProfileOptions() {
  return importProfiles.map((profile) => ({
    value: profile,
    label: importProfileRegistry[profile].label
  }));
}

export function SmartImportWorkspace({ orgSlug, initialRuns }: SmartImportWorkspaceProps) {
  const { toast } = useToast();
  const { openFileManager } = useFileManager();
  const [isPending, startTransition] = useTransition();

  const profileOptions = useMemo(() => buildProfileOptions(), []);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [profile, setProfile] = useState<ImportProfileKey>("people_roster");
  const [history, setHistory] = useState<ImportRunListItem[]>(initialRuns);
  const [selectedFile, setSelectedFile] = useState<{
    id: string;
    path: string;
    name: string;
    mime: string;
    size: number;
    bucket: string;
  } | null>(null);
  const [activeRun, setActiveRun] = useState<ImportRunListItem | null>(initialRuns[0] ?? null);
  const [stage, setStage] = useState<WizardStage>("upload");
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);

  useEffect(() => {
    if (!activeRun) {
      return;
    }

    setStage(stageForStatus(activeRun.status));
  }, [activeRun]);

  useEffect(() => {
    if (!activeRun) {
      return;
    }

    const runIsTerminal = activeRun.status === "completed" || activeRun.status === "failed" || activeRun.status === "cancelled";
    if (runIsTerminal) {
      return;
    }

    const timer = window.setInterval(() => {
      startTransition(async () => {
        try {
          const run = await getImportRunStatusAction({
            orgSlug,
            runId: activeRun.id
          });
          setActiveRun(run);
        } catch {
          // noop
        }
      });
    }, 3000);

    return () => window.clearInterval(timer);
  }, [activeRun, orgSlug]);

  async function refreshHistory() {
    const result = await listImportRunsAction({ orgSlug, limit: 20 });
    setHistory(result.runs);
  }

  function openWizardWithRun(run?: ImportRunListItem | null) {
    if (run) {
      setActiveRun(run);
      setStage(stageForStatus(run.status));
    } else {
      setStage("upload");
    }

    setWizardOpen(true);
  }

  function launchFilePicker() {
    startTransition(async () => {
      try {
        const reopenWizard = wizardOpen;
        if (reopenWizard) {
          setWizardOpen(false);
          await new Promise((resolve) => window.setTimeout(resolve, 0));
        }

        const selected = await openFileManager({
          mode: "select",
          selectionType: "single",
          orgSlug,
          title: "Select import file",
          subtitle: "Choose a CSV or XLSX file for Smart Import.",
          fileTypes:
            ".csv,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          defaultFolder: {
            kind: "system",
            key: "imports"
          },
          uploadDefaults: {
            accessTag: "manage",
            legacyPurpose: "attachment"
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

        if (reopenWizard) {
          setWizardOpen(true);
        }
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Unable to open file manager.",
          variant: "destructive"
        });
      }
    });
  }

  function startRun() {
    if (!selectedFile) {
      toast({ title: "Select a file first.", variant: "warning" });
      return;
    }

    startTransition(async () => {
      try {
        const response = await startImportRunAction({
          orgSlug,
          profile,
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

        const run = await getImportRunStatusAction({
          orgSlug,
          runId
        });
        setActiveRun(run);
        setStage("analyze");
        await refreshHistory();
        toast({ title: "Import run started." });
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to start import run.",
          variant: "destructive"
        });
      }
    });
  }

  function processBatch() {
    if (!activeRun) {
      return;
    }

    startTransition(async () => {
      try {
        await processImportBatchAction({
          orgSlug,
          runId: activeRun.id,
          batchSize: 250
        });
        const run = await getImportRunStatusAction({ orgSlug, runId: activeRun.id });
        setActiveRun(run);
        setStage(stageForStatus(run.status));
        await refreshHistory();
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to process import batch.",
          variant: "destructive"
        });
      }
    });
  }

  function resolveConflictsBatch() {
    if (!activeRun) {
      return;
    }

    startTransition(async () => {
      try {
        await resolveConflictBatchAction({
          orgSlug,
          runId: activeRun.id,
          batchSize: 100
        });
        const [run, conflictRows] = await Promise.all([
          getImportRunStatusAction({ orgSlug, runId: activeRun.id }),
          listImportConflictsAction({ orgSlug, runId: activeRun.id, state: "needs_review", limit: 100 })
        ]);
        setActiveRun(run);
        setStage(stageForStatus(run.status));
        setConflicts(conflictRows.conflicts);
        await refreshHistory();
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to resolve conflicts with AI.",
          variant: "destructive"
        });
      }
    });
  }

  function loadConflicts() {
    if (!activeRun) {
      return;
    }

    startTransition(async () => {
      try {
        const result = await listImportConflictsAction({
          orgSlug,
          runId: activeRun.id,
          state: "needs_review",
          limit: 200
        });
        setConflicts(result.conflicts);
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to load conflicts.",
          variant: "destructive"
        });
      }
    });
  }

  function resolveConflict(conflictId: string, action: "insert" | "update" | "skip", targetId?: string) {
    if (!activeRun) {
      return;
    }

    startTransition(async () => {
      try {
        await resolveConflictManuallyAction({
          orgSlug,
          runId: activeRun.id,
          conflictId,
          action,
          targetId
        });
        await loadConflicts();
        const run = await getImportRunStatusAction({ orgSlug, runId: activeRun.id });
        setActiveRun(run);
        setStage(stageForStatus(run.status));
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to resolve conflict.",
          variant: "destructive"
        });
      }
    });
  }

  function applyBatch() {
    if (!activeRun) {
      return;
    }

    startTransition(async () => {
      try {
        await applyImportBatchAction({
          orgSlug,
          runId: activeRun.id,
          batchSize: 250
        });
        const run = await getImportRunStatusAction({ orgSlug, runId: activeRun.id });
        setActiveRun(run);
        setStage(stageForStatus(run.status));
        await refreshHistory();
      } catch (error) {
        toast({
          title: error instanceof Error ? error.message : "Failed to apply import batch.",
          variant: "destructive"
        });
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Smart Import</CardTitle>
          <CardDescription>Run imports in a guided multistep popup: upload, analyze, conflicts, commit, report.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => openWizardWithRun(activeRun)} type="button">
            Open Smart Import Wizard
          </Button>
        </CardContent>
      </Card>

      <Popup
        onClose={() => setWizardOpen(false)}
        open={wizardOpen}
        size="lg"
        subtitle="Complete each step to safely import your data."
        title="Smart Import Wizard"
        viewKey={stage}
      >
        <div className="space-y-4">
          <div className="rounded-control border bg-surface px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Current step</p>
            <p className="text-sm font-medium text-text">{stage}</p>
          </div>

          {stage === "upload" ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-text">Import profile</p>
                <Select
                  name="profile"
                  onChange={(event) => setProfile(event.currentTarget.value as ImportProfileKey)}
                  options={profileOptions}
                  value={profile}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={isPending} onClick={launchFilePicker} type="button" variant="secondary">
                  {selectedFile ? "Change file" : "Select CSV/XLSX file"}
                </Button>
                <Button disabled={isPending || !selectedFile} onClick={startRun} type="button">
                  Start analyze
                </Button>
              </div>
              {selectedFile ? <Alert variant="info">Selected file: {selectedFile.name}</Alert> : null}
            </div>
          ) : null}

          {stage === "analyze" ? (
            <div className="space-y-3">
              <Alert variant="info">Process rows in batches and classify direct matches vs conflicts.</Alert>
              {activeRun ? (
                <p className="text-sm text-text">
                  {activeRun.id} • {activeRun.status} • {Math.round(activeRun.progress)}%
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button disabled={isPending || !activeRun} onClick={processBatch} type="button">
                  Process batch
                </Button>
                <Button disabled={!activeRun} onClick={() => setStage("conflicts")} type="button" variant="ghost">
                  Next: Conflicts
                </Button>
              </div>
            </div>
          ) : null}

          {stage === "conflicts" ? (
            <div className="space-y-3">
              <Alert variant="info">AI auto-applies only when confidence is 0.85 or higher.</Alert>
              <div className="flex flex-wrap gap-2">
                <Button disabled={isPending || !activeRun} onClick={resolveConflictsBatch} type="button">
                  AI resolve batch
                </Button>
                <Button disabled={isPending || !activeRun} onClick={loadConflicts} type="button" variant="secondary">
                  Refresh manual queue
                </Button>
                <Button disabled={!activeRun} onClick={() => setStage("commit")} type="button" variant="ghost">
                  Next: Commit
                </Button>
              </div>
              {conflicts.length === 0 ? <p className="text-sm text-text-muted">No pending conflicts loaded.</p> : null}
              {conflicts.map((conflict) => (
                <div className="rounded-control border bg-surface p-3" key={conflict.id}>
                  <p className="text-sm font-semibold text-text">{conflict.conflictType}</p>
                  <p className="text-xs text-text-muted">{conflict.aiSuggestion?.userPrompt ?? "Manual review required."}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button onClick={() => resolveConflict(conflict.id, "insert")} size="sm" type="button" variant="secondary">
                      Insert
                    </Button>
                    <Button onClick={() => resolveConflict(conflict.id, "skip")} size="sm" type="button" variant="ghost">
                      Skip
                    </Button>
                    <Button
                      disabled={!conflict.aiSuggestion?.targetId}
                      onClick={() => resolveConflict(conflict.id, "update", conflict.aiSuggestion?.targetId ?? undefined)}
                      size="sm"
                      type="button"
                    >
                      Update target
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {stage === "commit" ? (
            <div className="space-y-3">
              <Alert variant="info">Apply direct rows and resolved conflicts in idempotent batches.</Alert>
              <div className="flex flex-wrap gap-2">
                <Button disabled={isPending || !activeRun} onClick={applyBatch} type="button">
                  Apply batch
                </Button>
                <Button disabled={!activeRun} onClick={() => setStage("report")} type="button" variant="ghost">
                  Next: Report
                </Button>
              </div>
            </div>
          ) : null}

          {stage === "report" ? (
            <div className="space-y-3">
              {activeRun ? (
                <div className="rounded-control border bg-surface px-3 py-2">
                  <p className="text-sm font-semibold text-text">Run summary</p>
                  <p className="text-xs text-text-muted">
                    {activeRun.sourceFilename || activeRun.id} • {activeRun.status} • {Math.round(activeRun.progress)}%
                  </p>
                  {activeRun.errorText ? <p className="mt-1 text-xs text-danger">{activeRun.errorText}</p> : null}
                </div>
              ) : (
                <p className="text-sm text-text-muted">No active run selected.</p>
              )}
              <Button onClick={() => setWizardOpen(false)} type="button">
                Close
              </Button>
            </div>
          ) : null}
        </div>
      </Popup>

      <Card>
        <CardHeader>
          <CardTitle>Run History</CardTitle>
          <CardDescription>Recent smart import runs for this organization.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {history.length === 0 ? <p className="text-sm text-text-muted">No runs yet.</p> : null}
          {history.map((run) => (
            <button
              className="w-full rounded-control border bg-surface px-3 py-2 text-left hover:bg-surface-muted"
              key={run.id}
              onClick={() => openWizardWithRun(run)}
              type="button"
            >
              <p className="text-sm font-semibold text-text">{run.sourceFilename || run.id}</p>
              <p className="text-xs text-text-muted">
                {run.profile} • {run.status} • {Math.round(run.progress)}% • {formatDateTime(run.createdAt)}
              </p>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
