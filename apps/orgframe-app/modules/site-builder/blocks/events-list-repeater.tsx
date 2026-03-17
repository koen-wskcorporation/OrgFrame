"use client";

import Link from "next/link";
import { Repeater } from "@orgframe/ui/ui/repeater";

type EventsListItem = {
  occurrenceId: string;
  title: string;
  rangeLabel: string;
  location: string | null;
  summary: string | null;
  href: string;
};

type EventsListRepeaterProps = {
  items: EventsListItem[];
};

export function EventsListRepeater({ items }: EventsListRepeaterProps) {
  return (
    <Repeater
      emptyMessage="No events are scheduled right now."
      getItemKey={(item) => item.occurrenceId}
      getSearchValue={(item) => `${item.title} ${item.rangeLabel} ${item.location ?? ""} ${item.summary ?? ""}`}
      items={items}
      searchPlaceholder="Search events"
      renderItem={({ item }) => (
        <article className="rounded-control border bg-surface px-3 py-3">
          <h3 className="font-semibold text-text">
            <Link className="hover:underline" href={item.href}>
              {item.title}
            </Link>
          </h3>
          <p className="text-xs text-text-muted">{item.rangeLabel}</p>
          {item.location ? <p className="mt-1 text-xs text-text-muted">{item.location}</p> : null}
          {item.summary ? <p className="mt-2 text-sm text-text-muted">{item.summary}</p> : null}
        </article>
      )}
    />
  );
}
