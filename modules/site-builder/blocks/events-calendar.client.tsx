"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EventCatalogItem } from "@/modules/events/types";

type CalendarView = "month" | "week" | "day";

type EventsCalendarClientProps = {
  orgSlug: string;
  events: EventCatalogItem[];
  initialView: CalendarView;
  emptyMessage: string;
};

type EventRange = {
  start: Date;
  endExclusive: Date;
};

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, amount: number) {
  const next = new Date(value.getTime());
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeek(value: Date) {
  return addDays(startOfDay(value), -startOfDay(value).getDay());
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function parseIsoDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number.parseInt(yearRaw ?? "", 10);
  const month = Number.parseInt(monthRaw ?? "", 10);
  const day = Number.parseInt(dayRaw ?? "", 10);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);

  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
    return null;
  }

  return parsed;
}

function toEventRange(event: EventCatalogItem): EventRange | null {
  if (event.isAllDay && event.allDayStartDate && event.allDayEndDate) {
    const startDate = parseIsoDate(event.allDayStartDate);
    const endDate = parseIsoDate(event.allDayEndDate);

    if (!startDate || !endDate) {
      return null;
    }

    return {
      start: startOfDay(startDate),
      endExclusive: addDays(startOfDay(endDate), 1)
    };
  }

  const start = new Date(event.startsAtUtc);
  const end = new Date(event.endsAtUtc);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    return null;
  }

  return {
    start,
    endExclusive: end
  };
}

function intersectsDay(range: EventRange, day: Date) {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);

  return range.start.getTime() < dayEnd.getTime() && range.endExclusive.getTime() > dayStart.getTime();
}

function formatDateLabel(value: Date) {
  return value.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function formatMonthLabel(value: Date) {
  return value.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });
}

function isSameLocalDate(a: Date, b: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(a) === formatter.format(b);
}

function formatEventTimeLabel(event: EventCatalogItem) {
  if (event.isAllDay) {
    return "All day";
  }

  const start = new Date(event.startsAtUtc);
  const end = new Date(event.endsAtUtc);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Time unavailable";
  }

  const sameDate = isSameLocalDate(start, end, event.timezone);

  if (sameDate) {
    const timeFormatter = new Intl.DateTimeFormat(undefined, {
      timeZone: event.timezone,
      hour: "numeric",
      minute: "2-digit"
    });

    return `${timeFormatter.format(start)} to ${timeFormatter.format(end)}`;
  }

  const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
    timeZone: event.timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

  return `${dateTimeFormatter.format(start)} to ${dateTimeFormatter.format(end)}`;
}

function EventItem({ event, orgSlug }: { event: EventCatalogItem; orgSlug: string }) {
  return (
    <article className="rounded-control border bg-surface px-3 py-2">
      <p className="font-semibold text-text">
        <Link className="hover:underline" href={`/${orgSlug}/events/${event.id}`}>
          {event.title}
        </Link>
      </p>
      <p className="text-xs text-text-muted">{formatEventTimeLabel(event)}</p>
      {event.location ? <p className="mt-1 text-xs text-text-muted">{event.location}</p> : null}
      {event.summary ? <p className="mt-1 text-sm text-text-muted">{event.summary}</p> : null}
    </article>
  );
}

