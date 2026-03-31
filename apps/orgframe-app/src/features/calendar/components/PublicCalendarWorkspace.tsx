"use client";

import Link from "next/link";
import { Calendar } from "@/src/features/calendar/components/Calendar";
import { WorkspaceCardShell } from "@/src/features/core/layout/components/WorkspaceCardShell";
import type { CalendarPublicCatalogItem } from "@/src/features/calendar/types";

type PublicCalendarWorkspaceProps = {
  orgSlug: string;
  items: CalendarPublicCatalogItem[];
  title?: string;
};

export function PublicCalendarWorkspace({ orgSlug: _orgSlug, items, title = "Calendar" }: PublicCalendarWorkspaceProps) {
  const calendarItems = items.map((item) => ({
    id: item.occurrenceId,
    title: item.title,
    entryType: item.entryType,
    status: "scheduled" as const,
    startsAtUtc: item.startsAtUtc,
    endsAtUtc: item.endsAtUtc,
    timezone: item.timezone,
    summary: item.summary
  }));

  return (
    <WorkspaceCardShell contentClassName="space-y-3" title={title}>
      <Calendar canEdit={false} items={calendarItems} onSelectItem={() => {}} />
      <div className="space-y-2">
        {items.slice(0, 20).map((item) => (
          <article className="rounded-control border bg-surface px-3 py-2" key={item.occurrenceId}>
            <p className="font-semibold text-text">
              <Link className="hover:underline" href={`/calendar/${item.occurrenceId}`}>
                {item.title}
              </Link>
            </p>
            <p className="text-xs text-text-muted">
              {new Date(item.startsAtUtc).toLocaleString()} - {new Date(item.endsAtUtc).toLocaleString()}
            </p>
            {item.location ? <p className="text-xs text-text-muted">{item.location}</p> : null}
          </article>
        ))}
      </div>
    </WorkspaceCardShell>
  );
}
