"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { Chip } from "@orgframe/ui/primitives/chip";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { Select } from "@orgframe/ui/primitives/select";
import { getAuditEventsCsv, getAuditEventsPage } from "@/src/features/audit/actions";
import type {
  AuditActorKind,
  AuditEventWithActor,
  AuditPage,
  AuditSource,
  AuditStatus
} from "@/src/features/audit/types";

type AuditLogPanelProps = {
  orgSlug: string;
  initialPage: AuditPage;
  /**
   * Optional pre-applied filter — used when this panel is embedded inside a
   * per-user profile so the table only shows actions involving that user.
   */
  scope?: {
    involvingUserId?: string;
    hideFilters?: boolean;
  };
};

const ACTOR_KIND_OPTIONS: Array<{ label: string; value: "" | AuditActorKind }> = [
  { label: "Any actor", value: "" },
  { label: "User", value: "user" },
  { label: "AI", value: "ai" },
  { label: "System", value: "system" }
];

const STATUS_OPTIONS: Array<{ label: string; value: "" | AuditStatus }> = [
  { label: "Any status", value: "" },
  { label: "Success", value: "success" },
  { label: "Failure", value: "failure" }
];

const SOURCE_OPTIONS: Array<{ label: string; value: "" | AuditSource }> = [
  { label: "Any source", value: "" },
  { label: "DB trigger", value: "trigger" },
  { label: "App", value: "app" },
  { label: "AI", value: "ai" },
  { label: "System", value: "system" }
];

function formatActor(event: AuditEventWithActor): string {
  if (event.actor) {
    const name = [event.actor.firstName, event.actor.lastName].filter(Boolean).join(" ").trim();
    return name || event.actor.email || event.actorUserId || "Unknown";
  }
  return event.actorUserId ?? (event.actorKind === "system" ? "System" : "Unknown");
}

function formatOnBehalfOf(event: AuditEventWithActor): string | null {
  if (!event.onBehalfOf && !event.onBehalfOfUserId) return null;
  if (event.onBehalfOf) {
    const name = [event.onBehalfOf.firstName, event.onBehalfOf.lastName].filter(Boolean).join(" ").trim();
    return name || event.onBehalfOf.email || event.onBehalfOfUserId;
  }
  return event.onBehalfOfUserId;
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export function AuditLogPanel({ orgSlug, initialPage, scope }: AuditLogPanelProps) {
  const [page, setPage] = useState<AuditPage>(initialPage);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [actorKind, setActorKind] = useState<"" | AuditActorKind>("");
  const [status, setStatus] = useState<"" | AuditStatus>("");
  const [source, setSource] = useState<"" | AuditSource>("");
  const [actionPrefix, setActionPrefix] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const filterPayload = useMemo(
    () => ({
      orgSlug,
      ...(scope?.involvingUserId ? { involvingUserId: scope.involvingUserId } : {}),
      ...(actorKind ? { actorKind } : {}),
      ...(status ? { status } : {}),
      ...(source ? { source } : {}),
      ...(actionPrefix.trim() ? { actionPrefix: actionPrefix.trim() } : {}),
      ...(fromDate ? { fromDate: new Date(fromDate).toISOString() } : {}),
      ...(toDate ? { toDate: new Date(toDate).toISOString() } : {})
    }),
    [actorKind, actionPrefix, fromDate, orgSlug, scope?.involvingUserId, source, status, toDate]
  );

  function reload(nextPage = 1) {
    setError(null);
    startTransition(async () => {
      try {
        const next = await getAuditEventsPage({ ...filterPayload, page: nextPage, pageSize: page.pageSize });
        setPage(next);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Failed to load audit log.");
      }
    });
  }

  function downloadCsv() {
    setError(null);
    startTransition(async () => {
      try {
        const csv = await getAuditEventsCsv(filterPayload);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `audit-${orgSlug}-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Failed to export audit log.");
      }
    });
  }

  const totalPages = Math.max(1, Math.ceil(page.total / page.pageSize));

  return (
    <section className="space-y-4">
      {!scope?.hideFilters ? (
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <FormField label="Actor">
            <Select
              options={ACTOR_KIND_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              value={actorKind}
              onChange={(event) => setActorKind(event.target.value as "" | AuditActorKind)}
            />
          </FormField>
          <FormField label="Status">
            <Select
              options={STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              value={status}
              onChange={(event) => setStatus(event.target.value as "" | AuditStatus)}
            />
          </FormField>
          <FormField label="Source">
            <Select
              options={SOURCE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              value={source}
              onChange={(event) => setSource(event.target.value as "" | AuditSource)}
            />
          </FormField>
          <FormField label="Action prefix">
            <Input
              placeholder="orgs."
              value={actionPrefix}
              onChange={(event) => setActionPrefix(event.target.value)}
            />
          </FormField>
          <FormField label="From">
            <Input
              type="datetime-local"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </FormField>
          <FormField label="To">
            <Input
              type="datetime-local"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </FormField>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => reload(1)} disabled={pending}>Apply filters</Button>
        <Button variant="ghost" onClick={downloadCsv} disabled={pending}>Export CSV</Button>
        <span className="ml-auto text-sm text-zinc-500">
          {page.total.toLocaleString()} event{page.total === 1 ? "" : "s"} · 1 year retention
        </span>
      </div>

      {error ? <Alert variant="destructive">{error}</Alert> : null}

      <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {page.events.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-zinc-500">
                  No audit events match these filters.
                </td>
              </tr>
            ) : (
              page.events.map((event) => {
                const onBehalf = formatOnBehalfOf(event);
                const isOpen = expandedId === event.id;
                return (
                  <Fragment key={event.id}>
                    <tr className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="px-3 py-2 whitespace-nowrap">{formatTimestamp(event.occurredAt)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{event.action}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span>{formatActor(event)}</span>
                          {event.actorKind === "ai" ? <Chip color="yellow">AI</Chip> : null}
                          {event.actorKind === "system" ? <Chip color="neutral">System</Chip> : null}
                        </div>
                        {onBehalf ? (
                          <div className="text-xs text-zinc-500">on behalf of {onBehalf}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-600">
                        {event.targetSchema ? `${event.targetSchema}.${event.targetTable ?? ""}` : "—"}
                        {event.targetId ? <div className="font-mono text-[11px] text-zinc-400">{event.targetId}</div> : null}
                      </td>
                      <td className="px-3 py-2">
                        <Chip color={event.status === "success" ? "green" : "red"}>{event.status}</Chip>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setExpandedId(isOpen ? null : event.id)}
                        >
                          {isOpen ? "Hide" : "Details"}
                        </Button>
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr className="bg-zinc-50 dark:bg-zinc-900/40">
                        <td colSpan={6} className="px-3 py-3">
                          <div className="space-y-2 text-xs">
                            {event.summary ? <p>{event.summary}</p> : null}
                            <div className="grid gap-3 md:grid-cols-2">
                              <pre className="overflow-auto rounded bg-zinc-100 p-2 dark:bg-zinc-900">
                                {JSON.stringify(event.diff ?? {}, null, 2)}
                              </pre>
                              <pre className="overflow-auto rounded bg-zinc-100 p-2 dark:bg-zinc-900">
                                {JSON.stringify(
                                  {
                                    metadata: event.metadata,
                                    request_id: event.requestId,
                                    source: event.source
                                  },
                                  null,
                                  2
                                )}
                              </pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-500">
          Page {page.page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            disabled={pending || page.page <= 1}
            onClick={() => reload(page.page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="ghost"
            disabled={pending || page.page >= totalPages}
            onClick={() => reload(page.page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </section>
  );
}
