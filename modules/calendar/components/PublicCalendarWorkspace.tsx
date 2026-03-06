"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UnifiedCalendar } from "@/components/calendar/UnifiedCalendar";
import type { CalendarPublicCatalogItem } from "@/modules/calendar/types";

type PublicCalendarWorkspaceProps = {
  orgSlug: string;
  items: CalendarPublicCatalogItem[];
  title?: string;
};

export function PublicCalendarWorkspace({ orgSlug, items, title = "Calendar" }: PublicCalendarWorkspaceProps) {
  const unifiedItems = items.map((item) => ({
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
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <UnifiedCalendar canEdit={false} items={unifiedItems} onSelectItem={() => {}} />
        <div className="space-y-2">
          {items.slice(0, 20).map((item) => (
            <article className="rounded-control border bg-surface px-3 py-2" key={item.occurrenceId}>
              <p className="font-semibold text-text">
                <Link className="hover:underline" href={`/${orgSlug}/calendar/${item.occurrenceId}`}>
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
      </CardContent>
    </Card>
  );
}
