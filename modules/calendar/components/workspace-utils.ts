import type { CalendarOccurrence, CalendarReadModel, CalendarVisibility, CalendarEntryType } from "@/modules/calendar/types";
import type { UnifiedCalendarItem } from "@/components/calendar/UnifiedCalendar";

export function findOccurrence(readModel: CalendarReadModel, occurrenceId: string) {
  return readModel.occurrences.find((item) => item.id === occurrenceId) ?? null;
}

export function findEntryForOccurrence(readModel: CalendarReadModel, occurrence: CalendarOccurrence) {
  return readModel.entries.find((entry) => entry.id === occurrence.entryId) ?? null;
}

export function occurrenceToCalendarItem(readModel: CalendarReadModel, occurrence: CalendarOccurrence): UnifiedCalendarItem | null {
  const entry = findEntryForOccurrence(readModel, occurrence);
  if (!entry) {
    return null;
  }

  return {
    id: occurrence.id,
    title: entry.title,
    entryType: entry.entryType,
    status: occurrence.status,
    startsAtUtc: occurrence.startsAtUtc,
    endsAtUtc: occurrence.endsAtUtc,
    timezone: occurrence.timezone,
    summary: entry.summary
  };
}

export function toCalendarItems(readModel: CalendarReadModel, options?: { visibility?: CalendarVisibility; entryTypes?: CalendarEntryType[] }) {
  const entryTypeFilter = options?.entryTypes ? new Set(options.entryTypes) : null;

  return readModel.occurrences
    .filter((occurrence) => {
      const entry = findEntryForOccurrence(readModel, occurrence);
      if (!entry) {
        return false;
      }

      if (options?.visibility && entry.visibility !== options.visibility) {
        return false;
      }

      if (entryTypeFilter && !entryTypeFilter.has(entry.entryType)) {
        return false;
      }

      return true;
    })
    .map((occurrence) => occurrenceToCalendarItem(readModel, occurrence))
    .filter((item): item is UnifiedCalendarItem => Boolean(item));
}

export function toLocalParts(isoUtc: string, timezone: string) {
  const date = new Date(isoUtc);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return {
    localDate: `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`,
    localTime: `${byType.get("hour")}:${byType.get("minute")}`
  };
}
