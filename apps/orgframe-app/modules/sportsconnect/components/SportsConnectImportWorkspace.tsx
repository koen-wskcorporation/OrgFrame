"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Alert } from "@orgframe/ui/ui/alert";
import { Button } from "@orgframe/ui/ui/button";
import { type CanvasViewportHandle, CanvasViewport } from "@orgframe/ui/ui/canvas-viewport";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/ui/card";
import { Chip } from "@orgframe/ui/ui/chip";
import { FormField } from "@orgframe/ui/ui/form-field";
import { Input } from "@orgframe/ui/ui/input";
import { Popup } from "@orgframe/ui/ui/popup";
import { Select } from "@orgframe/ui/ui/select";
import { useToast } from "@orgframe/ui/ui/toast";
import { commitRun, createDryRun, getRunProjection, listRunHistory, resolveMappings } from "@/modules/sportsconnect/actions";
import { useOrderPanel } from "@/modules/orders";
import type {
  SportsConnectCommitResult,
  SportsConnectDryRunResult,
  SportsConnectMappingMode,
  SportsConnectMappingRequirement,
  SportsConnectRunHistoryItem,
  SportsConnectRunProjection
} from "@/modules/sportsconnect/types";

type SportsConnectImportWorkspaceProps = {
  orgSlug: string;
  initialRuns: SportsConnectRunHistoryItem[];
};

type WizardStep = "upload" | "mapping" | "map" | "commit";

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString();
}

function toModeLabel(mode: SportsConnectMappingMode | null) {
  if (mode === "create") {
    return "Create new";
  }

  if (mode === "existing") {
    return "Map to existing";
  }

  return "Unresolved";
}

function getOrderRefsFromSummary(summary: Record<string, unknown>) {
  const candidate = summary.order_refs;
  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate
    .map((entry) => (entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => ({
      orderId: typeof entry.orderId === "string" ? entry.orderId : null,
      sourceOrderId: typeof entry.sourceOrderId === "string" ? entry.sourceOrderId : null,
      sourceOrderNo: typeof entry.sourceOrderNo === "string" ? entry.sourceOrderNo : null
    }))
    .filter((entry) => entry.orderId || entry.sourceOrderId);
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p className="text-lg font-semibold text-text">{value.toLocaleString()}</p>
    </div>
  );
}

function SummaryDeltaRow({
  label,
  total,
  created,
  existing
}: {
  label: string;
  total: number;
  created: number;
  existing: number;
}) {
  return (
    <div className="rounded-control border bg-surface px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <p className="text-lg font-semibold text-text">{total.toLocaleString()}</p>
      <p className="text-xs text-text-muted">
        {created.toLocaleString()} new • {existing.toLocaleString()} existing
      </p>
    </div>
  );
}

