"use server";

import { randomUUID, createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { rethrowIfNavigationError } from "@/src/shared/navigation/rethrowIfNavigationError";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { can } from "@/src/shared/permissions/can";
import { createSupabaseServer } from "@/src/shared/data-api/server";
import {
  createCalendarEntryRecord,
  deleteCalendarLensView,
  createFacilitySpaceConfiguration,
  deleteCalendarEntryRecord,
  deleteCalendarOccurrenceRecord,
  deleteCalendarRuleRecord,
  deleteCalendarRuleException,
  getCalendarEntryById,
  getCalendarOccurrenceById,
  getCalendarRuleById,
  getOccurrenceTeamInvite,
  getOrCreateDefaultFacilitySpaceConfiguration,
  insertCalendarOccurrenceRecord,
  listCalendarEntries,
  listCalendarOccurrences,
  listCalendarOccurrencesByRule,
  listCalendarReadModel,
  listCalendarLensSavedViews,
  listCalendarRules,
  listCalendarRuleFacilityAllocations,
  listCalendarRuleExceptions,
  listFacilitySpaceConfigurations,
  listOccurrenceTeamInvites,
  listOccurrenceFacilityAllocations,
  listOrgActiveTeams,
  replaceCalendarRuleFacilityAllocations,
  replaceOccurrenceFacilityAllocations,
  setCalendarOccurrenceStatus,
  setCalendarOccurrenceStatusBySourceKey,
  updateCalendarEntryRecord,
  updateCalendarOccurrenceRecord,
  saveCalendarLensView,
  upsertCalendarRuleException,
  upsertCalendarRuleRecord,
  upsertCalendarSource,
  upsertOccurrenceFacilityAllocation,
  upsertOccurrenceTeamInvite,
  upsertRuleGeneratedOccurrences
} from "@/src/features/calendar/db/queries";
import { listFacilityReservationReadModel } from "@/src/features/facilities/db/queries";
import { notifyInviteResponded, notifyInviteSent, notifyOccurrenceCancelled } from "@/src/features/calendar/notifications";
import { generateOccurrencesForRule, zonedLocalToUtc } from "@/src/features/calendar/rule-engine";
import { defaultLensState, explainOccurrenceVisibility, filterCalendarReadModelByLens } from "@/src/features/calendar/lens";
import type {
  CalendarAudience,
  CalendarEntry,
  CalendarEntryStatus,
  CalendarEntryType,
  CalendarIntervalUnit,
  CalendarOccurrenceStatus,
  CalendarLensState,
  CalendarPageContext,
  CalendarPageContextType,
  CalendarPurpose,
  CalendarReadModel,
  CalendarRuleEndMode,
  CalendarRuleMode,
  FacilityLockMode
} from "@/src/features/calendar/types";

const textSchema = z.string().trim();
const localDateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);

type CalendarActionResult<TData = undefined, TErrorDetails = undefined> =
  | {
      ok: true;
      data: TData;
    }
  | {
      ok: false;
      error: string;
      details?: TErrorDetails;
    };

function asError<TErrorDetails = undefined>(error: string, details?: TErrorDetails): CalendarActionResult<never, TErrorDetails> {
  return {
    ok: false,
    error,
    details
  };
}

function normalizeOptional(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeDate(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, 10);
}

function shiftLocalDate(input: string, days: number) {
  const [yearRaw, monthRaw, dayRaw] = input.split("-");
  const year = Number.parseInt(yearRaw ?? "", 10);
  const month = Number.parseInt(monthRaw ?? "", 10);
  const day = Number.parseInt(dayRaw ?? "", 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return input;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${`${date.getUTCMonth() + 1}`.padStart(2, "0")}-${`${date.getUTCDate()}`.padStart(2, "0")}`;
}

function resolveOriginalSourceKey(value: string): string {
  if (!value.startsWith("override:")) {
    return value;
  }
  const withoutPrefix = value.slice("override:".length);
  const lastColon = withoutPrefix.lastIndexOf(":");
  if (lastColon <= 0) {
    return withoutPrefix || value;
  }
  return withoutPrefix.slice(0, lastColon);
}

function resolveTimezone(value: string | null | undefined) {
  const fallback = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const candidate = value?.trim();

  if (!candidate) {
    return fallback;
  }

  try {
    Intl.DateTimeFormat(undefined, { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return fallback;
  }
}

function normalizeLocalWindow(input: {
  localDate: string;
  localStartTime?: string | null;
  localEndTime?: string | null;
  timezone: string;
}) {
  const localStartTime = normalizeOptional(input.localStartTime) ?? "00:00";
  const localEndTime = normalizeOptional(input.localEndTime) ?? "23:59";
  const startsAtUtc = zonedLocalToUtc(input.localDate, localStartTime, input.timezone).toISOString();
  let endsAtUtc = zonedLocalToUtc(input.localDate, localEndTime, input.timezone).toISOString();

  if (new Date(endsAtUtc).getTime() <= new Date(startsAtUtc).getTime()) {
    endsAtUtc = new Date(new Date(startsAtUtc).getTime() + 60 * 60 * 1000).toISOString();
  }

  return {
    localStartTime,
    localEndTime,
    startsAtUtc,
    endsAtUtc
  };
}

function buildRuleHash(payload: Record<string, unknown>) {
  return createHash("sha1").update(JSON.stringify(payload)).digest("hex");
}

function windowsOverlap(startsAtUtc: string, endsAtUtc: string, otherStartUtc: string, otherEndUtc: string) {
  const start = new Date(startsAtUtc).getTime();
  const end = new Date(endsAtUtc).getTime();
  const otherStart = new Date(otherStartUtc).getTime();
  const otherEnd = new Date(otherEndUtc).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(otherStart) || !Number.isFinite(otherEnd)) {
    return false;
  }
  return start < otherEnd && end > otherStart;
}

async function resolveAllocationInputs(
  orgId: string,
  actorUserId: string,
  allocations: z.infer<typeof allocationItemSchema>[]
) {
  const configurations = await listFacilitySpaceConfigurations(orgId, { includeInactive: true });
  const configById = new Map(configurations.map((config) => [config.id, config]));

  const resolved: Array<{
    spaceId: string;
    configurationId: string;
    lockMode: FacilityLockMode;
    allowShared: boolean;
    metadataJson: Record<string, unknown>;
  }> = [];

  for (const allocation of allocations) {
    const desiredConfig = allocation.configurationId ? configById.get(allocation.configurationId) ?? null : null;
    const resolvedConfiguration =
      desiredConfig && desiredConfig.spaceId === allocation.spaceId
        ? desiredConfig
        : await getOrCreateDefaultFacilitySpaceConfiguration({
            orgId,
            spaceId: allocation.spaceId,
            actorUserId
          });

    resolved.push({
      spaceId: allocation.spaceId,
      configurationId: resolvedConfiguration.id,
      lockMode: allocation.lockMode ?? "exclusive",
      allowShared: allocation.allowShared ?? false,
      metadataJson: allocation.notes ? { notes: allocation.notes } : {}
    });
  }

  return resolved;
}

function buildAllocationConflictIndex(
  allocations: Awaited<ReturnType<typeof listOccurrenceFacilityAllocations>>,
  facilityReservations: Awaited<ReturnType<typeof listFacilityReservationReadModel>>["reservations"]
) {
  const allocationsBySpace = new Map<string, typeof allocations>();
  for (const allocation of allocations) {
    if (!allocation.isActive) {
      continue;
    }
    const list = allocationsBySpace.get(allocation.spaceId) ?? [];
    list.push(allocation);
    allocationsBySpace.set(allocation.spaceId, list);
  }

  const reservationsBySpace = new Map<string, typeof facilityReservations>();
  for (const reservation of facilityReservations) {
    if (reservation.status !== "pending" && reservation.status !== "approved") {
      continue;
    }
    const list = reservationsBySpace.get(reservation.spaceId) ?? [];
    list.push(reservation);
    reservationsBySpace.set(reservation.spaceId, list);
  }

  return { allocationsBySpace, reservationsBySpace };
}

function collectAllocationConflicts(input: {
  occurrenceId: string;
  startsAtUtc: string;
  endsAtUtc: string;
  spaceId: string;
  allocationsBySpace: Map<string, Awaited<ReturnType<typeof listOccurrenceFacilityAllocations>>>;
  reservationsBySpace: Map<string, Awaited<ReturnType<typeof listFacilityReservationReadModel>>["reservations"]>;
}) {
  const conflicts: FacilityAllocationConflict[] = [];
  const { occurrenceId, startsAtUtc, endsAtUtc, spaceId, allocationsBySpace, reservationsBySpace } = input;

  const allocations = allocationsBySpace.get(spaceId) ?? [];
  for (const allocation of allocations) {
    if (allocation.occurrenceId === occurrenceId) {
      continue;
    }
    if (!windowsOverlap(startsAtUtc, endsAtUtc, allocation.startsAtUtc, allocation.endsAtUtc)) {
      continue;
    }
    conflicts.push({
      spaceId,
      occurrenceId,
      startsAtUtc,
      endsAtUtc,
      conflictType: "allocation",
      conflictId: allocation.id,
      conflictStartsAtUtc: allocation.startsAtUtc,
      conflictEndsAtUtc: allocation.endsAtUtc
    });
  }

  const reservations = reservationsBySpace.get(spaceId) ?? [];
  for (const reservation of reservations) {
    if (!windowsOverlap(startsAtUtc, endsAtUtc, reservation.startsAtUtc, reservation.endsAtUtc)) {
      continue;
    }
    conflicts.push({
      spaceId,
      occurrenceId,
      startsAtUtc,
      endsAtUtc,
      conflictType: "reservation",
      conflictId: reservation.id,
      conflictStartsAtUtc: reservation.startsAtUtc,
      conflictEndsAtUtc: reservation.endsAtUtc,
      conflictStatus: reservation.status
    });
  }

  return conflicts;
}

async function applyRuleAllocationsToOccurrences(input: {
  orgId: string;
  actorUserId: string;
  occurrences: Awaited<ReturnType<typeof listCalendarOccurrencesByRule>>;
  allocations: Array<{
    spaceId: string;
    configurationId: string;
    lockMode: FacilityLockMode;
    allowShared: boolean;
    metadataJson: Record<string, unknown>;
  }>;
}): Promise<RuleAllocationConflictSummary[]> {
  if (input.occurrences.length === 0) {
    return [];
  }

  const [existingAllocations, facilityReadModel] = await Promise.all([
    listOccurrenceFacilityAllocations(input.orgId),
    listFacilityReservationReadModel(input.orgId)
  ]);
  const { allocationsBySpace, reservationsBySpace } = buildAllocationConflictIndex(existingAllocations, facilityReadModel.reservations);
  const conflicts: RuleAllocationConflictSummary[] = [];

  for (const occurrence of input.occurrences) {
    const allowedAllocations: typeof input.allocations = [];
    for (const allocation of input.allocations) {
      const overlapConflicts = collectAllocationConflicts({
        occurrenceId: occurrence.id,
        startsAtUtc: occurrence.startsAtUtc,
        endsAtUtc: occurrence.endsAtUtc,
        spaceId: allocation.spaceId,
        allocationsBySpace,
        reservationsBySpace
      });

      if (overlapConflicts.length > 0) {
        for (const conflict of overlapConflicts) {
          conflicts.push({
            ...conflict,
            sourceKey: occurrence.sourceKey
          });
        }
        continue;
      }

      allowedAllocations.push(allocation);
    }

    await replaceOccurrenceFacilityAllocations({
      orgId: input.orgId,
      occurrenceId: occurrence.id,
      allocations: allowedAllocations,
      actorUserId: input.actorUserId
    });
  }

  return conflicts;
}

async function isTeamStaffAdmin(orgId: string, userId: string, teamId: string): Promise<boolean> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("programs").from("program_team_staff")
    .select("id, role, program_teams!inner(org_id)")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .in("role", ["head_coach", "assistant_coach", "manager"]) 
    .eq("program_teams.org_id", orgId)
    .limit(1);

  if (error) {
    throw new Error(`Failed to validate team staff access: ${error.message}`);
  }

  return (data ?? []).length > 0;
}

async function requireCalendarActor(orgSlug: string) {
  const org = await getOrgAuthContext(orgSlug);
  const hasCalendarRead = can(org.membershipPermissions, "calendar.read") || can(org.membershipPermissions, "calendar.write");
  const hasCalendarWrite =
    can(org.membershipPermissions, "calendar.write") ||
    can(org.membershipPermissions, "programs.write") ||
    can(org.membershipPermissions, "org.manage.read");

  return {
    ...org,
    hasCalendarRead,
    hasCalendarWrite
  };
}

async function canManageEntry(orgId: string, userId: string, entry: CalendarEntry, hasOrgWrite: boolean) {
  if (hasOrgWrite) {
    return true;
  }

  if (!entry.hostTeamId) {
    return false;
  }

  return isTeamStaffAdmin(orgId, userId, entry.hostTeamId);
}

async function listActorTeamAccess(orgId: string, userId: string): Promise<{ teamIds: Set<string>; programIds: Set<string> }> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("programs").from("program_team_staff")
    .select("team_id, program_id")
    .eq("org_id", orgId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to load actor team access: ${error.message}`);
  }

  const teamIds = new Set<string>();
  const programIds = new Set<string>();
  for (const row of data ?? []) {
    if (row.team_id) {
      teamIds.add(row.team_id);
    }
    if (row.program_id) {
      programIds.add(row.program_id);
    }
  }

  return { teamIds, programIds };
}

