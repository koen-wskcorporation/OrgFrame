import type {
  CalendarEntry,
  CalendarLensKind,
  CalendarLensState,
  CalendarPageContext,
  CalendarPurpose,
  CalendarReadModel,
  CalendarScopeType,
  CalendarSource,
  CalendarWhyShown
} from "@/src/features/calendar/types";

const DEFAULT_PURPOSES: CalendarPurpose[] = [
  "games",
  "practices",
  "tryouts",
  "season_dates",
  "meetings",
  "fundraisers",
  "facilities",
  "deadlines",
  "custom_other"
];

const DEFAULT_SCOPES: CalendarScopeType[] = ["organization", "program", "division", "team", "custom"];

export function defaultLensState(lens: CalendarLensKind = "mine"): CalendarLensState {
  return {
    lens,
    includeScopeTypes: [...DEFAULT_SCOPES],
    excludeSourceIds: [],
    includePurpose: [...DEFAULT_PURPOSES],
    audiencePerspective: "what_i_can_access",
    selectedLayerIds: [],
    pinnedLayerIds: [],
    isolatedLayerId: null,
    includeParentScopes: true,
    includeChildScopes: true,
    searchTerm: "",
    dateMode: "all",
    dateRange: {
      fromUtc: null,
      toUtc: null
    },
    savedViewId: null,
    savedViewName: null
  };
}

export function resolveDefaultLens(context: CalendarPageContext): CalendarLensKind {
  if (context.contextType === "public") {
    return "public";
  }
  if (context.contextType === "org") {
    return "mine";
  }
  return "this_page";
}

export function resolveAvailableScopeTypes(context: CalendarPageContext): CalendarScopeType[] {
  if (context.contextType === "public") {
    return ["organization", "program", "division", "team", "custom"];
  }
  if (context.contextType === "team") {
    return ["team", "division", "program", "organization", "custom"];
  }
  if (context.contextType === "division") {
    return ["division", "team", "program", "organization", "custom"];
  }
  if (context.contextType === "program") {
    return ["program", "division", "team", "organization", "custom"];
  }
  return ["organization", "program", "division", "team", "custom"];
}

function entryMatchesAudience(entry: CalendarEntry, perspective: CalendarLensState["audiencePerspective"]) {
  if (perspective === "what_i_can_access") {
    return true;
  }
  return entry.audience === perspective;
}

function entryMatchesSearch(entry: CalendarEntry, term: string) {
  const query = term.trim().toLowerCase();
  if (!query) {
    return true;
  }
  const haystack = `${entry.title} ${entry.summary ?? ""}`.toLowerCase();
  return haystack.includes(query);
}

function entryMatchesDateWindow(
  occurrenceWindow: { startsAtUtc: string; endsAtUtc: string },
  dateMode: CalendarLensState["dateMode"],
  range: CalendarLensState["dateRange"]
) {
  if (dateMode !== "range") {
    return true;
  }

  const fromMs = range.fromUtc ? new Date(range.fromUtc).getTime() : null;
  const toMs = range.toUtc ? new Date(range.toUtc).getTime() : null;
  const startMs = new Date(occurrenceWindow.startsAtUtc).getTime();
  const endMs = new Date(occurrenceWindow.endsAtUtc).getTime();

  if (fromMs && endMs < fromMs) {
    return false;
  }
  if (toMs && startMs > toMs) {
    return false;
  }
  return true;
}

export function resolveLensSourceIds(input: {
  lensState: CalendarLensState;
  context: CalendarPageContext;
  sources: CalendarSource[];
}): Set<string> {
  const { lensState, context, sources } = input;
  const available = sources.filter((source) => lensState.includeScopeTypes.includes(source.scopeType));

  if (lensState.lens === "public" || context.contextType === "public") {
    return new Set(available.map((source) => source.id));
  }

  if (lensState.lens === "this_page") {
    if (context.contextType === "team" && context.teamId) {
      const focusIds = new Set(
        available
          .filter((source) => source.scopeType === "team" && source.scopeId === context.teamId)
          .map((source) => source.id)
      );

      if (lensState.includeParentScopes) {
        for (const source of available) {
          if (source.scopeType === "division" || source.scopeType === "program" || source.scopeType === "organization") {
            focusIds.add(source.id);
          }
        }
      }

      return focusIds;
    }

    if (context.contextType === "program" && context.programId) {
      return new Set(
        available
          .filter((source) => {
            if (source.scopeType === "program" && source.scopeId === context.programId) {
              return true;
            }
            if (lensState.includeChildScopes && (source.scopeType === "division" || source.scopeType === "team")) {
              const sourceProgramId = typeof source.displayJson.programId === "string" ? source.displayJson.programId : null;
              return sourceProgramId === context.programId;
            }
            return source.scopeType === "organization";
          })
          .map((source) => source.id)
      );
    }
  }

  return new Set(available.map((source) => source.id));
}

