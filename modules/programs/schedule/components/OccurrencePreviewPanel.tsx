"use client";

import { CalendarDays, RotateCcw, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import type { ProgramOccurrence, ProgramScheduleException } from "@/modules/programs/types";

export type OccurrencePreviewFilter = "all" | "rule" | "manual" | "exceptions";

function formatOccurrenceDateTime(occurrence: ProgramOccurrence) {
  const startsAt = new Date(occurrence.startsAtUtc);
  const endsAt = new Date(occurrence.endsAtUtc);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return occurrence.localDate;
  }

  return `${startsAt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · ${startsAt.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit"
  })} - ${endsAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

function sourceChip(sourceType: ProgramOccurrence["sourceType"]) {
  if (sourceType === "manual") {
    return { label: "Manual", color: "yellow" as const };
  }
  if (sourceType === "override") {
    return { label: "Override", color: "neutral" as const };
  }
  return { label: "Rule", color: "green" as const };
}

function sortByStart(occurrences: ProgramOccurrence[]) {
  return [...occurrences].sort((a, b) => {
    const startA = new Date(a.startsAtUtc).getTime();
    const startB = new Date(b.startsAtUtc).getTime();
    return startA - startB;
  });
}

function summarizeException(exception: ProgramScheduleException) {
  const dateFromKey = exception.sourceKey.split(":")[2] ?? exception.sourceKey;
  return `${exception.kind === "skip" ? "Skipped" : "Overridden"} ${dateFromKey}`;
}

type OccurrencePreviewPanelProps = {
  occurrences: ProgramOccurrence[];
  exceptions: ProgramScheduleException[];
  summary: string;
  filter: OccurrencePreviewFilter;
  canWrite: boolean;
  isMutating: boolean;
  onFilterChange: (next: OccurrencePreviewFilter) => void;
  onEditOccurrence: (occurrenceId: string) => void;
  onSkipOccurrence: (occurrenceId: string) => void;
  onRestoreException: (ruleId: string, sourceKey: string) => void;
};

export function OccurrencePreviewPanel({
  occurrences,
  exceptions,
  summary,
  filter,
  canWrite,
  isMutating,
  onFilterChange,
  onEditOccurrence,
  onSkipOccurrence,
  onRestoreException
}: OccurrencePreviewPanelProps) {
  const filterItems: Array<{ value: OccurrencePreviewFilter; label: string }> = [
    { value: "all", label: "All" },
    { value: "rule", label: "Rule-based" },
    { value: "manual", label: "Manual" },
    { value: "exceptions", label: "Exceptions" }
  ];

  const filteredOccurrences = sortByStart(occurrences).filter((occurrence) => {
    if (filter === "all") {
      return true;
    }
    if (filter === "rule") {
      return occurrence.sourceType === "rule" || occurrence.sourceType === "override";
    }
    if (filter === "manual") {
      return occurrence.sourceType === "manual";
    }
    return false;
  });

  return (
    <Card className="border-border bg-surface">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" />
            Occurrence Preview
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1">
            {filterItems.map((item) => (
              <button
                className={
                  item.value === filter
                    ? "rounded-control border border-border bg-surface-muted px-2 py-1 text-xs font-semibold text-text"
                    : "rounded-control border border-border bg-surface px-2 py-1 text-xs font-semibold text-text-muted hover:text-text"
                }
                key={item.value}
                onClick={() => onFilterChange(item.value)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <CardDescription>{summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {filter === "exceptions" ? (
          exceptions.length === 0 ? (
            <p className="rounded-control border border-dashed border-border px-3 py-2 text-sm text-text-muted">No exceptions yet.</p>
          ) : (
            exceptions.map((exception) => (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border px-3 py-2" key={exception.id}>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-text">{summarizeException(exception)}</p>
                  <p className="text-xs text-text-muted">Key: {exception.sourceKey}</p>
                </div>
                <Button
                  disabled={!canWrite || isMutating}
                  onClick={() => onRestoreException(exception.ruleId, exception.sourceKey)}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restore
                </Button>
              </div>
            ))
          )
        ) : filteredOccurrences.length === 0 ? (
          <p className="rounded-control border border-dashed border-border px-3 py-2 text-sm text-text-muted">No occurrences for this filter.</p>
        ) : (
          filteredOccurrences.map((occurrence) => {
            const source = sourceChip(occurrence.sourceType);
            return (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border px-3 py-2" key={occurrence.id}>
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-semibold text-text">{occurrence.title || "Program session"}</p>
                  <p className="text-xs text-text-muted">{formatOccurrenceDateTime(occurrence)}</p>
                  <div className="flex items-center gap-2">
                    <Chip color={source.color} size="small">
                      {source.label}
                    </Chip>
                    <p className="text-[11px] text-text-muted">{occurrence.timezone}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button disabled={!canWrite || isMutating} onClick={() => onEditOccurrence(occurrence.id)} size="sm" type="button" variant="secondary">
                    Edit this only
                  </Button>
                  {occurrence.sourceType === "rule" ? (
                    <Button
                      disabled={!canWrite || isMutating}
                      onClick={() => onSkipOccurrence(occurrence.id)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <SkipForward className="h-3.5 w-3.5" />
                      Skip
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