function filterReadModelByActorVisibility(input: {
  readModel: CalendarReadModel;
  hasOrgWrite: boolean;
  actorTeamIds: Set<string>;
  actorProgramIds: Set<string>;
}) {
  const { readModel, hasOrgWrite, actorTeamIds, actorProgramIds } = input;
  if (hasOrgWrite) {
    return readModel;
  }

  const sourceById = new Map(readModel.sources.map((source) => [source.id, source]));
  const allowedSourceIds = new Set<string>();

  for (const source of readModel.sources) {
    if (source.scopeType === "organization") {
      allowedSourceIds.add(source.id);
      continue;
    }

    if (source.scopeType === "custom") {
      const syntheticKind = typeof source.displayJson.kind === "string" ? source.displayJson.kind : "";
      if (!syntheticKind.startsWith("group_")) {
        allowedSourceIds.add(source.id);
      }
      continue;
    }

    if (source.scopeType === "program") {
      if (source.scopeId && actorProgramIds.has(source.scopeId)) {
        allowedSourceIds.add(source.id);
      }
      continue;
    }

    if (source.scopeType === "division") {
      const sourceProgramId = typeof source.displayJson.programId === "string" ? source.displayJson.programId : null;
      if (sourceProgramId && actorProgramIds.has(sourceProgramId)) {
        allowedSourceIds.add(source.id);
      }
      continue;
    }

    const visibilityRaw = source.displayJson.teamCalendarVisibility;
    const visibility =
      visibilityRaw === "org_members" || visibilityRaw === "program_members" || visibilityRaw === "team_members"
        ? visibilityRaw
        : "team_members";

    const sourceProgramId = typeof source.displayJson.programId === "string" ? source.displayJson.programId : null;

    if (visibility === "org_members") {
      allowedSourceIds.add(source.id);
      continue;
    }
    if (visibility === "program_members" && sourceProgramId && actorProgramIds.has(sourceProgramId)) {
      allowedSourceIds.add(source.id);
      continue;
    }
    if (source.scopeId && actorTeamIds.has(source.scopeId)) {
      allowedSourceIds.add(source.id);
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

function revalidateCalendarRoutes(orgSlug: string) {
  revalidatePath(`/${orgSlug}/manage/calendar`);
  revalidatePath(`/${orgSlug}/manage/facilities`);
  revalidatePath(`/${orgSlug}/manage/programs`);
  revalidatePath(`/${orgSlug}`);
  revalidatePath(`/${orgSlug}`, "layout");
}

const calendarPurposeValues = [
  "games",
  "practices",
  "tryouts",
  "season_dates",
  "meetings",
  "fundraisers",
  "facilities",
  "deadlines",
  "custom_other"
] as const satisfies CalendarPurpose[];

const calendarAudienceValues = [
  "me",
  "public",
  "staff",
  "coaches",
  "board",
  "parents",
  "players",
  "team_members_only",
  "private_internal"
] as const satisfies CalendarAudience[];

const calendarPageContextTypeValues = ["org", "program", "division", "team", "facility", "public", "embedded"] as const satisfies CalendarPageContextType[];

const calendarLensKindValues = ["mine", "this_page", "public", "operations", "custom"] as const;
const calendarScopeTypeValues = ["organization", "program", "division", "team", "custom"] as const;

const lensStateSchema = z.object({
  lens: z.enum(calendarLensKindValues),
  includeScopeTypes: z.array(z.enum(calendarScopeTypeValues)).optional(),
  excludeSourceIds: z.array(z.string().uuid()).optional(),
  includePurpose: z.array(z.enum(calendarPurposeValues)).optional(),
  audiencePerspective: z.union([z.enum(calendarAudienceValues), z.literal("what_i_can_access")]).optional(),
  selectedLayerIds: z.array(z.string().uuid()).optional(),
  pinnedLayerIds: z.array(z.string().uuid()).optional(),
  isolatedLayerId: z.string().uuid().nullable().optional(),
  includeParentScopes: z.boolean().optional(),
  includeChildScopes: z.boolean().optional(),
  searchTerm: z.string().optional(),
  dateMode: z.enum(["all", "range"]).optional(),
  dateRange: z
    .object({
      fromUtc: z.string().nullable().optional(),
      toUtc: z.string().nullable().optional()
    })
    .optional(),
  savedViewId: z.string().uuid().nullable().optional(),
  savedViewName: z.string().nullable().optional()
});

const pageContextSchema = z.object({
  contextType: z.enum(calendarPageContextTypeValues),
  orgSlug: textSchema.min(1),
  orgId: z.string().uuid().optional(),
  programId: z.string().uuid().optional(),
  divisionId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  facilityId: z.string().uuid().optional()
});

function normalizeLensState(input: z.input<typeof lensStateSchema> | undefined, fallbackLens: CalendarLensState["lens"]): CalendarLensState {
  const baseline = defaultLensState(fallbackLens);
  if (!input) {
    return baseline;
  }

  const parsed = lensStateSchema.safeParse(input);
  if (!parsed.success) {
    return baseline;
  }

  const state = parsed.data;
  return {
    ...baseline,
    ...state,
    includeScopeTypes: state.includeScopeTypes ?? baseline.includeScopeTypes,
    excludeSourceIds: state.excludeSourceIds ?? baseline.excludeSourceIds,
    includePurpose: state.includePurpose ?? baseline.includePurpose,
    selectedLayerIds: state.selectedLayerIds ?? baseline.selectedLayerIds,
    pinnedLayerIds: state.pinnedLayerIds ?? baseline.pinnedLayerIds,
    dateRange: {
      fromUtc: state.dateRange?.fromUtc ?? baseline.dateRange.fromUtc,
      toUtc: state.dateRange?.toUtc ?? baseline.dateRange.toUtc
    }
  };
}

const createEntrySchema = z.object({
  orgSlug: textSchema.min(1),
  sourceId: z.string().uuid().nullable().optional(),
  purpose: z.enum(calendarPurposeValues).optional(),
  audience: z.enum(calendarAudienceValues).optional(),
  entryType: z.enum(["event", "practice", "game"] satisfies CalendarEntryType[]),
  title: textSchema.min(2).max(160),
  summary: textSchema.max(2400).optional(),
  visibility: z.enum(["internal", "published"]),
  status: z.enum(["scheduled", "cancelled", "archived"] satisfies CalendarEntryStatus[]).optional(),
  hostTeamId: z.string().uuid().nullable().optional(),
  timezone: textSchema.max(120).optional(),
  location: textSchema.max(240).optional()
});

const updateEntrySchema = createEntrySchema.extend({
  entryId: z.string().uuid()
});

const deleteEntrySchema = z.object({
  orgSlug: textSchema.min(1),
  entryId: z.string().uuid()
});

const upsertRuleSchema = z.object({
  orgSlug: textSchema.min(1),
  entryId: z.string().uuid(),
  ruleId: z.string().uuid().optional(),
  mode: z.enum(["single_date", "multiple_specific_dates", "repeating_pattern", "continuous_date_range", "custom_advanced"] satisfies CalendarRuleMode[]),
  timezone: textSchema.max(120).optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  startTime: z.string().trim().optional(),
  endTime: z.string().trim().optional(),
  intervalCount: z.number().int().min(1).optional(),
  intervalUnit: z.enum(["day", "week", "month"] satisfies CalendarIntervalUnit[]).optional(),
  byWeekday: z.array(z.number().int().min(0).max(6)).optional(),
  byMonthday: z.array(z.number().int().min(1).max(31)).optional(),
  endMode: z.enum(["never", "until_date", "after_occurrences"] satisfies CalendarRuleEndMode[]).optional(),
  untilDate: z.string().trim().optional(),
  maxOccurrences: z.number().int().min(1).nullable().optional(),
  sortIndex: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  configJson: z.record(z.string(), z.unknown()).optional()
});

const deleteRuleSchema = z.object({
  orgSlug: textSchema.min(1),
  ruleId: z.string().uuid()
});

const createManualOccurrenceSchema = z.object({
  orgSlug: textSchema.min(1),
  entryId: z.string().uuid(),
  timezone: textSchema.max(120).optional(),
  localDate: localDateSchema,
  localStartTime: z.string().trim().optional(),
  localEndTime: z.string().trim().optional(),
  metadataJson: z.record(z.string(), z.unknown()).optional()
});

const updateOccurrenceSchema = createManualOccurrenceSchema.extend({
  occurrenceId: z.string().uuid()
});

const recurringMutationRuleSchema = z.object({
  mode: z.enum(["single_date", "multiple_specific_dates", "repeating_pattern", "continuous_date_range", "custom_advanced"] satisfies CalendarRuleMode[]),
  timezone: textSchema.max(120).optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  startTime: z.string().trim().optional(),
  endTime: z.string().trim().optional(),
  intervalCount: z.number().int().min(1).optional(),
  intervalUnit: z.enum(["day", "week", "month"] satisfies CalendarIntervalUnit[]).optional(),
  byWeekday: z.array(z.number().int().min(0).max(6)).optional(),
  byMonthday: z.array(z.number().int().min(1).max(31)).optional(),
  endMode: z.enum(["never", "until_date", "after_occurrences"] satisfies CalendarRuleEndMode[]).optional(),
  untilDate: z.string().trim().optional(),
  maxOccurrences: z.number().int().min(1).nullable().optional(),
  configJson: z.record(z.string(), z.unknown()).optional()
});

const updateRecurringOccurrenceSchema = z.object({
  orgSlug: textSchema.min(1),
  occurrenceId: z.string().uuid(),
  editScope: z.enum(["occurrence", "following", "series"]),
  entryType: z.enum(["event", "practice", "game"] satisfies CalendarEntryType[]),
  title: textSchema.min(2).max(160),
  summary: textSchema.max(2400).optional(),
  visibility: z.enum(["internal", "published"]),
  status: z.enum(["scheduled", "cancelled", "archived"] satisfies CalendarEntryStatus[]).optional(),
  hostTeamId: z.string().uuid().nullable().optional(),
  timezone: textSchema.max(120).optional(),
  location: textSchema.max(240).optional(),
  localDate: localDateSchema,
  localStartTime: z.string().trim().optional(),
  localEndTime: z.string().trim().optional(),
  metadataJson: z.record(z.string(), z.unknown()).optional(),
  recurrence: recurringMutationRuleSchema,
  copyForwardInvites: z.boolean().optional(),
  copyForwardFacilities: z.boolean().optional()
});

const occurrenceStatusSchema = z.object({
  orgSlug: textSchema.min(1),
  occurrenceId: z.string().uuid(),
  status: z.enum(["scheduled", "cancelled"] satisfies CalendarOccurrenceStatus[])
});

const deleteOccurrenceSchema = z.object({
  orgSlug: textSchema.min(1),
  occurrenceId: z.string().uuid()
});

const deleteRecurringOccurrenceSchema = z.object({
  orgSlug: textSchema.min(1),
  occurrenceId: z.string().uuid(),
  deleteScope: z.enum(["occurrence", "following", "series"])
});

const allocationSchema = z.object({
  orgSlug: textSchema.min(1),
  occurrenceId: z.string().uuid(),
  spaceId: z.string().uuid(),
  configurationId: z.string().uuid().optional(),
  lockMode: z.enum(["exclusive", "shared_invite_only"] satisfies FacilityLockMode[]).optional(),
  allowShared: z.boolean().optional()
});

const allocationItemSchema = z.object({
  spaceId: z.string().uuid(),
  configurationId: z.string().uuid().optional(),
  lockMode: z.enum(["exclusive", "shared_invite_only"] satisfies FacilityLockMode[]).optional(),
  allowShared: z.boolean().optional(),
  notes: z.string().max(2400).optional()
});

const setAllocationsSchema = z.object({
  orgSlug: textSchema.min(1),
  occurrenceId: z.string().uuid(),
  allocations: z.array(allocationItemSchema)
});

const setRuleAllocationsSchema = z.object({
  orgSlug: textSchema.min(1),
  ruleId: z.string().uuid(),
  allocations: z.array(allocationItemSchema)
});

type FacilityAllocationConflict = {
  spaceId: string;
  occurrenceId: string;
  startsAtUtc: string;
  endsAtUtc: string;
  conflictType: "allocation" | "reservation";
  conflictId: string;
  conflictStartsAtUtc: string;
  conflictEndsAtUtc: string;
  conflictStatus?: string | null;
};

type RuleAllocationConflictSummary = FacilityAllocationConflict & {
  sourceKey: string;
};

const inviteSchema = z.object({
  orgSlug: textSchema.min(1),
  occurrenceId: z.string().uuid(),
  teamId: z.string().uuid()
});

const respondInviteSchema = z.object({
  orgSlug: textSchema.min(1),
  occurrenceId: z.string().uuid(),
  teamId: z.string().uuid(),
  response: z.enum(["accepted", "declined"])
});

const leaveSchema = z.object({
  orgSlug: textSchema.min(1),
  occurrenceId: z.string().uuid(),
  teamId: z.string().uuid()
});

export async function getCalendarWorkspaceDataAction(input: {
  orgSlug: string;
}): Promise<
  CalendarActionResult<{
    readModel: CalendarReadModel;
    activeTeams: Array<{ id: string; label: string }>;
    facilityReadModel: Awaited<ReturnType<typeof listFacilityReservationReadModel>>;
  }>
> {
  try {
    const actor = await requireCalendarActor(input.orgSlug);

    if (!actor.hasCalendarRead && !can(actor.membershipPermissions, "programs.read") && !actor.hasCalendarWrite) {
      return asError("You do not have access to calendar data.");
    }

    const [readModelResult, activeTeamsResult, facilityReadModelResult, actorAccessResult] = await Promise.allSettled([
      listCalendarReadModel(actor.orgId),
      listOrgActiveTeams(actor.orgId),
      listFacilityReservationReadModel(actor.orgId),
      listActorTeamAccess(actor.orgId, actor.userId)
    ]);

    if (readModelResult.status === "rejected") {
      throw readModelResult.reason;
    }

    const readModelRaw = readModelResult.value;
    const activeTeams = activeTeamsResult.status === "fulfilled" ? activeTeamsResult.value : [];
    const facilityReadModel =
      facilityReadModelResult.status === "fulfilled"
        ? facilityReadModelResult.value
        : {
            spaces: [],
            rules: [],
            reservations: [],
            exceptions: []
          };
    const actorAccess =
      actorAccessResult.status === "fulfilled"
        ? actorAccessResult.value
        : {
            teamIds: new Set<string>(),
            programIds: new Set<string>()
          };

    if (activeTeamsResult.status === "rejected" || facilityReadModelResult.status === "rejected" || actorAccessResult.status === "rejected") {
      console.error("Calendar workspace partial load failure", {
        orgId: actor.orgId,
        activeTeamsError: activeTeamsResult.status === "rejected" ? String(activeTeamsResult.reason) : null,
        facilityReadModelError: facilityReadModelResult.status === "rejected" ? String(facilityReadModelResult.reason) : null,
        actorAccessError: actorAccessResult.status === "rejected" ? String(actorAccessResult.reason) : null
      });
    }

    const readModel = filterReadModelByActorVisibility({
      readModel: readModelRaw,
      hasOrgWrite: actor.hasCalendarWrite,
      actorTeamIds: actorAccess.teamIds,
      actorProgramIds: actorAccess.programIds
    });

    return {
      ok: true,
      data: {
        readModel,
        activeTeams,
        facilityReadModel
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    if (process.env.NODE_ENV !== "production") {
      console.error("getCalendarWorkspaceDataAction failed", error);
    }
    return asError("Unable to load calendar workspace.");
  }
}

const getCalendarExplorerDataSchema = z.object({
  context: pageContextSchema,
  lensState: lensStateSchema.optional(),
  dateRange: z
    .object({
      fromUtc: z.string().optional(),
      toUtc: z.string().optional()
    })
    .optional()
});

export async function getCalendarExplorerDataAction(
  input: z.input<typeof getCalendarExplorerDataSchema>
): Promise<
  CalendarActionResult<{
    context: CalendarPageContext;
    lensState: CalendarLensState;
    readModel: CalendarReadModel;
    savedViews: Awaited<ReturnType<typeof listCalendarLensSavedViews>>;
  }>
> {
  const parsed = getCalendarExplorerDataSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid calendar explorer request.");
  }

  try {
    const actor = await requireCalendarActor(parsed.data.context.orgSlug);
    if (!actor.hasCalendarRead && !actor.hasCalendarWrite && !can(actor.membershipPermissions, "programs.read")) {
      return asError("You do not have access to calendar data.");
    }

    const context: CalendarPageContext = {
      ...parsed.data.context,
      orgId: actor.orgId,
      orgSlug: actor.orgSlug
    };
    const lensState = normalizeLensState(parsed.data.lensState, context.contextType === "org" ? "mine" : "this_page");
    const rangeLensState: CalendarLensState =
      parsed.data.dateRange && (parsed.data.dateRange.fromUtc || parsed.data.dateRange.toUtc)
        ? {
            ...lensState,
            dateMode: "range",
            dateRange: {
              fromUtc: parsed.data.dateRange.fromUtc ?? null,
              toUtc: parsed.data.dateRange.toUtc ?? null
            }
          }
        : lensState;

    const [readModelRaw, savedViews, actorAccess] = await Promise.all([
      listCalendarReadModel(actor.orgId),
      listCalendarLensSavedViews({
        orgId: actor.orgId,
        userId: actor.userId,
        contextType: context.contextType
      }),
      listActorTeamAccess(actor.orgId, actor.userId)
    ]);
    const readModel = filterReadModelByActorVisibility({
      readModel: readModelRaw,
      hasOrgWrite: actor.hasCalendarWrite,
      actorTeamIds: actorAccess.teamIds,
      actorProgramIds: actorAccess.programIds
    });

    const filtered = filterCalendarReadModelByLens({
      readModel,
      sources: readModel.sources,
      context,
      lensState: rangeLensState
    });

    return {
      ok: true,
      data: {
        context,
        lensState: rangeLensState,
        readModel: filtered,
        savedViews
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to load calendar explorer.");
  }
}

const whyShownSchema = z.object({
  context: pageContextSchema,
  occurrenceId: z.string().uuid(),
  lensState: lensStateSchema.optional()
});

export async function getCalendarOccurrenceWhyShownAction(
  input: z.input<typeof whyShownSchema>
): Promise<CalendarActionResult<{ whyShown: ReturnType<typeof explainOccurrenceVisibility> }>> {
  const parsed = whyShownSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid explainability request.");
  }

  try {
    const actor = await requireCalendarActor(parsed.data.context.orgSlug);
    const context: CalendarPageContext = {
      ...parsed.data.context,
      orgId: actor.orgId,
      orgSlug: actor.orgSlug
    };
    const lensState = normalizeLensState(parsed.data.lensState, context.contextType === "org" ? "mine" : "this_page");
    const [readModelRaw, actorAccess] = await Promise.all([
      listCalendarReadModel(actor.orgId),
      listActorTeamAccess(actor.orgId, actor.userId)
    ]);
    const readModel = filterReadModelByActorVisibility({
      readModel: readModelRaw,
      hasOrgWrite: actor.hasCalendarWrite,
      actorTeamIds: actorAccess.teamIds,
      actorProgramIds: actorAccess.programIds
    });
    const filtered = filterCalendarReadModelByLens({
      readModel,
      sources: readModel.sources,
      context,
      lensState
    });

    const whyShown = explainOccurrenceVisibility({
      occurrenceId: parsed.data.occurrenceId,
      readModel: filtered,
      sources: readModel.sources,
      lensState
    });

    return {
      ok: true,
      data: {
        whyShown
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to explain visibility for this event.");
  }
}

const listSavedLensViewsSchema = z.object({
  orgSlug: textSchema.min(1),
  contextType: z.enum(calendarPageContextTypeValues).nullable().optional()
});

export async function listCalendarLensViewsAction(
  input: z.input<typeof listSavedLensViewsSchema>
): Promise<CalendarActionResult<{ views: Awaited<ReturnType<typeof listCalendarLensSavedViews>> }>> {
  const parsed = listSavedLensViewsSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid calendar saved views request.");
  }

  try {
    const actor = await requireCalendarActor(parsed.data.orgSlug);
    const views = await listCalendarLensSavedViews({
      orgId: actor.orgId,
      userId: actor.userId,
      contextType: parsed.data.contextType ?? null
    });
    return { ok: true, data: { views } };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to load saved calendar views.");
  }
}

const saveCalendarLensViewSchema = z.object({
  orgSlug: textSchema.min(1),
  viewId: z.string().uuid().optional(),
  name: textSchema.min(1).max(100),
  contextType: z.enum(calendarPageContextTypeValues).nullable().optional(),
  isDefault: z.boolean().optional(),
  lensState: lensStateSchema
});

export async function saveCalendarLensViewAction(
  input: z.input<typeof saveCalendarLensViewSchema>
): Promise<CalendarActionResult<{ view: Awaited<ReturnType<typeof saveCalendarLensView>> }>> {
  const parsed = saveCalendarLensViewSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Please review your saved-view details.");
  }

  try {
    const actor = await requireCalendarActor(parsed.data.orgSlug);
    const lensState = normalizeLensState(parsed.data.lensState, parsed.data.contextType === "org" ? "mine" : "this_page");

    if (parsed.data.isDefault) {
      const existing = await listCalendarLensSavedViews({
        orgId: actor.orgId,
        userId: actor.userId,
        contextType: parsed.data.contextType ?? null
      });
      for (const view of existing) {
        if (!view.isDefault || (parsed.data.viewId && view.id === parsed.data.viewId)) {
          continue;
        }
        await saveCalendarLensView({
          orgId: actor.orgId,
          userId: actor.userId,
          viewId: view.id,
          name: view.name,
          contextType: view.contextType ?? null,
          isDefault: false,
          configJson: view.configJson
        });
      }
    }

    const view = await saveCalendarLensView({
      orgId: actor.orgId,
      userId: actor.userId,
      viewId: parsed.data.viewId,
      name: parsed.data.name,
      contextType: parsed.data.contextType ?? null,
      isDefault: parsed.data.isDefault ?? false,
      configJson: lensState
    });

    revalidateCalendarRoutes(actor.orgSlug);
    return {
      ok: true,
      data: {
        view
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to save this calendar view.");
  }
}

const deleteCalendarLensViewSchema = z.object({
  orgSlug: textSchema.min(1),
  viewId: z.string().uuid()
});

export async function deleteCalendarLensViewAction(
  input: z.input<typeof deleteCalendarLensViewSchema>
): Promise<CalendarActionResult<{ viewId: string }>> {
  const parsed = deleteCalendarLensViewSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid delete request.");
  }

  try {
    const actor = await requireCalendarActor(parsed.data.orgSlug);
    await deleteCalendarLensView({
      orgId: actor.orgId,
      userId: actor.userId,
      viewId: parsed.data.viewId
    });
    revalidateCalendarRoutes(actor.orgSlug);
    return {
      ok: true,
      data: {
        viewId: parsed.data.viewId
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to delete saved view.");
  }
}

const setDefaultCalendarLensViewSchema = z.object({
  orgSlug: textSchema.min(1),
  viewId: z.string().uuid(),
  contextType: z.enum(calendarPageContextTypeValues).nullable().optional()
});

export async function setDefaultCalendarLensViewAction(
  input: z.input<typeof setDefaultCalendarLensViewSchema>
): Promise<CalendarActionResult<{ viewId: string }>> {
  const parsed = setDefaultCalendarLensViewSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid default-view update.");
  }

  try {
    const actor = await requireCalendarActor(parsed.data.orgSlug);
    const views = await listCalendarLensSavedViews({
      orgId: actor.orgId,
      userId: actor.userId,
      contextType: parsed.data.contextType ?? null
    });

    for (const view of views) {
      const shouldBeDefault = view.id === parsed.data.viewId;
      if (view.isDefault === shouldBeDefault) {
        continue;
      }
      await saveCalendarLensView({
        orgId: actor.orgId,
        userId: actor.userId,
        viewId: view.id,
        name: view.name,
        contextType: view.contextType ?? null,
        isDefault: shouldBeDefault,
        configJson: view.configJson
      });
    }

    revalidateCalendarRoutes(actor.orgSlug);
    return {
      ok: true,
      data: {
        viewId: parsed.data.viewId
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to set default view.");
  }
}

const upsertCalendarSourceSchema = z.object({
  orgSlug: textSchema.min(1),
  sourceId: z.string().uuid().optional(),
  name: textSchema.min(1).max(120),
  scopeType: z.enum(calendarScopeTypeValues),
  scopeId: z.string().uuid().nullable().optional(),
  scopeLabel: z.string().max(120).nullable().optional(),
  parentSourceId: z.string().uuid().nullable().optional(),
  purposeDefaults: z.array(z.enum(calendarPurposeValues)).optional(),
  audienceDefaults: z.array(z.enum(calendarAudienceValues)).optional(),
  isCustomCalendar: z.boolean().optional(),
  isActive: z.boolean().optional(),
  displayJson: z.record(z.string(), z.unknown()).optional()
});

export async function upsertCalendarSourceAction(
  input: z.input<typeof upsertCalendarSourceSchema>
): Promise<CalendarActionResult<{ source: Awaited<ReturnType<typeof upsertCalendarSource>> }>> {
  const parsed = upsertCalendarSourceSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Please review source details.");
  }

  try {
    const actor = await requireCalendarActor(parsed.data.orgSlug);
    if (!actor.hasCalendarWrite) {
      return asError("You do not have permission to manage calendar sources.");
    }

    const source = await upsertCalendarSource({
      orgId: actor.orgId,
      sourceId: parsed.data.sourceId,
      name: parsed.data.name,
      scopeType: parsed.data.scopeType,
      scopeId: parsed.data.scopeId ?? null,
      scopeLabel: parsed.data.scopeLabel ?? null,
      parentSourceId: parsed.data.parentSourceId ?? null,
      purposeDefaults: parsed.data.purposeDefaults ?? [],
      audienceDefaults: parsed.data.audienceDefaults ?? [],
      isCustomCalendar: parsed.data.isCustomCalendar ?? parsed.data.scopeType === "custom",
      isActive: parsed.data.isActive ?? true,
      displayJson: parsed.data.displayJson ?? {},
      actorUserId: actor.userId
    });

    revalidateCalendarRoutes(actor.orgSlug);
    return {
      ok: true,
      data: {
        source
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to save calendar source.");
  }
}

export async function createCalendarEntryAction(input: z.input<typeof createEntrySchema>): Promise<CalendarActionResult<{ entryId: string }>> {
  const parsed = createEntrySchema.safeParse(input);

  if (!parsed.success) {
    return asError("Please review the calendar entry fields.");
  }

  try {
    const payload = parsed.data;
    const actor = await requireCalendarActor(payload.orgSlug);

    if (!actor.hasCalendarWrite) {
      if (!payload.hostTeamId || !(await isTeamStaffAdmin(actor.orgId, actor.userId, payload.hostTeamId))) {
        return asError("You do not have permission to create this calendar entry.");
      }
    }

    if (payload.entryType === "practice" && !payload.hostTeamId) {
      return asError("Practices require a host team.");
    }

    const created = await createCalendarEntryRecord({
      orgId: actor.orgId,
      sourceId: payload.sourceId ?? null,
      purpose: payload.purpose,
      audience: payload.audience,
      entryType: payload.entryType,
      title: payload.title,
      summary: normalizeOptional(payload.summary),
      visibility: payload.visibility,
      status: payload.status ?? "scheduled",
      hostTeamId: payload.hostTeamId ?? null,
      defaultTimezone: resolveTimezone(payload.timezone),
      settingsJson: {
        location: normalizeOptional(payload.location)
      },
      createdBy: actor.userId
    });

    revalidateCalendarRoutes(actor.orgSlug);

    return {
      ok: true,
      data: {
        entryId: created.id
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to create this calendar entry right now.");
  }
}

export async function updateCalendarEntryAction(input: z.input<typeof updateEntrySchema>): Promise<CalendarActionResult<{ entryId: string }>> {
  const parsed = updateEntrySchema.safeParse(input);

  if (!parsed.success) {
    return asError("Please review the calendar entry fields.");
  }

  try {
    const payload = parsed.data;
    const actor = await requireCalendarActor(payload.orgSlug);
    const existing = await getCalendarEntryById(actor.orgId, payload.entryId);

    if (!existing) {
      return asError("Calendar entry not found.");
    }

    const allowed = await canManageEntry(actor.orgId, actor.userId, existing, actor.hasCalendarWrite);
    if (!allowed) {
      return asError("You do not have permission to update this calendar entry.");
    }

    const updated = await updateCalendarEntryRecord({
      orgId: actor.orgId,
      entryId: payload.entryId,
      sourceId: payload.sourceId ?? existing.sourceId,
      purpose: payload.purpose ?? existing.purpose,
      audience: payload.audience ?? existing.audience,
      entryType: payload.entryType,
      title: payload.title,
      summary: normalizeOptional(payload.summary),
      visibility: payload.visibility,
      status: payload.status ?? existing.status,
      hostTeamId: payload.hostTeamId ?? null,
      defaultTimezone: resolveTimezone(payload.timezone),
      settingsJson: {
        ...existing.settingsJson,
        location: normalizeOptional(payload.location)
      },
      updatedBy: actor.userId
    });

    revalidateCalendarRoutes(actor.orgSlug);

    return {
      ok: true,
      data: {
        entryId: updated.id
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to update this calendar entry right now.");
  }
}

export async function deleteCalendarEntryAction(input: z.input<typeof deleteEntrySchema>): Promise<CalendarActionResult<{ entryId: string }>> {
  const parsed = deleteEntrySchema.safeParse(input);

  if (!parsed.success) {
    return asError("Invalid delete request.");
  }

  try {
    const payload = parsed.data;
    const actor = await requireCalendarActor(payload.orgSlug);
    const existing = await getCalendarEntryById(actor.orgId, payload.entryId);

    if (!existing) {
      return asError("Calendar entry not found.");
    }

    const allowed = await canManageEntry(actor.orgId, actor.userId, existing, actor.hasCalendarWrite);
    if (!allowed) {
      return asError("You do not have permission to delete this calendar entry.");
    }

    await deleteCalendarEntryRecord(actor.orgId, payload.entryId);
    revalidateCalendarRoutes(actor.orgSlug);

    return {
      ok: true,
      data: {
        entryId: payload.entryId
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to delete this calendar entry.");
  }
}

export async function upsertCalendarRuleAction(input: z.input<typeof upsertRuleSchema>): Promise<CalendarActionResult<{ ruleId: string }>> {
  const parsed = upsertRuleSchema.safeParse(input);

  if (!parsed.success) {
    return asError("Please review the calendar rule details.");
  }

  try {
    const payload = parsed.data;
    const actor = await requireCalendarActor(payload.orgSlug);
    const entry = await getCalendarEntryById(actor.orgId, payload.entryId);

    if (!entry) {
      return asError("Calendar entry not found.");
    }

    const allowed = await canManageEntry(actor.orgId, actor.userId, entry, actor.hasCalendarWrite);
    if (!allowed) {
      return asError("You do not have permission to manage this schedule.");
    }

    const normalizedShape = {
      mode: payload.mode,
      timezone: resolveTimezone(payload.timezone ?? entry.defaultTimezone),
      startDate: normalizeDate(payload.startDate),
      endDate: normalizeDate(payload.endDate),
      startTime: normalizeOptional(payload.startTime),
      endTime: normalizeOptional(payload.endTime),
      intervalCount: payload.intervalCount ?? 1,
      intervalUnit: payload.intervalUnit ?? "week",
      byWeekday: payload.byWeekday ?? [],
      byMonthday: payload.byMonthday ?? [],
      endMode: payload.endMode ?? "until_date",
      untilDate: normalizeDate(payload.untilDate),
      maxOccurrences: payload.maxOccurrences ?? null,
      configJson: payload.configJson ?? {}
    };

    const savedRule = await upsertCalendarRuleRecord({
      orgId: actor.orgId,
      ruleId: payload.ruleId,
      entryId: payload.entryId,
      mode: payload.mode,
      timezone: normalizedShape.timezone,
      startDate: normalizedShape.startDate,
      endDate: normalizedShape.endDate,
      startTime: normalizedShape.startTime,
      endTime: normalizedShape.endTime,
      intervalCount: normalizedShape.intervalCount,
      intervalUnit: normalizedShape.intervalUnit,
      byWeekday: normalizedShape.byWeekday,
      byMonthday: normalizedShape.byMonthday,
      endMode: normalizedShape.endMode,
      untilDate: normalizedShape.untilDate,
      maxOccurrences: normalizedShape.maxOccurrences,
      sortIndex: payload.sortIndex ?? 0,
      isActive: payload.isActive ?? true,
      configJson: normalizedShape.configJson,
      ruleHash: buildRuleHash(normalizedShape),
      actorUserId: actor.userId
    });

    const generated = generateOccurrencesForRule(savedRule);
    const exceptions = await listCalendarRuleExceptions(actor.orgId, { ruleId: savedRule.id });
    const suppressedKeys = new Set(
      exceptions
        .filter((exception) => exception.kind === "skip" || exception.kind === "override")
        .map((exception) => exception.sourceKey)
    );

    const filtered = generated.filter((occurrence) => !suppressedKeys.has(occurrence.sourceKey));
    await upsertRuleGeneratedOccurrences(actor.orgId, savedRule.id, actor.userId, filtered);

    for (const sourceKey of suppressedKeys) {
      await setCalendarOccurrenceStatusBySourceKey({
        orgId: actor.orgId,
        sourceKey,
        status: "cancelled",
        actorUserId: actor.userId
      });
    }

    const ruleAllocations = await listCalendarRuleFacilityAllocations(actor.orgId, { ruleId: savedRule.id });
    if (ruleAllocations.length > 0) {
      const occurrences = await listCalendarOccurrencesByRule(actor.orgId, savedRule.id);
      await applyRuleAllocationsToOccurrences({
        orgId: actor.orgId,
        actorUserId: actor.userId,
        occurrences,
        allocations: ruleAllocations.map((allocation) => ({
          spaceId: allocation.spaceId,
          configurationId: allocation.configurationId,
          lockMode: allocation.lockMode,
          allowShared: allocation.allowShared,
          metadataJson: allocation.metadataJson ?? {}
        }))
      });
    }

    revalidateCalendarRoutes(actor.orgSlug);

    return {
      ok: true,
      data: {
        ruleId: savedRule.id
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to save this calendar rule right now.");
  }
}

export async function deleteCalendarRuleAction(input: z.input<typeof deleteRuleSchema>): Promise<CalendarActionResult<{ ruleId: string }>> {
  const parsed = deleteRuleSchema.safeParse(input);

  if (!parsed.success) {
    return asError("Invalid calendar rule delete request.");
  }

  try {
    const payload = parsed.data;
    const actor = await requireCalendarActor(payload.orgSlug);
    const existingRule = await getCalendarRuleById(actor.orgId, payload.ruleId);

    if (!existingRule) {
      return asError("Calendar rule not found.");
    }

    const entry = await getCalendarEntryById(actor.orgId, existingRule.entryId);
    if (!entry) {
      return asError("Calendar entry not found.");
    }

    const allowed = await canManageEntry(actor.orgId, actor.userId, entry, actor.hasCalendarWrite);
    if (!allowed) {
      return asError("You do not have permission to delete this rule.");
    }

    await deleteCalendarRuleRecord(actor.orgId, payload.ruleId);
    revalidateCalendarRoutes(actor.orgSlug);

    return {
      ok: true,
      data: {
        ruleId: payload.ruleId
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to delete this calendar rule.");
  }
}

export async function createManualOccurrenceAction(
  input: z.input<typeof createManualOccurrenceSchema>
): Promise<CalendarActionResult<{ occurrenceId: string }>> {
  const parsed = createManualOccurrenceSchema.safeParse(input);

  if (!parsed.success) {
    return asError("Please review the occurrence details.");
  }

  try {
    const payload = parsed.data;
    const actor = await requireCalendarActor(payload.orgSlug);
    const entry = await getCalendarEntryById(actor.orgId, payload.entryId);

    if (!entry) {
      return asError("Calendar entry not found.");
    }

    const allowed = await canManageEntry(actor.orgId, actor.userId, entry, actor.hasCalendarWrite);
    if (!allowed) {
      return asError("You do not have permission to add an occurrence for this entry.");
    }

    const timezone = resolveTimezone(payload.timezone ?? entry.defaultTimezone);
    const normalizedWindow = normalizeLocalWindow({
      localDate: payload.localDate,
      localStartTime: payload.localStartTime,
      localEndTime: payload.localEndTime,
      timezone
    });

    const created = await insertCalendarOccurrenceRecord({
      orgId: actor.orgId,
      entryId: payload.entryId,
      sourceRuleId: null,
      sourceType: "single",
      sourceKey: `single:${randomUUID()}`,
      timezone,
      localDate: payload.localDate,
      localStartTime: normalizedWindow.localStartTime,
      localEndTime: normalizedWindow.localEndTime,
      startsAtUtc: normalizedWindow.startsAtUtc,
      endsAtUtc: normalizedWindow.endsAtUtc,
      status: "scheduled",
      metadataJson: payload.metadataJson ?? {},
      actorUserId: actor.userId
    });

    if (entry.hostTeamId) {
      await upsertOccurrenceTeamInvite({
        orgId: actor.orgId,
        occurrenceId: created.id,
        teamId: entry.hostTeamId,
        role: "host",
        inviteStatus: "accepted",
        invitedByUserId: actor.userId,
        invitedAt: new Date().toISOString(),
        respondedByUserId: actor.userId,
        respondedAt: new Date().toISOString()
      });
    }

    revalidateCalendarRoutes(actor.orgSlug);

    return {
      ok: true,
      data: {
        occurrenceId: created.id
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to create this occurrence.");
  }
}

export async function updateOccurrenceAction(input: z.input<typeof updateOccurrenceSchema>): Promise<CalendarActionResult<{ occurrenceId: string }>> {
  const parsed = updateOccurrenceSchema.safeParse(input);

  if (!parsed.success) {
    return asError("Please review the occurrence details.");
  }

  try {
    const payload = parsed.data;
    const actor = await requireCalendarActor(payload.orgSlug);
    const occurrence = await getCalendarOccurrenceById(actor.orgId, payload.occurrenceId);

    if (!occurrence) {
      return asError("Occurrence not found.");
    }

    const entry = await getCalendarEntryById(actor.orgId, occurrence.entryId);
    if (!entry) {
      return asError("Calendar entry not found.");
    }

    const allowed = await canManageEntry(actor.orgId, actor.userId, entry, actor.hasCalendarWrite);
    if (!allowed) {
      return asError("You do not have permission to update this occurrence.");
    }

    const timezone = resolveTimezone(payload.timezone ?? occurrence.timezone);
    const normalizedWindow = normalizeLocalWindow({
      localDate: payload.localDate,
      localStartTime: payload.localStartTime,
      localEndTime: payload.localEndTime,
      timezone
    });

    const updated = await updateCalendarOccurrenceRecord({
      orgId: actor.orgId,
      occurrenceId: payload.occurrenceId,
      timezone,
      localDate: payload.localDate,
      localStartTime: normalizedWindow.localStartTime,
      localEndTime: normalizedWindow.localEndTime,
      startsAtUtc: normalizedWindow.startsAtUtc,
      endsAtUtc: normalizedWindow.endsAtUtc,
      status: occurrence.status,
      metadataJson: payload.metadataJson ?? occurrence.metadataJson,
      actorUserId: actor.userId
    });

    revalidateCalendarRoutes(actor.orgSlug);

    return {
      ok: true,
      data: {
        occurrenceId: updated.id
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to update this occurrence.");
  }
}

export async function updateRecurringOccurrenceAction(
  input: z.input<typeof updateRecurringOccurrenceSchema>
): Promise<CalendarActionResult<{ occurrenceId: string; entryId: string; ruleId: string }>> {
  const parsed = updateRecurringOccurrenceSchema.safeParse(input);

  if (!parsed.success) {
    return asError("Please review the recurring update details.");
  }

  try {
    const payload = parsed.data;
    const actor = await requireCalendarActor(payload.orgSlug);
    const occurrence = await getCalendarOccurrenceById(actor.orgId, payload.occurrenceId);
    if (!occurrence) {
      return asError("Occurrence not found.");
    }
    if (!occurrence.sourceRuleId) {
      return asError("This occurrence is not part of a recurring series.");
    }

    const rule = await getCalendarRuleById(actor.orgId, occurrence.sourceRuleId);
    if (!rule) {
      return asError("Recurring rule not found.");
    }

    const entry = await getCalendarEntryById(actor.orgId, occurrence.entryId);
    if (!entry) {
      return asError("Calendar entry not found.");
    }

    const allowed = await canManageEntry(actor.orgId, actor.userId, entry, actor.hasCalendarWrite);
    if (!allowed) {
      return asError("You do not have permission to update this recurring event.");
    }

    const timezone = resolveTimezone(payload.timezone ?? occurrence.timezone);
    const normalizedWindow = normalizeLocalWindow({
      localDate: payload.localDate,
      localStartTime: payload.localStartTime,
      localEndTime: payload.localEndTime,
      timezone
    });

    const recurrenceInput = {
      mode: payload.recurrence.mode,
      timezone: resolveTimezone(payload.recurrence.timezone ?? timezone),
      startDate: normalizeDate(payload.recurrence.startDate) ?? payload.localDate,
      endDate: normalizeDate(payload.recurrence.endDate),
      startTime: normalizeOptional(payload.recurrence.startTime) ?? normalizedWindow.localStartTime,
      endTime: normalizeOptional(payload.recurrence.endTime) ?? normalizedWindow.localEndTime,
      intervalCount: payload.recurrence.intervalCount ?? 1,
      intervalUnit: payload.recurrence.intervalUnit ?? "week",
      byWeekday: payload.recurrence.byWeekday ?? [],
      byMonthday: payload.recurrence.byMonthday ?? [],
      endMode: payload.recurrence.endMode ?? "until_date",
      untilDate: normalizeDate(payload.recurrence.untilDate),
      maxOccurrences: payload.recurrence.maxOccurrences ?? null,
      configJson: payload.recurrence.configJson ?? {}
    };

    const nextEntryInput = {
      entryType: payload.entryType,
      title: payload.title,
      summary: normalizeOptional(payload.summary) ?? "",
      visibility: payload.visibility,
      status: payload.status ?? entry.status,
      hostTeamId: payload.hostTeamId ?? null,
      timezone: resolveTimezone(payload.timezone ?? entry.defaultTimezone),
      location: normalizeOptional(payload.location) ?? ""
    };

    const shouldCopyForwardInvites = payload.copyForwardInvites ?? true;
    const shouldCopyForwardFacilities = payload.copyForwardFacilities ?? true;

    if (payload.editScope === "series") {
      await updateCalendarEntryRecord({
        orgId: actor.orgId,
        entryId: entry.id,
        sourceId: entry.sourceId,
        purpose: payload.entryType === entry.entryType ? entry.purpose : undefined,
        audience: entry.audience,
        entryType: nextEntryInput.entryType,
        title: nextEntryInput.title,
        summary: normalizeOptional(nextEntryInput.summary),
        visibility: nextEntryInput.visibility,
        status: nextEntryInput.status,
        hostTeamId: nextEntryInput.hostTeamId,
        defaultTimezone: nextEntryInput.timezone,
        settingsJson: {
          ...entry.settingsJson,
          location: normalizeOptional(nextEntryInput.location)
        },
        updatedBy: actor.userId
      });

      const ruleResult = await upsertCalendarRuleAction({
        orgSlug: payload.orgSlug,
        entryId: entry.id,
        ruleId: rule.id,
        mode: recurrenceInput.mode,
        timezone: recurrenceInput.timezone,
        startDate: recurrenceInput.startDate ?? payload.localDate,
        endDate: recurrenceInput.endDate ?? undefined,
        startTime: recurrenceInput.startTime ?? undefined,
        endTime: recurrenceInput.endTime ?? undefined,
        intervalCount: recurrenceInput.intervalCount,
        intervalUnit: recurrenceInput.intervalUnit,
        byWeekday: recurrenceInput.byWeekday,
        byMonthday: recurrenceInput.byMonthday,
        endMode: recurrenceInput.endMode,
        untilDate: recurrenceInput.untilDate ?? undefined,
        maxOccurrences: recurrenceInput.maxOccurrences,
        configJson: recurrenceInput.configJson
      });

      if (!ruleResult.ok) {
        return asError(ruleResult.error);
      }

      revalidateCalendarRoutes(actor.orgSlug);
      return {
        ok: true,
        data: {
          occurrenceId: occurrence.id,
          entryId: entry.id,
          ruleId: rule.id
        }
      };
    }

    if (payload.editScope === "following") {
      const splitUntilDate = shiftLocalDate(payload.localDate, -1);
      const oldRuleResult = await upsertCalendarRuleAction({
        orgSlug: payload.orgSlug,
        entryId: entry.id,
        ruleId: rule.id,
        mode: rule.mode,
        timezone: rule.timezone,
        startDate: rule.startDate ?? payload.localDate,
        endDate: rule.endDate ?? undefined,
        startTime: rule.startTime ?? undefined,
        endTime: rule.endTime ?? undefined,
        intervalCount: rule.intervalCount ?? 1,
        intervalUnit: rule.intervalUnit ?? "week",
        byWeekday: rule.byWeekday ?? [],
        byMonthday: rule.byMonthday ?? [],
        endMode: "until_date",
        untilDate: splitUntilDate,
        maxOccurrences: null,
        configJson: rule.configJson
      });

      if (!oldRuleResult.ok) {
        return asError(oldRuleResult.error);
      }

      const nextEntry = await createCalendarEntryRecord({
        orgId: actor.orgId,
        sourceId: entry.sourceId,
        purpose: payload.entryType === entry.entryType ? entry.purpose : undefined,
        audience: entry.audience,
        entryType: nextEntryInput.entryType,
        title: nextEntryInput.title,
        summary: normalizeOptional(nextEntryInput.summary),
        visibility: nextEntryInput.visibility,
        status: nextEntryInput.status,
        hostTeamId: nextEntryInput.hostTeamId,
        defaultTimezone: nextEntryInput.timezone,
        settingsJson: {
          ...entry.settingsJson,
          location: normalizeOptional(nextEntryInput.location)
        },
        createdBy: actor.userId
      });

      const newRuleResult = await upsertCalendarRuleAction({
        orgSlug: payload.orgSlug,
        entryId: nextEntry.id,
        mode: recurrenceInput.mode,
        timezone: recurrenceInput.timezone,
        startDate: payload.localDate,
        endDate: recurrenceInput.endDate ?? undefined,
        startTime: normalizedWindow.localStartTime,
        endTime: normalizedWindow.localEndTime,
        intervalCount: recurrenceInput.intervalCount,
        intervalUnit: recurrenceInput.intervalUnit,
        byWeekday: recurrenceInput.byWeekday,
        byMonthday: recurrenceInput.byMonthday,
        endMode: recurrenceInput.endMode,
        untilDate: recurrenceInput.untilDate ?? undefined,
        maxOccurrences: recurrenceInput.maxOccurrences,
        configJson: recurrenceInput.configJson
      });

      if (!newRuleResult.ok) {
        return asError(newRuleResult.error);
      }

      if (shouldCopyForwardFacilities) {
        const sourceRuleAllocations = await listCalendarRuleFacilityAllocations(actor.orgId, { ruleId: rule.id });
        if (sourceRuleAllocations.length > 0) {
          await replaceCalendarRuleFacilityAllocations({
            orgId: actor.orgId,
            ruleId: newRuleResult.data.ruleId,
            allocations: sourceRuleAllocations.map((allocation) => ({
              spaceId: allocation.spaceId,
              configurationId: allocation.configurationId,
              lockMode: allocation.lockMode,
              allowShared: allocation.allowShared,
              metadataJson: allocation.metadataJson
            })),
            actorUserId: actor.userId
          });
        }
      }

      const newSeriesOccurrences = await listCalendarOccurrencesByRule(actor.orgId, newRuleResult.data.ruleId);
      if (nextEntry.hostTeamId) {
        for (const nextOccurrence of newSeriesOccurrences) {
          await upsertOccurrenceTeamInvite({
            orgId: actor.orgId,
            occurrenceId: nextOccurrence.id,
            teamId: nextEntry.hostTeamId,
            role: "host",
            inviteStatus: "accepted",
            invitedByUserId: actor.userId,
            invitedAt: new Date().toISOString(),
            respondedByUserId: actor.userId,
            respondedAt: new Date().toISOString()
          });
        }
      }

      if (shouldCopyForwardInvites) {
        const selectedInvites = await listOccurrenceTeamInvites(actor.orgId, { occurrenceId: occurrence.id, includeInactive: true });
        const participantInvites = selectedInvites.filter((invite) => invite.role === "participant" && ["accepted", "pending"].includes(invite.inviteStatus));
        for (const nextOccurrence of newSeriesOccurrences) {
          for (const invite of participantInvites) {
            await upsertOccurrenceTeamInvite({
              orgId: actor.orgId,
              occurrenceId: nextOccurrence.id,
              teamId: invite.teamId,
              role: invite.role,
              inviteStatus: invite.inviteStatus,
              invitedByUserId: invite.invitedByUserId,
              invitedAt: invite.invitedAt,
              respondedByUserId: invite.respondedByUserId,
              respondedAt: invite.respondedAt
            });
          }
        }
      }

      const selectedInNewSeries =
        newSeriesOccurrences.find((item) => item.localDate === payload.localDate && item.localStartTime === normalizedWindow.localStartTime) ??
        newSeriesOccurrences[0] ??
        null;

      revalidateCalendarRoutes(actor.orgSlug);
      return {
        ok: true,
        data: {
          occurrenceId: selectedInNewSeries?.id ?? occurrence.id,
          entryId: nextEntry.id,
          ruleId: newRuleResult.data.ruleId
        }
      };
    }

    if (occurrence.sourceType === "override") {
      await updateCalendarEntryRecord({
        orgId: actor.orgId,
        entryId: entry.id,
        sourceId: entry.sourceId,
        purpose: payload.entryType === entry.entryType ? entry.purpose : undefined,
        audience: entry.audience,
        entryType: nextEntryInput.entryType,
        title: nextEntryInput.title,
        summary: normalizeOptional(nextEntryInput.summary),
        visibility: nextEntryInput.visibility,
        status: nextEntryInput.status,
        hostTeamId: nextEntryInput.hostTeamId,
        defaultTimezone: nextEntryInput.timezone,
        settingsJson: {
          ...entry.settingsJson,
          location: normalizeOptional(nextEntryInput.location)
        },
        updatedBy: actor.userId
      });

      await updateCalendarOccurrenceRecord({
        orgId: actor.orgId,
        occurrenceId: occurrence.id,
        timezone,
        localDate: payload.localDate,
        localStartTime: normalizedWindow.localStartTime,
        localEndTime: normalizedWindow.localEndTime,
        startsAtUtc: normalizedWindow.startsAtUtc,
        endsAtUtc: normalizedWindow.endsAtUtc,
        status: occurrence.status,
        metadataJson: payload.metadataJson ?? occurrence.metadataJson,
        actorUserId: actor.userId
      });

      revalidateCalendarRoutes(actor.orgSlug);
      return {
        ok: true,
        data: {
          occurrenceId: occurrence.id,
          entryId: entry.id,
          ruleId: rule.id
        }
      };
    }

    const overrideEntry = await createCalendarEntryRecord({
      orgId: actor.orgId,
      sourceId: entry.sourceId,
      purpose: payload.entryType === entry.entryType ? entry.purpose : undefined,
      audience: entry.audience,
      entryType: nextEntryInput.entryType,
      title: nextEntryInput.title,
      summary: normalizeOptional(nextEntryInput.summary),
      visibility: nextEntryInput.visibility,
      status: nextEntryInput.status,
      hostTeamId: nextEntryInput.hostTeamId,
      defaultTimezone: nextEntryInput.timezone,
      settingsJson: {
        ...entry.settingsJson,
        location: normalizeOptional(nextEntryInput.location)
      },
      createdBy: actor.userId
    });

    const overrideOccurrence = await insertCalendarOccurrenceRecord({
      orgId: actor.orgId,
      entryId: overrideEntry.id,
      sourceRuleId: rule.id,
      sourceType: "override",
      sourceKey: `override:${occurrence.sourceKey}:${randomUUID()}`,
      timezone,
      localDate: payload.localDate,
      localStartTime: normalizedWindow.localStartTime,
      localEndTime: normalizedWindow.localEndTime,
      startsAtUtc: normalizedWindow.startsAtUtc,
      endsAtUtc: normalizedWindow.endsAtUtc,
      status: "scheduled",
      metadataJson: payload.metadataJson ?? occurrence.metadataJson,
      actorUserId: actor.userId
    });

    if (shouldCopyForwardFacilities) {
      const sourceAllocations = await listOccurrenceFacilityAllocations(actor.orgId, { occurrenceId: occurrence.id });
      if (sourceAllocations.length > 0) {
        await replaceOccurrenceFacilityAllocations({
          orgId: actor.orgId,
          occurrenceId: overrideOccurrence.id,
          allocations: sourceAllocations.map((allocation) => ({
            spaceId: allocation.spaceId,
            configurationId: allocation.configurationId,
            lockMode: allocation.lockMode,
            allowShared: allocation.allowShared,
            metadataJson: allocation.metadataJson
          })),
          actorUserId: actor.userId
        });
      }
    }

    if (nextEntryInput.hostTeamId) {
      await upsertOccurrenceTeamInvite({
        orgId: actor.orgId,
        occurrenceId: overrideOccurrence.id,
        teamId: nextEntryInput.hostTeamId,
        role: "host",
        inviteStatus: "accepted",
        invitedByUserId: actor.userId,
        invitedAt: new Date().toISOString(),
        respondedByUserId: actor.userId,
        respondedAt: new Date().toISOString()
      });
    }

    if (shouldCopyForwardInvites) {
      const sourceInvites = await listOccurrenceTeamInvites(actor.orgId, { occurrenceId: occurrence.id, includeInactive: true });
      const participantInvites = sourceInvites.filter((invite) => invite.role === "participant" && ["accepted", "pending"].includes(invite.inviteStatus));
      for (const invite of participantInvites) {
        await upsertOccurrenceTeamInvite({
          orgId: actor.orgId,
          occurrenceId: overrideOccurrence.id,
          teamId: invite.teamId,
          role: invite.role,
          inviteStatus: invite.inviteStatus,
          invitedByUserId: invite.invitedByUserId,
          invitedAt: invite.invitedAt,
          respondedByUserId: invite.respondedByUserId,
          respondedAt: invite.respondedAt
        });
      }
    }

    await upsertCalendarRuleException({
      orgId: actor.orgId,
      ruleId: rule.id,
      sourceKey: occurrence.sourceKey,
      kind: "override",
      overrideOccurrenceId: overrideOccurrence.id,
      payloadJson: {
        reason: "single-occurrence-edit"
      },
      actorUserId: actor.userId
    });

    await setCalendarOccurrenceStatus({
      orgId: actor.orgId,
      occurrenceId: occurrence.id,
      status: "cancelled",
      actorUserId: actor.userId
    });

    revalidateCalendarRoutes(actor.orgSlug);
    return {
      ok: true,
      data: {
        occurrenceId: overrideOccurrence.id,
        entryId: overrideEntry.id,
        ruleId: rule.id
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to apply recurring update.");
  }
}

export async function setOccurrenceStatusAction(input: z.input<typeof occurrenceStatusSchema>): Promise<CalendarActionResult<{ occurrenceId: string }>> {
  const parsed = occurrenceStatusSchema.safeParse(input);

  if (!parsed.success) {
    return asError("Invalid occurrence status mutation.");
  }

  try {
    const payload = parsed.data;
    const actor = await requireCalendarActor(payload.orgSlug);
    const occurrence = await getCalendarOccurrenceById(actor.orgId, payload.occurrenceId);

    if (!occurrence) {
      return asError("Occurrence not found.");
    }

    const entry = await getCalendarEntryById(actor.orgId, occurrence.entryId);
    if (!entry) {
      return asError("Calendar entry not found.");
    }

    const allowed = await canManageEntry(actor.orgId, actor.userId, entry, actor.hasCalendarWrite);
    if (!allowed) {
      return asError("You do not have permission to change this occurrence status.");
    }

    const updated = await setCalendarOccurrenceStatus({
      orgId: actor.orgId,
      occurrenceId: payload.occurrenceId,
      status: payload.status,
      actorUserId: actor.userId
    });

    if (payload.status === "cancelled" && entry.hostTeamId) {
      await notifyOccurrenceCancelled({
        orgId: actor.orgId,
        occurrenceId: updated.id,
        hostTeamId: entry.hostTeamId,
        actorUserId: actor.userId,
        title: `${entry.title} was cancelled`
      }).catch(() => null);
    }

    revalidateCalendarRoutes(actor.orgSlug);

    return {
      ok: true,
      data: {
        occurrenceId: updated.id
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to update occurrence status.");
  }
}

export async function deleteOccurrenceAction(input: z.input<typeof deleteOccurrenceSchema>): Promise<CalendarActionResult<{ occurrenceId: string }>> {
  const parsed = deleteOccurrenceSchema.safeParse(input);

  if (!parsed.success) {
    return asError("Invalid occurrence delete request.");
  }

  try {
    const payload = parsed.data;
    const actor = await requireCalendarActor(payload.orgSlug);
    const occurrence = await getCalendarOccurrenceById(actor.orgId, payload.occurrenceId);

    if (!occurrence) {
      return asError("Occurrence not found.");
    }

    const entry = await getCalendarEntryById(actor.orgId, occurrence.entryId);
    if (!entry) {
      return asError("Calendar entry not found.");
    }

    const allowed = await canManageEntry(actor.orgId, actor.userId, entry, actor.hasCalendarWrite);
    if (!allowed) {
      return asError("You do not have permission to delete this occurrence.");
    }

    await deleteCalendarOccurrenceRecord({
      orgId: actor.orgId,
      occurrenceId: payload.occurrenceId
    });

    if (entry.hostTeamId) {
      await notifyOccurrenceCancelled({
        orgId: actor.orgId,
        occurrenceId: payload.occurrenceId,
        hostTeamId: entry.hostTeamId,
        actorUserId: actor.userId,
        title: `${entry.title} was deleted`
      }).catch(() => null);
    }

    revalidateCalendarRoutes(actor.orgSlug);

    return {
      ok: true,
      data: {
        occurrenceId: payload.occurrenceId
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to delete occurrence.");
  }
}

export async function deleteRecurringOccurrenceAction(
  input: z.input<typeof deleteRecurringOccurrenceSchema>
): Promise<CalendarActionResult<{ occurrenceId: string; scope: "occurrence" | "following" | "series" }>> {
  const parsed = deleteRecurringOccurrenceSchema.safeParse(input);

  if (!parsed.success) {
    return asError("Invalid recurring delete request.");
  }

  try {
    const payload = parsed.data;
    const actor = await requireCalendarActor(payload.orgSlug);
    const occurrence = await getCalendarOccurrenceById(actor.orgId, payload.occurrenceId);
    if (!occurrence) {
      return asError("Occurrence not found.");
    }
    if (!occurrence.sourceRuleId) {
      return asError("This occurrence is not part of a recurring series.");
    }

    const rule = await getCalendarRuleById(actor.orgId, occurrence.sourceRuleId);
    if (!rule) {
      return asError("Recurring rule not found.");
    }

    const entry = await getCalendarEntryById(actor.orgId, occurrence.entryId);
    if (!entry) {
      return asError("Calendar entry not found.");
    }

    const allowed = await canManageEntry(actor.orgId, actor.userId, entry, actor.hasCalendarWrite);
    if (!allowed) {
      return asError("You do not have permission to delete this recurring event.");
    }

    if (payload.deleteScope === "series") {
      await deleteCalendarRuleRecord(actor.orgId, rule.id);

      const remainingRules = await listCalendarRules(actor.orgId, { entryId: entry.id });
      const remainingOccurrences = await listCalendarOccurrences(actor.orgId, {
        entryId: entry.id,
        includeCancelled: true
      });
      if (remainingRules.length === 0 && remainingOccurrences.length === 0) {
        await deleteCalendarEntryRecord(actor.orgId, entry.id);
      }

      revalidateCalendarRoutes(actor.orgSlug);
      return {
        ok: true,
        data: {
          occurrenceId: payload.occurrenceId,
          scope: payload.deleteScope
        }
      };
    }

    if (payload.deleteScope === "following") {
      const splitUntilDate = shiftLocalDate(occurrence.localDate, -1);
      if (!rule.startDate || splitUntilDate < rule.startDate) {
        await deleteCalendarRuleRecord(actor.orgId, rule.id);
      } else {
        const ruleResult = await upsertCalendarRuleAction({
          orgSlug: payload.orgSlug,
          entryId: rule.entryId,
          ruleId: rule.id,
          mode: rule.mode,
          timezone: rule.timezone,
          startDate: rule.startDate,
          endDate: rule.endDate ?? undefined,
          startTime: rule.startTime ?? undefined,
          endTime: rule.endTime ?? undefined,
          intervalCount: rule.intervalCount ?? 1,
          intervalUnit: rule.intervalUnit ?? "week",
          byWeekday: rule.byWeekday ?? [],
          byMonthday: rule.byMonthday ?? [],
          endMode: "until_date",
          untilDate: splitUntilDate,
          maxOccurrences: null,
          configJson: rule.configJson
        });
        if (!ruleResult.ok) {
          return asError(ruleResult.error);
        }
      }

      const supabase = await createSupabaseServer();
      const { error: deleteError } = await supabase
        .schema("calendar").from("calendar_item_occurrences")
        .delete()
        .eq("org_id", actor.orgId)
        .eq("source_rule_id", rule.id)
        .gte("starts_at_utc", occurrence.startsAtUtc);
      if (deleteError) {
        return asError(`Unable to delete following occurrences: ${deleteError.message}`);
      }

      revalidateCalendarRoutes(actor.orgSlug);
      return {
        ok: true,
        data: {
          occurrenceId: payload.occurrenceId,
          scope: payload.deleteScope
        }
      };
    }

    const originalSourceKey = resolveOriginalSourceKey(occurrence.sourceKey);
    await upsertCalendarRuleException({
      orgId: actor.orgId,
      ruleId: rule.id,
      sourceKey: originalSourceKey,
      kind: "skip",
      overrideOccurrenceId: null,
      payloadJson: {
        reason: "single-occurrence-delete"
      },
      actorUserId: actor.userId
    });
    await deleteCalendarRuleException({
      orgId: actor.orgId,
      ruleId: rule.id,
      sourceKey: originalSourceKey,
      kind: "override"
    }).catch(() => null);
    await deleteCalendarOccurrenceRecord({
      orgId: actor.orgId,
      occurrenceId: occurrence.id
    });

    revalidateCalendarRoutes(actor.orgSlug);
    return {
      ok: true,
      data: {
        occurrenceId: payload.occurrenceId,
        scope: payload.deleteScope
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to delete recurring occurrence.");
  }
}

export async function assignFacilityAllocationAction(input: z.input<typeof allocationSchema>): Promise<CalendarActionResult<{ occurrenceId: string }>> {
  const parsed = allocationSchema.safeParse(input);

  if (!parsed.success) {
    return asError("Please review the facility allocation details.");
  }

  try {
    const payload = parsed.data;
    const actor = await requireCalendarActor(payload.orgSlug);
    const occurrence = await getCalendarOccurrenceById(actor.orgId, payload.occurrenceId);

    if (!occurrence) {
      return asError("Occurrence not found.");
    }

    const entry = await getCalendarEntryById(actor.orgId, occurrence.entryId);
    if (!entry) {
      return asError("Calendar entry not found.");
    }

    const allowed = await canManageEntry(actor.orgId, actor.userId, entry, actor.hasCalendarWrite);
    if (!allowed) {
      return asError("You do not have permission to assign this facility.");
    }

    const configuration = payload.configurationId
      ? (await listFacilitySpaceConfigurations(actor.orgId, { spaceId: payload.spaceId, includeInactive: true })).find((item) => item.id === payload.configurationId)
      : null;

    const resolvedConfiguration =
      configuration ??
      (await getOrCreateDefaultFacilitySpaceConfiguration({
        orgId: actor.orgId,
        spaceId: payload.spaceId,
        actorUserId: actor.userId
      }));

    await upsertOccurrenceFacilityAllocation({
      orgId: actor.orgId,
      occurrenceId: payload.occurrenceId,
      spaceId: payload.spaceId,
      configurationId: resolvedConfiguration.id,
      lockMode: payload.lockMode ?? "exclusive",
      allowShared: payload.allowShared ?? false,
      actorUserId: actor.userId
    });

    revalidateCalendarRoutes(actor.orgSlug);

    return {
      ok: true,
      data: {
        occurrenceId: payload.occurrenceId
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);

    if (error instanceof Error && error.message.includes("calendar_occurrence_facility_allocations_no_overlap")) {
      return asError("This facility configuration is already reserved for that time window.");
    }

    return asError("Unable to assign this facility allocation.");
  }
}

export async function setOccurrenceFacilityAllocationsAction(
  input: z.input<typeof setAllocationsSchema>
): Promise<CalendarActionResult<{ occurrenceId: string }, { conflicts: FacilityAllocationConflict[] }>> {
  const parsed = setAllocationsSchema.safeParse(input);

  if (!parsed.success) {
    return asError("Please review the facility allocation details.");
  }

  try {
    const payload = parsed.data;
    const actor = await requireCalendarActor(payload.orgSlug);
    const occurrence = await getCalendarOccurrenceById(actor.orgId, payload.occurrenceId);

    if (!occurrence) {
      return asError("Occurrence not found.");
    }

    const entry = await getCalendarEntryById(actor.orgId, occurrence.entryId);
    if (!entry) {
      return asError("Calendar entry not found.");
    }

    const allowed = await canManageEntry(actor.orgId, actor.userId, entry, actor.hasCalendarWrite);
    if (!allowed) {
      return asError("You do not have permission to assign facilities for this occurrence.");
    }

    const resolvedAllocations = await resolveAllocationInputs(actor.orgId, actor.userId, payload.allocations);
    const [existingAllocations, facilityReadModel] = await Promise.all([
      listOccurrenceFacilityAllocations(actor.orgId),
      listFacilityReservationReadModel(actor.orgId)
    ]);
    const { allocationsBySpace, reservationsBySpace } = buildAllocationConflictIndex(existingAllocations, facilityReadModel.reservations);

    const conflicts = resolvedAllocations.flatMap((allocation) =>
      collectAllocationConflicts({
        occurrenceId: occurrence.id,
        startsAtUtc: occurrence.startsAtUtc,
        endsAtUtc: occurrence.endsAtUtc,
        spaceId: allocation.spaceId,
        allocationsBySpace,
        reservationsBySpace
      })
    );

    if (conflicts.length > 0) {
      return asError("Selected facility spaces are already booked in this time window.", { conflicts });
    }

    await replaceOccurrenceFacilityAllocations({
      orgId: actor.orgId,
      occurrenceId: occurrence.id,
      allocations: resolvedAllocations,
      actorUserId: actor.userId
    });

    revalidateCalendarRoutes(actor.orgSlug);

    return {
      ok: true,
      data: {
        occurrenceId: occurrence.id
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to update facility allocations right now.");
  }
}

export async function setRuleFacilityAllocationsAction(
  input: z.input<typeof setRuleAllocationsSchema>
): Promise<CalendarActionResult<{ ruleId: string; conflicts: RuleAllocationConflictSummary[] }>> {
  const parsed = setRuleAllocationsSchema.safeParse(input);

  if (!parsed.success) {
    return asError("Please review the facility allocation details.");
  }

  try {
    const payload = parsed.data;
    const actor = await requireCalendarActor(payload.orgSlug);
    const rule = await getCalendarRuleById(actor.orgId, payload.ruleId);

    if (!rule) {
      return asError("Calendar rule not found.");
    }

    const entry = await getCalendarEntryById(actor.orgId, rule.entryId);
    if (!entry) {
      return asError("Calendar entry not found.");
    }

    const allowed = await canManageEntry(actor.orgId, actor.userId, entry, actor.hasCalendarWrite);
    if (!allowed) {
      return asError("You do not have permission to assign facilities for this schedule.");
    }

    const resolvedAllocations = await resolveAllocationInputs(actor.orgId, actor.userId, payload.allocations);
    await replaceCalendarRuleFacilityAllocations({
      orgId: actor.orgId,
      ruleId: rule.id,
      allocations: resolvedAllocations,
      actorUserId: actor.userId
    });

    const occurrences = await listCalendarOccurrencesByRule(actor.orgId, rule.id);
    const conflicts = await applyRuleAllocationsToOccurrences({
      orgId: actor.orgId,
      actorUserId: actor.userId,
      occurrences,
      allocations: resolvedAllocations
    });

    revalidateCalendarRoutes(actor.orgSlug);

    return {
      ok: true,
      data: {
        ruleId: rule.id,
        conflicts
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to update facility allocations right now.");
  }
}

export async function inviteTeamToOccurrenceAction(input: z.input<typeof inviteSchema>): Promise<CalendarActionResult<{ occurrenceId: string; teamId: string }>> {
  const parsed = inviteSchema.safeParse(input);

  if (!parsed.success) {
    return asError("Invalid invite request.");
  }

  try {
    const payload = parsed.data;
    const actor = await requireCalendarActor(payload.orgSlug);
    const occurrence = await getCalendarOccurrenceById(actor.orgId, payload.occurrenceId);

    if (!occurrence) {
      return asError("Occurrence not found.");
    }

    const entry = await getCalendarEntryById(actor.orgId, occurrence.entryId);
    if (!entry || !entry.hostTeamId) {
      return asError("This occurrence is not a host-team practice.");
    }

    const allowed = await canManageEntry(actor.orgId, actor.userId, entry, actor.hasCalendarWrite);
    if (!allowed) {
      return asError("You do not have permission to invite teams to this occurrence.");
    }

    await upsertOccurrenceTeamInvite({
      orgId: actor.orgId,
      occurrenceId: payload.occurrenceId,
      teamId: entry.hostTeamId,
      role: "host",
      inviteStatus: "accepted",
      invitedByUserId: actor.userId,
      invitedAt: new Date().toISOString(),
      respondedByUserId: actor.userId,
      respondedAt: new Date().toISOString()
    });

    await upsertOccurrenceTeamInvite({
      orgId: actor.orgId,
      occurrenceId: payload.occurrenceId,
      teamId: payload.teamId,
      role: "participant",
      inviteStatus: "pending",
      invitedByUserId: actor.userId,
      invitedAt: new Date().toISOString()
    });

    await notifyInviteSent({
      orgId: actor.orgId,
      occurrenceId: payload.occurrenceId,
      hostTeamId: entry.hostTeamId,
      invitedTeamId: payload.teamId,
      actorUserId: actor.userId,
      title: `${entry.title}: team invite sent`
    }).catch(() => null);

    revalidateCalendarRoutes(actor.orgSlug);

    return {
      ok: true,
      data: {
        occurrenceId: payload.occurrenceId,
        teamId: payload.teamId
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to send team invite.");
  }
}

export async function respondToTeamInviteAction(input: z.input<typeof respondInviteSchema>): Promise<CalendarActionResult<{ occurrenceId: string; teamId: string }>> {
  const parsed = respondInviteSchema.safeParse(input);

  if (!parsed.success) {
    return asError("Invalid invite response.");
  }

  try {
    const payload = parsed.data;
    const actor = await requireCalendarActor(payload.orgSlug);
    const occurrence = await getCalendarOccurrenceById(actor.orgId, payload.occurrenceId);

    if (!occurrence) {
      return asError("Occurrence not found.");
    }

    const entry = await getCalendarEntryById(actor.orgId, occurrence.entryId);
    if (!entry || !entry.hostTeamId) {
      return asError("This occurrence is not eligible for team invite responses.");
    }

    const hasTeamAccess = await isTeamStaffAdmin(actor.orgId, actor.userId, payload.teamId);
    if (!actor.hasCalendarWrite && !hasTeamAccess) {
      return asError("You do not have permission to respond for this team.");
    }

    const currentInvite = await getOccurrenceTeamInvite(actor.orgId, payload.occurrenceId, payload.teamId);
    if (!currentInvite) {
      return asError("Invite not found.");
    }

    await upsertOccurrenceTeamInvite({
      orgId: actor.orgId,
      occurrenceId: payload.occurrenceId,
      teamId: payload.teamId,
      role: currentInvite.role,
      inviteStatus: payload.response,
      invitedByUserId: currentInvite.invitedByUserId,
      invitedAt: currentInvite.invitedAt,
      respondedByUserId: actor.userId,
      respondedAt: new Date().toISOString()
    });

    await notifyInviteResponded({
      orgId: actor.orgId,
      occurrenceId: payload.occurrenceId,
      hostTeamId: entry.hostTeamId,
      invitedTeamId: payload.teamId,
      actorUserId: actor.userId,
      response: payload.response,
      title: `${entry.title}: invite ${payload.response}`
    }).catch(() => null);

    revalidateCalendarRoutes(actor.orgSlug);

    return {
      ok: true,
      data: {
        occurrenceId: payload.occurrenceId,
        teamId: payload.teamId
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to apply invite response.");
  }
}

export async function leaveSharedOccurrenceAction(input: z.input<typeof leaveSchema>): Promise<CalendarActionResult<{ occurrenceId: string; teamId: string }>> {
  const parsed = leaveSchema.safeParse(input);

  if (!parsed.success) {
    return asError("Invalid leave request.");
  }

  try {
    const payload = parsed.data;
    const actor = await requireCalendarActor(payload.orgSlug);
    const occurrence = await getCalendarOccurrenceById(actor.orgId, payload.occurrenceId);

    if (!occurrence) {
      return asError("Occurrence not found.");
    }

    const entry = await getCalendarEntryById(actor.orgId, occurrence.entryId);
    if (!entry || !entry.hostTeamId) {
      return asError("This occurrence does not support shared team leave.");
    }

    if (entry.hostTeamId === payload.teamId) {
      return asError("Host team cannot leave the occurrence. Host can cancel it instead.");
    }

    const hasTeamAccess = await isTeamStaffAdmin(actor.orgId, actor.userId, payload.teamId);
    if (!actor.hasCalendarWrite && !hasTeamAccess) {
      return asError("You do not have permission to leave this occurrence for that team.");
    }

    const invite = await getOccurrenceTeamInvite(actor.orgId, payload.occurrenceId, payload.teamId);
    if (!invite) {
      return asError("Invite row not found.");
    }

    await upsertOccurrenceTeamInvite({
      orgId: actor.orgId,
      occurrenceId: payload.occurrenceId,
      teamId: payload.teamId,
      role: invite.role,
      inviteStatus: "left",
      invitedByUserId: invite.invitedByUserId,
      invitedAt: invite.invitedAt,
      respondedByUserId: actor.userId,
      respondedAt: new Date().toISOString()
    });

    revalidateCalendarRoutes(actor.orgSlug);

    return {
      ok: true,
      data: {
        occurrenceId: payload.occurrenceId,
        teamId: payload.teamId
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to leave the shared occurrence.");
  }
}

export async function ensureFacilityConfigurationAction(input: {
  orgSlug: string;
  spaceId: string;
  name: string;
  capacityTeams?: number | null;
}): Promise<CalendarActionResult<{ configurationId: string }>> {
  try {
    const actor = await requireCalendarActor(input.orgSlug);

    if (!actor.hasCalendarWrite) {
      return asError("You do not have permission to create facility configurations.");
    }

    const created = await createFacilitySpaceConfiguration({
      orgId: actor.orgId,
      spaceId: input.spaceId,
      name: input.name,
      slug: input.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, ""),
      capacityTeams: input.capacityTeams ?? 1,
      actorUserId: actor.userId
    });

    revalidateCalendarRoutes(actor.orgSlug);

    return {
      ok: true,
      data: {
        configurationId: created.id
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to create facility configuration.");
  }
}