function OrganizationProjectionCanvas({ projection }: { projection: SportsConnectRunProjection }) {
  const canvasRef = useRef<CanvasViewportHandle | null>(null);

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      canvasRef.current?.fitToView();
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [projection]);

  return (
    <div className="space-y-3">
      <div className="rounded-card border bg-surface p-3">
        <p className="mb-3 text-sm font-semibold text-text">Projected transfer summary</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryDeltaRow
            created={projection.summary.newPrograms}
            existing={projection.summary.existingPrograms}
            label="Programs"
            total={projection.summary.programs}
          />
          <SummaryDeltaRow
            created={projection.summary.newDivisions}
            existing={projection.summary.existingDivisions}
            label="Divisions"
            total={projection.summary.divisions}
          />
          <SummaryDeltaRow
            created={projection.summary.newTeams}
            existing={projection.summary.existingTeams}
            label="Teams"
            total={projection.summary.teams}
          />
          <SummaryDeltaRow
            created={projection.summary.newPlayers}
            existing={projection.summary.existingPlayers}
            label="Players"
            total={projection.summary.players}
          />
          <SummaryDeltaRow
            created={projection.summary.newAccounts}
            existing={projection.summary.existingAccounts}
            label="Accounts"
            total={projection.summary.accounts}
          />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <SummaryRow label="Unallocated Players" value={projection.summary.unallocatedPlayers} />
          <SummaryRow label="Rows Skipped (issues)" value={projection.summary.skippedRowsWithIssues} />
        </div>
      </div>

      <div className="h-[56vh] min-h-[420px] overflow-hidden rounded-card border bg-canvas">
        <CanvasViewport
          contentClassName="min-w-max p-6"
          fitPadding={36}
          gridColor="#d7dde4"
          gridSize={28}
          interactive
          ref={canvasRef}
          storageKey={`sportsconnect-preview-canvas:${projection.runId}`}
        >
          <div className="flex min-w-max items-start gap-4">
            {projection.programs.map((program) => (
              <Card className="w-[340px] shrink-0" key={program.key}>
                <CardHeader className="space-y-1 pb-3">
                  <CardTitle className="text-base">{program.name}</CardTitle>
                  <CardDescription>{program.divisions.length} divisions</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {program.divisions.map((division) => (
                    <div className="rounded-control border bg-surface-muted/50 p-3" key={division.key}>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-text">{division.name}</p>
                        <Chip size="compact">{division.teams.length} teams</Chip>
                      </div>

                      {division.unallocatedPlayers.length > 0 ? (
                        <div className="mb-2 rounded-control border border-dashed bg-surface px-2 py-1.5">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Unallocated players</p>
                          <p className="mt-1 text-xs text-text">{division.unallocatedPlayers.length} player(s)</p>
                        </div>
                      ) : null}

                      <div className="space-y-2">
                        {division.teams.map((team) => (
                          <div className="rounded-control border bg-surface px-2 py-2" key={team.key}>
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <p className="text-sm font-medium text-text">{team.name}</p>
                              <Chip size="compact">{team.players.length}</Chip>
                            </div>
                            <p className="text-xs text-text-muted">Projected players: {team.players.length}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </CanvasViewport>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => canvasRef.current?.zoomOut()} size="sm" type="button" variant="secondary">
          Zoom out
        </Button>
        <Button onClick={() => canvasRef.current?.zoomIn()} size="sm" type="button" variant="secondary">
          Zoom in
        </Button>
        <Button onClick={() => canvasRef.current?.fitToView()} size="sm" type="button" variant="ghost">
          Fit to view
        </Button>
      </div>
    </div>
  );
}

export function SportsConnectImportWorkspace({ orgSlug, initialRuns }: SportsConnectImportWorkspaceProps) {
  const { toast } = useToast();
  const { openOrderPanel } = useOrderPanel();

  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>("upload");

  const [fileName, setFileName] = useState<string>("");
  const [csvContent, setCsvContent] = useState<string>("");
  const [dryRun, setDryRun] = useState<SportsConnectDryRunResult | null>(null);
  const [mappingRequirements, setMappingRequirements] = useState<SportsConnectMappingRequirement[]>([]);
  const [projection, setProjection] = useState<SportsConnectRunProjection | null>(null);
  const [commitResult, setCommitResult] = useState<SportsConnectCommitResult | null>(null);
  const [history, setHistory] = useState<SportsConnectRunHistoryItem[]>(initialRuns);
  const [busy, startTransition] = useTransition();

  const unresolvedMappings = useMemo(
    () => mappingRequirements.filter((requirement) => requirement.required && requirement.selectedMode === null).length,
    [mappingRequirements]
  );

  function openWizard() {
    if (commitResult) {
      setStep("commit");
    } else if (projection) {
      setStep("map");
    } else if (dryRun) {
      setStep("mapping");
    } else {
      setStep("upload");
    }

    setWizardOpen(true);
  }

  function updateRequirementMode(key: string, mode: SportsConnectMappingMode | null) {
    setMappingRequirements((current) =>
      current.map((requirement) => {
        if (requirement.key !== key) {
          return requirement;
        }

        return {
          ...requirement,
          selectedMode: mode,
          selectedCandidateId: mode === "existing" ? requirement.selectedCandidateId : null
        };
      })
    );
  }

  function updateRequirementCandidate(key: string, candidateId: string | null) {
    setMappingRequirements((current) =>
      current.map((requirement) => {
        if (requirement.key !== key) {
          return requirement;
        }

        return {
          ...requirement,
          selectedCandidateId: candidateId
        };
      })
    );
  }

  async function refreshHistory() {
    const next = await listRunHistory({
      orgSlug,
      limit: 20
    });
    setHistory(next.runs);
  }

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setFileName("");
      setCsvContent("");
      return;
    }

    const text = await file.text();
    setFileName(file.name);
    setCsvContent(text);
  }

  function handleCreateDryRun() {
    if (!csvContent) {
      toast({
        title: "No file selected",
        description: "Select a CSV export first.",
        variant: "destructive"
      });
      return;
    }

    startTransition(async () => {
      try {
        const result = await createDryRun({
          orgSlug,
          sourceFilename: fileName || null,
          sourceTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          csvContent
        });

        setDryRun(result);
        setMappingRequirements(result.mappingRequirements);
        setProjection(null);
        setCommitResult(null);
        setStep("mapping");
        await refreshHistory();

        toast({
          title: "Dry-run complete",
          description: `Analyzed ${result.summary.totalRows} row(s).`
        });
      } catch (error) {
        toast({
          title: "Dry-run failed",
          description: error instanceof Error ? error.message : "Unable to analyze CSV.",
          variant: "destructive"
        });
      }
    });
  }

  function handleSaveMappings() {
    if (!dryRun?.runId) {
      return;
    }

    startTransition(async () => {
      try {
        const result = await resolveMappings({
          orgSlug,
          runId: dryRun.runId,
          decisions: mappingRequirements
            .filter((requirement) => requirement.selectedMode)
            .map((requirement) => ({
              key: requirement.key,
              mode: requirement.selectedMode as SportsConnectMappingMode,
              candidateId: requirement.selectedCandidateId
            }))
        });

        setMappingRequirements(result.mappingRequirements);
        setDryRun((current) =>
          current
            ? {
                ...current,
                status: result.status,
                mappingRequirements: result.mappingRequirements,
                summary: {
                  ...current.summary,
                  unresolvedMappings: result.unresolvedMappings
                }
              }
            : current
        );

        await refreshHistory();

        toast({
          title: "Mappings saved",
          description: result.unresolvedMappings === 0 ? "Run is ready for preview." : `${result.unresolvedMappings} mapping(s) still unresolved.`
        });
      } catch (error) {
        toast({
          title: "Unable to save mappings",
          description: error instanceof Error ? error.message : "Try again.",
          variant: "destructive"
        });
      }
    });
  }

  function handleBuildProjection() {
    if (!dryRun?.runId) {
      return;
    }

    startTransition(async () => {
      try {
        const mappingResult = await resolveMappings({
          orgSlug,
          runId: dryRun.runId,
          decisions: mappingRequirements
            .filter((requirement) => requirement.selectedMode)
            .map((requirement) => ({
              key: requirement.key,
              mode: requirement.selectedMode as SportsConnectMappingMode,
              candidateId: requirement.selectedCandidateId
            }))
        });

        setMappingRequirements(mappingResult.mappingRequirements);
        if (mappingResult.unresolvedMappings > 0) {
          setStep("mapping");
          toast({
            title: "Mappings required",
            description: `${mappingResult.unresolvedMappings} required mapping(s) must be resolved before preview.`,
            variant: "destructive"
          });
          return;
        }

        const preview = await getRunProjection({
          orgSlug,
          runId: dryRun.runId
        });

        setProjection(preview);
        setStep("map");
        await refreshHistory();
      } catch (error) {
        toast({
          title: "Unable to build organization map",
          description: error instanceof Error ? error.message : "Try again.",
          variant: "destructive"
        });
      }
    });
  }

  function handleCommit() {
    if (!dryRun?.runId) {
      return;
    }

    startTransition(async () => {
      try {
        const result = await commitRun({
          orgSlug,
          runId: dryRun.runId
        });

        setCommitResult(result);
        setStep("commit");
        await refreshHistory();

        toast({
          title: result.status === "committed" ? "Import committed" : "Import completed with failures",
          description:
            result.status === "committed"
              ? `${result.summary.processedRows} row(s) processed successfully.`
              : `${result.summary.failedRows} row(s) failed during commit.`
        });
      } catch (error) {
        toast({
          title: "Commit failed",
          description: error instanceof Error ? error.message : "Unable to commit run.",
          variant: "destructive"
        });
      }
    });
  }

  const footer = (
    <>
      {step !== "upload" ? (
        <Button
          disabled={busy}
          onClick={() => {
            if (step === "mapping") {
              setStep("upload");
              return;
            }
            if (step === "map") {
              setStep("mapping");
              return;
            }
            if (step === "commit") {
              setStep("map");
            }
          }}
          size="sm"
          variant="ghost"
        >
          Back
        </Button>
      ) : null}
      <Button disabled={busy} onClick={() => setWizardOpen(false)} size="sm" variant="ghost">
        Close
      </Button>
      {step === "upload" ? (
        <Button disabled={busy || !csvContent} onClick={handleCreateDryRun} size="sm">
          {busy ? "Running..." : "Analyze file"}
        </Button>
      ) : null}
      {step === "mapping" ? (
        <>
          <Button disabled={busy || !dryRun?.runId} onClick={handleSaveMappings} size="sm" variant="secondary">
            Save mappings
          </Button>
          <Button disabled={busy || !dryRun?.runId} onClick={handleBuildProjection} size="sm">
            Continue to org map
          </Button>
        </>
      ) : null}
      {step === "map" ? (
        <Button disabled={busy || unresolvedMappings > 0 || !projection} onClick={handleCommit} size="sm">
          Commit run
        </Button>
      ) : null}
    </>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>SportsConnect Transfer Wizard</CardTitle>
          <CardDescription>
            Upload CSV, run dry-run, resolve mappings, preview full organization map on canvas, then commit.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button onClick={openWizard}>Open transfer popup</Button>
          {dryRun ? (
            <p className="text-xs text-text-muted">
              Current run {dryRun.runId} • status {dryRun.status} • unresolved mappings {unresolvedMappings}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Popup
        closeOnBackdrop={false}
        contentClassName="overflow-y-auto"
        footer={footer}
        onClose={() => setWizardOpen(false)}
        open={wizardOpen}
        size="full"
        subtitle="No user emails are sent during account creation. Activation emails only send on user action during login."
        title="SportsConnect transfer"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Chip color={step === "upload" ? "green" : "neutral"} variant="flat">
              1. Upload
            </Chip>
            <Chip color={step === "mapping" ? "green" : "neutral"} variant="flat">
              2. Mapping
            </Chip>
            <Chip color={step === "map" ? "green" : "neutral"} variant="flat">
              3. Org map
            </Chip>
            <Chip color={step === "commit" ? "green" : "neutral"} variant="flat">
              4. Commit result
            </Chip>
          </div>

          {step === "upload" ? (
            <Card>
              <CardHeader>
                <CardTitle>Upload SportsConnect CSV</CardTitle>
                <CardDescription>Choose the file and run analysis.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <FormField label="Enrollment report CSV">
                  <Input accept=".csv,text/csv" onChange={handleFileSelected} type="file" />
                </FormField>
                {fileName ? <p className="text-xs text-text-muted">Selected file: {fileName}</p> : null}
              </CardContent>
            </Card>
          ) : null}

          {step === "mapping" ? (
            <>
              {dryRun ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Dry-run Summary</CardTitle>
                    <CardDescription>
                      Run {dryRun.runId} • status {dryRun.status} • unresolved mappings {unresolvedMappings}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <SummaryRow label="Total Rows" value={dryRun.summary.totalRows} />
                    <SummaryRow label="Valid Rows" value={dryRun.summary.validRows} />
                    <SummaryRow label="Rows With Issues" value={dryRun.summary.rowsWithIssues} />
                    <SummaryRow label="Required Mappings" value={dryRun.summary.requiredMappings} />
                  </CardContent>
                </Card>
              ) : (
                <Alert variant="warning">Run dry-run first.</Alert>
              )}

              {mappingRequirements.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Mapping Decisions</CardTitle>
                    <CardDescription>Program/division/team matches requiring operator confirmation.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {mappingRequirements.map((requirement) => (
                      <div className="rounded-control border px-3 py-3" key={requirement.key}>
                        <p className="text-sm font-semibold text-text">
                          {requirement.kind.toUpperCase()}: {requirement.label}
                        </p>
                        <p className="text-xs text-text-muted">{toModeLabel(requirement.selectedMode)}</p>

                        {requirement.candidates.length > 0 ? (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <Select
                              onChange={(event) => {
                                const value = event.target.value;
                                updateRequirementMode(requirement.key, value === "create" || value === "existing" ? value : null);
                              }}
                              options={[
                                {
                                  value: "",
                                  label: "Select"
                                },
                                {
                                  value: "existing",
                                  label: "Map to existing"
                                },
                                {
                                  value: "create",
                                  label: "Create new"
                                }
                              ]}
                              value={requirement.selectedMode ?? ""}
                            />

                            <Select
                              disabled={requirement.selectedMode !== "existing"}
                              onChange={(event) => updateRequirementCandidate(requirement.key, event.target.value || null)}
                              options={[
                                {
                                  value: "",
                                  label: "Select existing"
                                },
                                ...requirement.candidates.map((candidate) => ({
                                  value: candidate.id,
                                  label: candidate.parentLabel ? `${candidate.parentLabel} • ${candidate.label}` : candidate.label
                                }))
                              ]}
                              value={requirement.selectedCandidateId ?? ""}
                            />
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-text-muted">No existing match detected. This will be auto-created.</p>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : null}

              {dryRun?.rowIssues.length ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Row Issues</CardTitle>
                    <CardDescription>Rows with blocking validation issues in dry-run.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {dryRun.rowIssues.slice(0, 30).map((issue) => (
                      <Alert key={issue.rowNumber} variant="warning">
                        Row {issue.rowNumber}: {issue.messages.join(" ")}
                      </Alert>
                    ))}
                    {dryRun.rowIssues.length > 30 ? <p className="text-xs text-text-muted">Showing first 30 issues.</p> : null}
                  </CardContent>
                </Card>
              ) : null}
            </>
          ) : null}

          {step === "map" ? (
            projection ? (
              <OrganizationProjectionCanvas projection={projection} />
            ) : (
              <Alert variant="warning">Build the organization map from mappings first.</Alert>
            )
          ) : null}

          {step === "commit" ? (
            commitResult ? (
              <Card>
                <CardHeader>
                  <CardTitle>Commit Outcome</CardTitle>
                  <CardDescription>Status: {commitResult.status}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <SummaryRow label="Processed" value={commitResult.summary.processedRows} />
                    <SummaryRow label="Skipped" value={commitResult.summary.skippedRows} />
                    <SummaryRow label="Failed" value={commitResult.summary.failedRows} />
                    <SummaryRow label="Created Orders" value={commitResult.summary.createdOrders} />
                  </div>

                  {commitResult.failures.length > 0 ? (
                    <div className="space-y-2">
                      {commitResult.failures.slice(0, 20).map((failure) => (
                        <Alert key={`${failure.rowNumber}:${failure.message}`} variant="destructive">
                          Row {failure.rowNumber}: {failure.message}
                        </Alert>
                      ))}
                    </div>
                  ) : null}

                  {commitResult.orders.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-text">Imported Orders</p>
                      {commitResult.orders.slice(0, 25).map((order) => (
                        <div className="flex items-center justify-between gap-2 rounded-control border px-3 py-2" key={order.orderId}>
                          <div>
                            <p className="text-sm text-text">{order.sourceOrderNo ?? order.sourceOrderId}</p>
                            <p className="text-xs text-text-muted">{order.sourcePaymentStatus ?? "No payment status"}</p>
                          </div>
                          <Button
                            onClick={() =>
                              openOrderPanel({
                                orgSlug,
                                orderId: order.orderId
                              })
                            }
                            size="sm"
                            variant="secondary"
                          >
                            View order
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : (
              <Alert variant="warning">Commit not run yet.</Alert>
            )
          ) : null}
        </div>
      </Popup>

      <Card>
        <CardHeader>
          <CardTitle>Run History</CardTitle>
          <CardDescription>Recent SportsConnect transfer runs for this organization.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {history.length === 0 ? <Alert variant="info">No runs yet.</Alert> : null}
          {history.map((run) => {
            const orderRefs = getOrderRefsFromSummary(run.summary);

            return (
              <div className="rounded-control border px-3 py-2" key={run.id}>
                <p className="text-sm font-semibold text-text">{run.sourceFilename ?? "(no filename)"}</p>
                <p className="text-xs text-text-muted">
                  {run.status} • rows {run.rowCount} • created {formatDateTime(run.createdAt)}
                </p>
                {run.errorText ? <p className="text-xs text-destructive">{run.errorText}</p> : null}
                {orderRefs.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {orderRefs.slice(0, 6).map((ref, index) => (
                      <Button
                        key={`${run.id}:${ref.orderId ?? ref.sourceOrderId ?? index}`}
                        onClick={() =>
                          openOrderPanel({
                            orgSlug,
                            orderId: ref.orderId ?? undefined,
                            sourceRef: ref.orderId ? undefined : ref.sourceOrderId ?? undefined
                          })
                        }
                        size="sm"
                        variant="secondary"
                      >
                        {ref.sourceOrderNo ?? ref.sourceOrderId ?? "View order"}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
