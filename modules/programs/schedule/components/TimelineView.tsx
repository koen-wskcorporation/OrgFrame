"use client";

import { Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import type { ProgramOccurrence } from "@/modules/programs/types";

function monthKey(dateValue: string) {
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return "Upcoming";
  }
  return parsed.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function formatLine(occurrence: ProgramOccurrence) {
  const startsAt = new Date(occurrence.startsAtUtc);
  const endsAt = new Date(occurrence.endsAtUtc);

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return occurrence.localDate;
  }

  return `${startsAt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${startsAt.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit"
  })} - ${endsAt.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit"
  })}`;
}

function sourceColor(sourceType: ProgramOccurrence["sourceType"]) {
  if (sourceType === "rule") {
    return "green" as const;
  }
  if (sourceType === "manual") {
    return "yellow" as const;
  }
  return "neutral" as const;
}

type TimelineViewProps = {
  occurrences: ProgramOccurrence[];
  canWrite: boolean;
  isMutating: boolean;
  onEditOccurrence: (occurrenceId: string) => void;
};

export function TimelineView({ occurrences, canWrite, isMutating, onEditOccurrence }: TimelineViewProps) {
  const sorted = [...occurrences].sort((a, b) => new Date(a.startsAtUtc).getTime() - new Date(b.startsAtUtc).getTime());
  const groups = new Map<string, ProgramOccurrence[]>();

  for (const occurrence of sorted) {
    const key = monthKey(occurrence.startsAtUtc);
    const current = groups.get(key) ?? [];
    current.push(occurrence);
    groups.set(key, current);
  }

  return (
    <Card className="border-border bg-surface">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock3 className="h-4 w-4" />
          Timeline
        </CardTitle>
        <CardDescription>Upcoming sessions grouped by month.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sorted.length === 0 ? <p className="text-sm text-text-muted">No upcoming sessions yet.</p> : null}
        {Array.from(groups.entries()).map(([group, groupOccurrences]) => (
          <div className="space-y-2" key={group}>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{group}</p>
            {groupOccurrences.map((occurrence) => (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border px-3 py-2" key={occurrence.id}>
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-semibold text-text">{occurrence.title || "Program session"}</p>
                  <p className="text-xs text-text-muted">{formatLine(occurrence)}</p>
                  <Chip color={sourceColor(occurrence.sourceType)} size="small">
                    {occurrence.sourceType}
                  </Chip>
                </div>
                <Button disabled={!canWrite || isMutating} onClick={() => onEditOccurrence(occurrence.id)} size="sm" type="button" variant="secondary">
                  Edit
                </Button>
              </div>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
