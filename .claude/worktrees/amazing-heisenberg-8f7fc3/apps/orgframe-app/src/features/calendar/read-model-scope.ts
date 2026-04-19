import type { CalendarReadModel } from "@/src/features/calendar/types";

type ScopeInput = {
  readModel: CalendarReadModel;
  programId?: string;
  divisionId?: string;
  teamId?: string;
};

export function scopeCalendarReadModelByContext(input: ScopeInput): CalendarReadModel {
  const { readModel, programId, divisionId, teamId } = input;
  if (!programId && !divisionId && !teamId) {
    return readModel;
  }

  const sourceById = new Map(readModel.sources.map((source) => [source.id, source]));
  const allowedSourceIds = new Set<string>();

  for (const source of readModel.sources) {
    if (source.scopeType === "organization" || source.scopeType === "custom") {
      allowedSourceIds.add(source.id);
      continue;
    }

    if (teamId) {
      if (source.scopeType === "team" && source.scopeId === teamId) {
        allowedSourceIds.add(source.id);
        continue;
      }
      continue;
    }

    if (divisionId) {
      if (source.scopeType === "division" && source.scopeId === divisionId) {
        allowedSourceIds.add(source.id);
        continue;
      }
      const sourceDivisionId = typeof source.displayJson.divisionId === "string" ? source.displayJson.divisionId : null;
      if (source.scopeType === "team" && sourceDivisionId === divisionId) {
        allowedSourceIds.add(source.id);
        continue;
      }
      continue;
    }

    if (programId) {
      if (source.scopeType === "program" && source.scopeId === programId) {
        allowedSourceIds.add(source.id);
        continue;
      }
      const sourceProgramId = typeof source.displayJson.programId === "string" ? source.displayJson.programId : null;
      if ((source.scopeType === "division" || source.scopeType === "team") && sourceProgramId === programId) {
        allowedSourceIds.add(source.id);
      }
    }
  }

  for (const sourceId of Array.from(allowedSourceIds)) {
    let cursor = sourceById.get(sourceId);
    while (cursor?.parentSourceId) {
      allowedSourceIds.add(cursor.parentSourceId);
      cursor = sourceById.get(cursor.parentSourceId);
    }
  }

  const entries = readModel.entries.filter((entry) => !entry.sourceId || allowedSourceIds.has(entry.sourceId));
  const entryIds = new Set(entries.map((entry) => entry.id));
  const occurrences = readModel.occurrences.filter((occurrence) => entryIds.has(occurrence.entryId));
  const occurrenceIds = new Set(occurrences.map((occurrence) => occurrence.id));
  const rules = readModel.rules.filter((rule) => entryIds.has(rule.entryId));
  const ruleIds = new Set(rules.map((rule) => rule.id));

  return {
    ...readModel,
    sources: readModel.sources.filter((source) => allowedSourceIds.has(source.id)),
    entries,
    occurrences,
    rules,
    exceptions: readModel.exceptions.filter((exception) => ruleIds.has(exception.ruleId)),
    allocations: readModel.allocations.filter((allocation) => occurrenceIds.has(allocation.occurrenceId)),
    ruleAllocations: readModel.ruleAllocations.filter((allocation) => ruleIds.has(allocation.ruleId)),
    invites: readModel.invites.filter((invite) => occurrenceIds.has(invite.occurrenceId))
  };
}
