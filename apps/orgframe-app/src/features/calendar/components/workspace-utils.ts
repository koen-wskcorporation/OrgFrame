import type { CalendarOccurrence, CalendarReadModel, CalendarSource, CalendarVisibility, CalendarEntryType } from "@/src/features/calendar/types";
import type { CalendarItem } from "@/src/features/calendar/components/Calendar";

export function findOccurrence(readModel: CalendarReadModel, occurrenceId: string) {
  return readModel.occurrences.find((item) => item.id === occurrenceId) ?? null;
}

export function findEntryForOccurrence(readModel: CalendarReadModel, occurrence: CalendarOccurrence) {
  return readModel.entries.find((entry) => entry.id === occurrence.entryId) ?? null;
}

function normalizeTeamChipLabel(label: string) {
  return label
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .join("/");
}

function resolveOccurrenceTeamChips(
  readModel: CalendarReadModel,
  occurrence: CalendarOccurrence,
  entryHostTeamId: string | null,
  teamLabelById: Map<string, string> | undefined
) {
  if (!teamLabelById || teamLabelById.size === 0) {
    return [];
  }

  const teamIds: string[] = [];
  if (entryHostTeamId) {
    teamIds.push(entryHostTeamId);
  }

  for (const invite of readModel.invites) {
    if (invite.occurrenceId !== occurrence.id) {
      continue;
    }
    if (invite.inviteStatus !== "accepted" && invite.inviteStatus !== "pending") {
      continue;
    }
    teamIds.push(invite.teamId);
  }

  const seen = new Set<string>();
  const chips: string[] = [];
  for (const teamId of teamIds) {
    if (!teamId || seen.has(teamId)) {
      continue;
    }
    seen.add(teamId);
    const label = teamLabelById.get(teamId);
    if (!label) {
      continue;
    }
    const normalized = normalizeTeamChipLabel(label);
    if (!normalized) {
      continue;
    }
    chips.push(normalized);
  }

  return chips;
}

export function buildTeamLabelById(teams: Array<{ id: string; label: string }>) {
  const map = new Map<string, string>();
  for (const team of teams) {
    const label = normalizeTeamChipLabel(team.label);
    if (!team.id || !label) {
      continue;
    }
    map.set(team.id, label);
  }
  return map;
}

export function occurrenceToCalendarItem(
  readModel: CalendarReadModel,
  occurrence: CalendarOccurrence,
  options?: { teamLabelById?: Map<string, string> }
): CalendarItem | null {
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
    summary: entry.summary,
    teamChips: resolveOccurrenceTeamChips(readModel, occurrence, entry.hostTeamId, options?.teamLabelById)
  };
}

export function toCalendarItems(
  readModel: CalendarReadModel,
  options?: { visibility?: CalendarVisibility; entryTypes?: CalendarEntryType[]; teamLabelById?: Map<string, string> }
) {
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
    .map((occurrence) => occurrenceToCalendarItem(readModel, occurrence, { teamLabelById: options?.teamLabelById }))
    .filter((item): item is CalendarItem => Boolean(item));
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

export function buildInitialSelectedSourceIds(sources: CalendarSource[]) {
  return new Set(sources.filter((source) => source.isActive).map((source) => source.id));
}

export function filterCalendarReadModelBySelectedSources(readModel: CalendarReadModel, selectedSourceIds: Set<string>): CalendarReadModel {
  const selectedEntries = readModel.entries.filter((entry) => {
    if (!entry.sourceId) {
      return true;
    }
    return selectedSourceIds.has(entry.sourceId);
  });
  const entryIds = new Set(selectedEntries.map((entry) => entry.id));

  const selectedOccurrences = readModel.occurrences.filter((occurrence) => entryIds.has(occurrence.entryId));
  const occurrenceIds = new Set(selectedOccurrences.map((occurrence) => occurrence.id));

  const selectedRules = readModel.rules.filter((rule) => entryIds.has(rule.entryId));
  const ruleIds = new Set(selectedRules.map((rule) => rule.id));

  return {
    ...readModel,
    entries: selectedEntries,
    occurrences: selectedOccurrences,
    rules: selectedRules,
    exceptions: readModel.exceptions.filter((exception) => ruleIds.has(exception.ruleId)),
    allocations: readModel.allocations.filter((allocation) => occurrenceIds.has(allocation.occurrenceId)),
    ruleAllocations: readModel.ruleAllocations.filter((allocation) => ruleIds.has(allocation.ruleId)),
    invites: readModel.invites.filter((invite) => occurrenceIds.has(invite.occurrenceId)),
    sources: readModel.sources.filter((source) => selectedSourceIds.has(source.id))
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
