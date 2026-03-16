import type { CalendarOccurrence, CalendarReadModel, CalendarVisibility, CalendarEntryType } from "@/modules/calendar/types";
import type { UnifiedCalendarItem } from "@orgframe/ui/calendar/UnifiedCalendar";

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

type IdReplacement = {
  from: string;
  to: string;
};

export function replaceOptimisticIds(
  readModel: CalendarReadModel,
  replacements: {
    entryId?: IdReplacement;
    occurrenceId?: IdReplacement;
  }
) {
  const { entryId, occurrenceId } = replacements;

  const nextEntries = entryId
    ? readModel.entries.map((entry) => (entry.id === entryId.from ? { ...entry, id: entryId.to } : entry))
    : readModel.entries;

  const nextOccurrences = readModel.occurrences.map((occurrence) => {
    if (occurrenceId && occurrence.id === occurrenceId.from) {
      const updatedEntryId = entryId && occurrence.entryId === entryId.from ? entryId.to : occurrence.entryId;
      return {
        ...occurrence,
        id: occurrenceId.to,
        entryId: updatedEntryId
      };
    }

    if (entryId && occurrence.entryId === entryId.from) {
      return {
        ...occurrence,
        entryId: entryId.to
      };
    }

    return occurrence;
  });

  const nextAllocations = occurrenceId
    ? readModel.allocations.map((allocation) =>
        allocation.occurrenceId === occurrenceId.from ? { ...allocation, occurrenceId: occurrenceId.to } : allocation
      )
    : readModel.allocations;

  const nextInvites = occurrenceId
    ? readModel.invites.map((invite) => (invite.occurrenceId === occurrenceId.from ? { ...invite, occurrenceId: occurrenceId.to } : invite))
    : readModel.invites;

  return {
    ...readModel,
    entries: nextEntries,
    occurrences: nextOccurrences,
    allocations: nextAllocations,
    invites: nextInvites
  };
}
