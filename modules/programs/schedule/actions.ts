"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { rethrowIfNavigationError } from "@/lib/actions/rethrowIfNavigationError";
import { requireOrgPermission } from "@/lib/permissions/requireOrgPermission";
import { getProgramById } from "@/modules/programs/db/queries";
import {
  deleteProgramScheduleExceptionV2,
  deleteProgramScheduleRuleV2,
  getProgramOccurrenceByIdV2,
  getProgramScheduleRuleByIdV2,
  insertProgramOccurrenceV2,
  listProgramOccurrencesV2,
  listProgramScheduleExceptionsV2,
  listProgramScheduleReadModelV2,
  markProgramScheduleVersionV2,
  setOccurrenceStatusBySourceKeyV2,
  updateProgramOccurrenceV2,
  upsertProgramScheduleExceptionV2,
  upsertProgramScheduleRuleV2,
  upsertRuleGeneratedOccurrencesV2
} from "@/modules/programs/schedule/db/queries";
import { generateOccurrencesForRule, zonedLocalToUtc } from "@/modules/programs/schedule/rule-engine";
import type {
  ProgramOccurrence,
  ProgramScheduleEndMode,
  ProgramScheduleExceptionKind,
  ProgramScheduleIntervalUnit,
  ProgramScheduleMode
} from "@/modules/programs/types";

type ScheduleActionResult<TData = undefined> =
  | {
      ok: true;
      data: TData;
    }
  | {
      ok: false;
      error: string;
    };

function asError(error: string): ScheduleActionResult<never> {
  return {
    ok: false,
    error
  };
}

function normalizeOptional(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function buildRuleHash(payload: Record<string, unknown>) {
  return createHash("sha1").update(JSON.stringify(payload)).digest("hex");
}

function normalizeDate(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, 10);
}

const upsertRuleSchema = z.object({
  orgSlug: z.string().trim().min(1),
  programId: z.string().uuid(),
  ruleId: z.string().uuid().optional(),
  programNodeId: z.string().uuid().nullable().optional(),
  mode: z.enum(["single_date", "multiple_specific_dates", "repeating_pattern", "continuous_date_range", "custom_advanced"] satisfies ProgramScheduleMode[]),
  title: z.string().trim().max(120).optional(),
  timezone: z.string().trim().min(1).max(80),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  startTime: z.string().trim().optional(),
  endTime: z.string().trim().optional(),
  intervalCount: z.number().int().min(1).optional(),
  intervalUnit: z.enum(["day", "week", "month"] satisfies ProgramScheduleIntervalUnit[]).optional(),
  byWeekday: z.array(z.number().int().min(0).max(6)).optional(),
  byMonthday: z.array(z.number().int().min(1).max(31)).optional(),
  endMode: z.enum(["never", "until_date", "after_occurrences"] satisfies ProgramScheduleEndMode[]).optional(),
  untilDate: z.string().trim().optional(),
  maxOccurrences: z.number().int().min(1).nullable().optional(),
  sortIndex: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  configJson: z.record(z.string(), z.unknown()).optional()
});

const deleteRuleSchema = z.object({
  orgSlug: z.string().trim().min(1),
  programId: z.string().uuid(),
  ruleId: z.string().uuid()
});

const addManualOccurrenceSchema = z.object({
  orgSlug: z.string().trim().min(1),
  programId: z.string().uuid(),
  programNodeId: z.string().uuid().nullable().optional(),
  title: z.string().trim().max(120).optional(),
  timezone: z.string().trim().min(1).max(80),
  localDate: z.string().trim().min(10).max(10),
  localStartTime: z.string().trim().optional(),
  localEndTime: z.string().trim().optional()
});

const updateOccurrenceSchema = z.object({
  orgSlug: z.string().trim().min(1),
  programId: z.string().uuid(),
  occurrenceId: z.string().uuid(),
  title: z.string().trim().max(120).optional(),
  programNodeId: z.string().uuid().nullable().optional(),
  timezone: z.string().trim().min(1).max(80),
  localDate: z.string().trim().min(10).max(10),
  localStartTime: z.string().trim().optional(),
  localEndTime: z.string().trim().optional()
});

const skipOccurrenceSchema = z.object({
  orgSlug: z.string().trim().min(1),
  programId: z.string().uuid(),
  occurrenceId: z.string().uuid()
});