export function EventsCalendarClient({ orgSlug, events, initialView, emptyMessage }: EventsCalendarClientProps) {
  const [view, setView] = useState<CalendarView>(initialView);
  const [anchorDate, setAnchorDate] = useState<Date>(() => startOfDay(new Date()));

  const ranges = useMemo(() => {
    return events
      .map((event) => {
        const range = toEventRange(event);

        if (!range) {
          return null;
        }

        return {
          event,
          range
        };
      })
      .filter((entry): entry is { event: EventCatalogItem; range: EventRange } => Boolean(entry));
  }, [events]);

  const eventsForDay = (day: Date) => {
    return ranges
      .filter((entry) => intersectsDay(entry.range, day))
      .sort((a, b) => {
        if (a.event.isAllDay !== b.event.isAllDay) {
          return a.event.isAllDay ? -1 : 1;
        }

        if (a.range.start.getTime() !== b.range.start.getTime()) {
          return a.range.start.getTime() - b.range.start.getTime();
        }

        return a.event.title.localeCompare(b.event.title);
      })
      .map((entry) => entry.event);
  };

  const monthAnchor = startOfMonth(anchorDate);
  const monthGridStart = startOfWeek(monthAnchor);
  const monthDays = Array.from({ length: 42 }, (_, index) => addDays(monthGridStart, index));

  const weekStart = startOfWeek(anchorDate);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  function goToPrevious() {
    if (view === "month") {
      setAnchorDate(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() - 1, 1));
      return;
    }

    if (view === "week") {
      setAnchorDate(addDays(anchorDate, -7));
      return;
    }

    setAnchorDate(addDays(anchorDate, -1));
  }

  function goToNext() {
    if (view === "month") {
      setAnchorDate(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1));
      return;
    }

    if (view === "week") {
      setAnchorDate(addDays(anchorDate, 7));
      return;
    }

    setAnchorDate(addDays(anchorDate, 1));
  }

  const heading =
    view === "month"
      ? formatMonthLabel(monthAnchor)
      : view === "week"
        ? `${formatDateLabel(weekDays[0])} to ${formatDateLabel(weekDays[6])}`
        : formatDateLabel(anchorDate);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-control border bg-surface p-1">
          {(["month", "week", "day"] as const).map((item) => (
            <button
              className={cn(
                "rounded-control px-2 py-1 text-xs font-semibold transition-colors",
                view === item ? "bg-surface-muted text-text" : "text-text-muted hover:bg-surface-muted hover:text-text"
              )}
              key={item}
              onClick={() => setView(item)}
              type="button"
            >
              {item.charAt(0).toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>

        <div className="ml-auto inline-flex items-center gap-1 rounded-control border bg-surface p-1">
          <button
            aria-label="Previous range"
            className="inline-flex h-8 w-8 items-center justify-center rounded-control text-text-muted hover:bg-surface-muted hover:text-text"
            onClick={goToPrevious}
            type="button"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            className="rounded-control px-2 py-1 text-xs font-semibold text-text-muted hover:bg-surface-muted hover:text-text"
            onClick={() => setAnchorDate(startOfDay(new Date()))}
            type="button"
          >
            Today
          </button>
          <button
            aria-label="Next range"
            className="inline-flex h-8 w-8 items-center justify-center rounded-control text-text-muted hover:bg-surface-muted hover:text-text"
            onClick={goToNext}
            type="button"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <p className="text-sm font-semibold text-text">{heading}</p>

      {events.length === 0 ? <p className="rounded-control border bg-surface-muted/40 px-3 py-2 text-sm text-text-muted">{emptyMessage}</p> : null}

      {view === "month" ? (
        <div className="space-y-1">
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
              <p key={weekday}>{weekday}</p>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthDays.map((day) => {
              const dayEvents = eventsForDay(day);
              const inMonth = day.getMonth() === monthAnchor.getMonth();

              return (
                <button
                  className={cn(
                    "min-h-[88px] rounded-control border p-1.5 text-left transition-colors",
                    inMonth ? "bg-surface" : "bg-surface-muted/40 text-text-muted"
                  )}
                  key={`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`}
                  onClick={() => {
                    setAnchorDate(day);
                    setView("day");
                  }}
                  type="button"
                >
                  <p className="text-xs font-semibold text-text">{day.getDate()}</p>
                  <div className="mt-1 space-y-1">
                    {dayEvents.slice(0, 2).map((eventItem) => (
                      <p className="truncate rounded-control bg-surface-muted px-1.5 py-0.5 text-[10px] text-text-muted" key={eventItem.id}>
                        {eventItem.title}
                      </p>
                    ))}
                    {dayEvents.length > 2 ? <p className="text-[10px] text-text-muted">+{dayEvents.length - 2} more</p> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {view === "week" ? (
        <div className="grid gap-2 md:grid-cols-7">
          {weekDays.map((day) => {
            const dayEvents = eventsForDay(day);

            return (
              <section className="space-y-2 rounded-control border bg-surface p-2" key={`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`}>
                <button
                  className="text-left text-xs font-semibold text-text hover:underline"
                  onClick={() => {
                    setAnchorDate(day);
                    setView("day");
                  }}
                  type="button"
                >
                  {day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                </button>
                <div className="space-y-2">
                  {dayEvents.length === 0 ? <p className="text-xs text-text-muted">No events</p> : null}
                  {dayEvents.map((eventItem) => (
                    <EventItem event={eventItem} key={eventItem.id} orgSlug={orgSlug} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}

      {view === "day" ? (
        <div className="space-y-2">
          {eventsForDay(anchorDate).length === 0 ? <p className="text-sm text-text-muted">{emptyMessage}</p> : null}
          {eventsForDay(anchorDate).map((eventItem) => (
            <EventItem event={eventItem} key={eventItem.id} orgSlug={orgSlug} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