export function filterCalendarReadModelByLens(input: {
  readModel: CalendarReadModel;
  sources: CalendarSource[];
  context: CalendarPageContext;
  lensState: CalendarLensState;
}): CalendarReadModel {
  const { readModel, sources, context, lensState } = input;
  const sourceIds = resolveLensSourceIds({ lensState, context, sources });
  const sourceIdToSource = new Map(sources.map((source) => [source.id, source]));

  if (lensState.isolatedLayerId) {
    sourceIds.clear();
    sourceIds.add(lensState.isolatedLayerId);
  }

  for (const excluded of lensState.excludeSourceIds) {
    sourceIds.delete(excluded);
  }

  const entries = readModel.entries.filter((entry) => {
    if (entry.sourceId && !sourceIds.has(entry.sourceId)) {
      return false;
    }
    if (!lensState.includePurpose.includes(entry.purpose)) {
      return false;
    }
    if (!entryMatchesAudience(entry, lensState.audiencePerspective)) {
      return false;
    }
    if (!entryMatchesSearch(entry, lensState.searchTerm)) {
      return false;
    }
    if (lensState.lens === "public" && entry.audience !== "public") {
      return false;
    }

    const source = entry.sourceId ? sourceIdToSource.get(entry.sourceId) ?? null : null;
    if (source && !lensState.includeScopeTypes.includes(source.scopeType)) {
      return false;
    }

    return true;
  });

  const entryIds = new Set(entries.map((entry) => entry.id));
  const occurrences = readModel.occurrences.filter((occurrence) => {
    if (!entryIds.has(occurrence.entryId)) {
      return false;
    }
    return entryMatchesDateWindow(occurrence, lensState.dateMode, lensState.dateRange);
  });

  const occurrenceIds = new Set(occurrences.map((occurrence) => occurrence.id));

  return {
    ...readModel,
    entries,
    occurrences,
    rules: readModel.rules.filter((rule) => entryIds.has(rule.entryId)),
    exceptions: readModel.exceptions.filter((exception) => readModel.rules.some((rule) => rule.id === exception.ruleId && entryIds.has(rule.entryId))),
    allocations: readModel.allocations.filter((allocation) => occurrenceIds.has(allocation.occurrenceId)),
    ruleAllocations: readModel.ruleAllocations.filter((allocation) => readModel.rules.some((rule) => rule.id === allocation.ruleId && entryIds.has(rule.entryId))),
    invites: readModel.invites.filter((invite) => occurrenceIds.has(invite.occurrenceId)),
    sources: readModel.sources.filter((source) => sourceIds.has(source.id) || lensState.pinnedLayerIds.includes(source.id))
  };
}

export function explainOccurrenceVisibility(input: {
  occurrenceId: string;
  readModel: CalendarReadModel;
  sources: CalendarSource[];
  lensState: CalendarLensState;
}): CalendarWhyShown | null {
  const occurrence = input.readModel.occurrences.find((item) => item.id === input.occurrenceId) ?? null;
  if (!occurrence) {
    return null;
  }
  const entry = input.readModel.entries.find((item) => item.id === occurrence.entryId) ?? null;
  if (!entry) {
    return null;
  }

  const source = entry.sourceId ? input.sources.find((item) => item.id === entry.sourceId) ?? null : null;
  const reasonCodes: string[] = ["included_by_lens"];

  if (source) {
    reasonCodes.push(`scope:${source.scopeType}`);
  }
  reasonCodes.push(`purpose:${entry.purpose}`);
  reasonCodes.push(`audience:${entry.audience}`);

  if (input.lensState.includeParentScopes) {
    reasonCodes.push("parent_scopes_enabled");
  }
  if (input.lensState.includeChildScopes) {
    reasonCodes.push("child_scopes_enabled");
  }

  return {
    occurrenceId: occurrence.id,
    entryId: entry.id,
    sourceId: entry.sourceId,
    sourceName: source?.name ?? null,
    scopeType: source?.scopeType ?? null,
    purpose: entry.purpose,
    audience: entry.audience,
    reasonCodes
  };
}