const restoreOccurrenceSchema = z.object({
  orgSlug: z.string().trim().min(1),
  programId: z.string().uuid(),
  ruleId: z.string().uuid(),
  sourceKey: z.string().trim().min(1)
});

async function refreshScheduleData(orgSlug: string, programId: string) {
  const readModel = await listProgramScheduleReadModelV2(programId);
  revalidatePath(`/${orgSlug}/tools/programs/${programId}`);
  revalidatePath(`/${orgSlug}/tools/programs/${programId}/schedule`);
  return readModel;
}

export async function upsertProgramScheduleRuleAction(
  input: z.input<typeof upsertRuleSchema>
): Promise<ScheduleActionResult<{ ruleId: string; readModel: Awaited<ReturnType<typeof listProgramScheduleReadModelV2>> }>> {
  const parsed = upsertRuleSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Please review the schedule rule details.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "programs.write");
    const program = await getProgramById(org.orgId, payload.programId);
    if (!program) {
      return asError("Program not found.");
    }

    const normalizedShape = {
      mode: payload.mode,
      timezone: payload.timezone,
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

    const savedRule = await upsertProgramScheduleRuleV2({
      programId: payload.programId,
      ruleId: payload.ruleId,
      programNodeId: payload.programNodeId ?? null,
      mode: payload.mode,
      title: normalizeOptional(payload.title),
      timezone: payload.timezone,
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
      ruleHash: buildRuleHash(normalizedShape)
    });

    const generated = generateOccurrencesForRule(savedRule);
    const exceptions = await listProgramScheduleExceptionsV2(payload.programId, { ruleId: savedRule.id });
    const suppressedKeys = new Set(
      exceptions
        .filter((exception) => exception.kind === "skip" || exception.kind === "override")
        .map((exception) => exception.sourceKey)
    );
    const filteredGenerated = generated.filter((occurrence) => !suppressedKeys.has(occurrence.sourceKey));
    await upsertRuleGeneratedOccurrencesV2(payload.programId, savedRule.id, filteredGenerated);
    await markProgramScheduleVersionV2(payload.programId);

    for (const suppressedKey of suppressedKeys) {
      await setOccurrenceStatusBySourceKeyV2(payload.programId, suppressedKey, "cancelled");
    }

    const readModel = await refreshScheduleData(org.orgSlug, payload.programId);
    revalidatePath(`/${org.orgSlug}/programs/${program.slug}`);

    return {
      ok: true,
      data: {
        ruleId: savedRule.id,
        readModel
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to save this schedule rule right now.");
  }
}

export async function deleteProgramScheduleRuleAction(
  input: z.input<typeof deleteRuleSchema>
): Promise<ScheduleActionResult<{ readModel: Awaited<ReturnType<typeof listProgramScheduleReadModelV2>> }>> {
  const parsed = deleteRuleSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid schedule rule delete request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "programs.write");
    const program = await getProgramById(org.orgId, payload.programId);
    if (!program) {
      return asError("Program not found.");
    }

    const existingRule = await getProgramScheduleRuleByIdV2(payload.programId, payload.ruleId);
    if (!existingRule) {
      return asError("Schedule rule not found.");
    }

    await deleteProgramScheduleRuleV2(payload.programId, payload.ruleId);
    await markProgramScheduleVersionV2(payload.programId);
    const readModel = await refreshScheduleData(org.orgSlug, payload.programId);
    revalidatePath(`/${org.orgSlug}/programs/${program.slug}`);

    return {
      ok: true,
      data: {
        readModel
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to delete this schedule rule.");
  }
}

function normalizeOccurrenceWindow(input: { localDate: string; localStartTime?: string; localEndTime?: string; timezone: string }) {
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

export async function addManualProgramOccurrenceAction(
  input: z.input<typeof addManualOccurrenceSchema>
): Promise<ScheduleActionResult<{ occurrenceId: string; readModel: Awaited<ReturnType<typeof listProgramScheduleReadModelV2>> }>> {
  const parsed = addManualOccurrenceSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Please review the occurrence details.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "programs.write");
    const program = await getProgramById(org.orgId, payload.programId);
    if (!program) {
      return asError("Program not found.");
    }

    const normalizedWindow = normalizeOccurrenceWindow(payload);
    const created = await insertProgramOccurrenceV2({
      programId: payload.programId,
      programNodeId: payload.programNodeId ?? null,
      sourceRuleId: null,
      sourceType: "manual",
      sourceKey: `manual:${randomUUID()}`,
      title: normalizeOptional(payload.title),
      timezone: payload.timezone,
      localDate: payload.localDate,
      localStartTime: normalizedWindow.localStartTime,
      localEndTime: normalizedWindow.localEndTime,
      startsAtUtc: normalizedWindow.startsAtUtc,
      endsAtUtc: normalizedWindow.endsAtUtc,
      status: "scheduled",
      metadataJson: {}
    });
    await markProgramScheduleVersionV2(payload.programId);

    const readModel = await refreshScheduleData(org.orgSlug, payload.programId);
    revalidatePath(`/${org.orgSlug}/programs/${program.slug}`);

    return {
      ok: true,
      data: {
        occurrenceId: created.id,
        readModel
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to add occurrence.");
  }
}

export async function updateProgramOccurrenceAction(
  input: z.input<typeof updateOccurrenceSchema>
): Promise<ScheduleActionResult<{ occurrenceId: string; readModel: Awaited<ReturnType<typeof listProgramScheduleReadModelV2>> }>> {
  const parsed = updateOccurrenceSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Please review the occurrence details.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "programs.write");
    const program = await getProgramById(org.orgId, payload.programId);
    if (!program) {
      return asError("Program not found.");
    }

    const occurrence = await getProgramOccurrenceByIdV2(payload.programId, payload.occurrenceId);
    if (!occurrence) {
      return asError("Occurrence not found.");
    }

    const normalizedWindow = normalizeOccurrenceWindow(payload);
    if (occurrence.sourceType === "rule" && occurrence.sourceRuleId) {
      const overrideSourceKey = `override:${occurrence.sourceKey}`;
      const existingOverrides = await listProgramOccurrencesV2(payload.programId, { includeCancelled: true });
      const existingOverride = existingOverrides.find((candidate) => candidate.sourceKey === overrideSourceKey);
      const nextMetadata = {
        ...occurrence.metadataJson,
        overrideOf: occurrence.sourceKey
      };
      let overrideOccurrenceId = existingOverride?.id ?? null;

      if (existingOverride) {
        await updateProgramOccurrenceV2({
          programId: payload.programId,
          occurrenceId: existingOverride.id,
          title: normalizeOptional(payload.title),
          programNodeId: payload.programNodeId ?? occurrence.programNodeId,
          timezone: payload.timezone,
          localDate: payload.localDate,
          localStartTime: normalizedWindow.localStartTime,
          localEndTime: normalizedWindow.localEndTime,
          startsAtUtc: normalizedWindow.startsAtUtc,
          endsAtUtc: normalizedWindow.endsAtUtc,
          status: "scheduled",
          metadataJson: nextMetadata
        });
      } else {
        const insertedOverride = await insertProgramOccurrenceV2({
          programId: payload.programId,
          programNodeId: payload.programNodeId ?? occurrence.programNodeId,
          sourceRuleId: occurrence.sourceRuleId,
          sourceType: "override",
          sourceKey: overrideSourceKey,
          title: normalizeOptional(payload.title),
          timezone: payload.timezone,
          localDate: payload.localDate,
          localStartTime: normalizedWindow.localStartTime,
          localEndTime: normalizedWindow.localEndTime,
          startsAtUtc: normalizedWindow.startsAtUtc,
          endsAtUtc: normalizedWindow.endsAtUtc,
          status: "scheduled",
          metadataJson: nextMetadata
        });
        overrideOccurrenceId = insertedOverride.id;
      }

      await upsertProgramScheduleExceptionV2({
        programId: payload.programId,
        ruleId: occurrence.sourceRuleId,
        sourceKey: occurrence.sourceKey,
        kind: "override",
        overrideOccurrenceId,
        payloadJson: {
          timezone: payload.timezone,
          localDate: payload.localDate,
          localStartTime: normalizedWindow.localStartTime,
          localEndTime: normalizedWindow.localEndTime
        }
      });
      await setOccurrenceStatusBySourceKeyV2(payload.programId, occurrence.sourceKey, "cancelled");
    } else {
      await updateProgramOccurrenceV2({
        programId: payload.programId,
        occurrenceId: payload.occurrenceId,
        title: normalizeOptional(payload.title),
        programNodeId: payload.programNodeId ?? occurrence.programNodeId,
        timezone: payload.timezone,
        localDate: payload.localDate,
        localStartTime: normalizedWindow.localStartTime,
        localEndTime: normalizedWindow.localEndTime,
        startsAtUtc: normalizedWindow.startsAtUtc,
        endsAtUtc: normalizedWindow.endsAtUtc,
        metadataJson: occurrence.metadataJson
      });
    }
    await markProgramScheduleVersionV2(payload.programId);

    const readModel = await refreshScheduleData(org.orgSlug, payload.programId);
    revalidatePath(`/${org.orgSlug}/programs/${program.slug}`);

    return {
      ok: true,
      data: {
        occurrenceId: payload.occurrenceId,
        readModel
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to update occurrence.");
  }
}

export async function skipProgramOccurrenceAction(
  input: z.input<typeof skipOccurrenceSchema>
): Promise<ScheduleActionResult<{ readModel: Awaited<ReturnType<typeof listProgramScheduleReadModelV2>> }>> {
  const parsed = skipOccurrenceSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid occurrence skip request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "programs.write");
    const program = await getProgramById(org.orgId, payload.programId);
    if (!program) {
      return asError("Program not found.");
    }

    const occurrence = await getProgramOccurrenceByIdV2(payload.programId, payload.occurrenceId);
    if (!occurrence || !occurrence.sourceRuleId) {
      return asError("Rule-generated occurrence not found.");
    }

    await upsertProgramScheduleExceptionV2({
      programId: payload.programId,
      ruleId: occurrence.sourceRuleId,
      sourceKey: occurrence.sourceKey,
      kind: "skip",
      overrideOccurrenceId: null
    });
    await setOccurrenceStatusBySourceKeyV2(payload.programId, occurrence.sourceKey, "cancelled");
    await markProgramScheduleVersionV2(payload.programId);

    const readModel = await refreshScheduleData(org.orgSlug, payload.programId);
    revalidatePath(`/${org.orgSlug}/programs/${program.slug}`);

    return {
      ok: true,
      data: {
        readModel
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to skip occurrence.");
  }
}

export async function restoreProgramOccurrenceAction(
  input: z.input<typeof restoreOccurrenceSchema>
): Promise<ScheduleActionResult<{ readModel: Awaited<ReturnType<typeof listProgramScheduleReadModelV2>> }>> {
  const parsed = restoreOccurrenceSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid restore request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "programs.write");
    const program = await getProgramById(org.orgId, payload.programId);
    if (!program) {
      return asError("Program not found.");
    }

    const exceptions = await listProgramScheduleExceptionsV2(payload.programId, { ruleId: payload.ruleId });
    const matching = exceptions.filter((exception) => exception.sourceKey === payload.sourceKey);
    const overrideException = matching.find((exception) => exception.kind === "override");
    if (overrideException?.overrideOccurrenceId) {
      const overrideOccurrence = await getProgramOccurrenceByIdV2(payload.programId, overrideException.overrideOccurrenceId);
      if (overrideOccurrence) {
        await updateProgramOccurrenceV2({
          programId: payload.programId,
          occurrenceId: overrideOccurrence.id,
          title: overrideOccurrence.title,
          programNodeId: overrideOccurrence.programNodeId,
          timezone: overrideOccurrence.timezone,
          localDate: overrideOccurrence.localDate,
          localStartTime: overrideOccurrence.localStartTime,
          localEndTime: overrideOccurrence.localEndTime,
          startsAtUtc: overrideOccurrence.startsAtUtc,
          endsAtUtc: overrideOccurrence.endsAtUtc,
          status: "cancelled",
          metadataJson: overrideOccurrence.metadataJson
        });
      }
    }

    await deleteProgramScheduleExceptionV2({
      programId: payload.programId,
      ruleId: payload.ruleId,
      sourceKey: payload.sourceKey
    });
    await setOccurrenceStatusBySourceKeyV2(payload.programId, payload.sourceKey, "scheduled");
    await markProgramScheduleVersionV2(payload.programId);

    const readModel = await refreshScheduleData(org.orgSlug, payload.programId);
    revalidatePath(`/${org.orgSlug}/programs/${program.slug}`);

    return {
      ok: true,
      data: {
        readModel
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to restore occurrence.");
  }
}
