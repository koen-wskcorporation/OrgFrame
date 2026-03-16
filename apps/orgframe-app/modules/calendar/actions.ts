"use server";

import { randomUUID, createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { rethrowIfNavigationError } from "@/lib/actions/rethrowIfNavigationError";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { can } from "@/lib/permissions/can";
import { createSupabaseServer } from "@/lib/supabase/server";
import {
  createCalendarEntryRecord,
  createFacilitySpaceConfiguration,
  deleteCalendarEntryRecord,
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
  upsertCalendarRuleException,
  upsertCalendarRuleRecord,
  upsertOccurrenceFacilityAllocation,
  upsertOccurrenceTeamInvite,
  upsertRuleGeneratedOccurrences
} from "@/modules/calendar/db/queries";
import { listFacilityReservationReadModel } from "@/modules/facilities/db/queries";
import { notifyInviteResponded, notifyInviteSent, notifyOccurrenceCancelled } from "@/modules/calendar/notifications";
import { generateOccurrencesForRule, zonedLocalToUtc } from "@/modules/calendar/rule-engine";
import type {
  CalendarEntry,
  CalendarEntryStatus,
  CalendarEntryType,
  CalendarIntervalUnit,
  CalendarOccurrenceStatus,
  CalendarReadModel,
  CalendarRuleEndMode,
  CalendarRuleMode,
  FacilityLockMode
} from "@/modules/calendar/types";

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
    .from("program_team_staff")
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

function revalidateCalendarRoutes(orgSlug: string) {
  revalidatePath(`/${orgSlug}/tools/calendar`);
  revalidatePath(`/${orgSlug}/tools/facilities`);
  revalidatePath(`/${orgSlug}/tools/programs`);
  revalidatePath(`/${orgSlug}`);
  revalidatePath(`/${orgSlug}`, "layout");
}

const createEntrySchema = z.object({
  orgSlug: textSchema.min(1),
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

const occurrenceStatusSchema = z.object({
  orgSlug: textSchema.min(1),
  occurrenceId: z.string().uuid(),
  status: z.enum(["scheduled", "cancelled"] satisfies CalendarOccurrenceStatus[])
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

    const [readModel, activeTeams, facilityReadModel] = await Promise.all([
      listCalendarReadModel(actor.orgId),
      listOrgActiveTeams(actor.orgId),
      listFacilityReservationReadModel(actor.orgId)
    ]);

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
    return asError("Unable to load calendar workspace.");
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

    const ruleAllocations = await listCalendarRuleFacilityAllocations(actor.orgId, savedRule.id);
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
