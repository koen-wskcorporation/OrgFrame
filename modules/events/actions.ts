"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { rethrowIfNavigationError } from "@/lib/actions/rethrowIfNavigationError";
import { requireOrgPermission } from "@/lib/permissions/requireOrgPermission";
import { createEventRecord, deleteEventRecord, getEventById, updateEventRecord } from "@/modules/events/db/queries";
import type { EventStatus } from "@/modules/events/types";

const textSchema = z.string().trim();
const isoDateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);

const baseEventSchema = z.object({
  orgSlug: textSchema.min(1),
  title: textSchema.min(2).max(160),
  summary: textSchema.max(2400).optional(),
  location: textSchema.max(240).optional(),
  timezone: textSchema.max(120).optional(),
  status: z.enum(["draft", "published", "archived"] satisfies EventStatus[]),
  isAllDay: z.boolean(),
  allDayStartDate: isoDateSchema.optional(),
  allDayEndDate: isoDateSchema.optional(),
  startsAtUtc: z.string().trim().optional(),
  endsAtUtc: z.string().trim().optional()
});

const createEventSchema = baseEventSchema;

const updateEventSchema = baseEventSchema.extend({
  eventId: z.string().uuid()
});

const deleteEventSchema = z.object({
  orgSlug: textSchema.min(1),
  eventId: z.string().uuid()
});

export type EventsActionResult<TData = undefined> =
  | {
      ok: true;
      data: TData;
    }
  | {
      ok: false;
      error: string;
    };

function asError(error: string): EventsActionResult<never> {
  return {
    ok: false,
    error
  };
}

function normalizeOptional(value: string | undefined | null) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function asValidatedDate(value: string) {
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

  return {
    year,
    month,
    day
  };
}

function toAllDayUtcWindow(startDate: string, endDate: string) {
  const start = asValidatedDate(startDate);
  const end = asValidatedDate(endDate);

  if (!start || !end) {
    return null;
  }

  const startUtc = new Date(Date.UTC(start.year, start.month - 1, start.day, 0, 0, 0, 0));
  const endExclusiveUtc = new Date(Date.UTC(end.year, end.month - 1, end.day + 1, 0, 0, 0, 0));

  if (endExclusiveUtc.getTime() <= startUtc.getTime()) {
    return null;
  }

  return {
    startsAtUtc: startUtc.toISOString(),
    endsAtUtc: endExclusiveUtc.toISOString(),
    allDayStartDate: startDate,
    allDayEndDate: endDate
  };
}

function toTimedUtcWindow(startsAtUtc: string, endsAtUtc: string) {
  const start = new Date(startsAtUtc);
  const end = new Date(endsAtUtc);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  if (end.getTime() <= start.getTime()) {
    return null;
  }

  return {
    startsAtUtc: start.toISOString(),
    endsAtUtc: end.toISOString(),
    allDayStartDate: null,
    allDayEndDate: null
  };
}

function resolveTimezone(value: string | undefined) {
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

function resolveEventWindow(payload: z.infer<typeof baseEventSchema>) {
  if (payload.isAllDay) {
    if (!payload.allDayStartDate || !payload.allDayEndDate) {
      return {
        ok: false as const,
        error: "All-day events need both start and end dates."
      };
    }

    const window = toAllDayUtcWindow(payload.allDayStartDate, payload.allDayEndDate);

    if (!window) {
      return {
        ok: false as const,
        error: "Please provide a valid all-day date range."
      };
    }

    return {
      ok: true as const,
      window
    };
  }

  if (!payload.startsAtUtc || !payload.endsAtUtc) {
    return {
      ok: false as const,
      error: "Timed events need both a start and end time."
    };
  }

  const window = toTimedUtcWindow(payload.startsAtUtc, payload.endsAtUtc);

  if (!window) {
    return {
      ok: false as const,
      error: "Please provide a valid time window where end is after start."
    };
  }

  return {
    ok: true as const,
    window
  };
}

function revalidateEventsRoutes(orgSlug: string) {
  revalidatePath(`/${orgSlug}/tools/events`);
  revalidatePath(`/${orgSlug}/manage/events`);
  revalidatePath(`/${orgSlug}`);
}

export async function createEventAction(input: z.input<typeof createEventSchema>): Promise<EventsActionResult<{ eventId: string }>> {
  const parsed = createEventSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Please fill in the required event fields.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "events.write");
    const window = resolveEventWindow(payload);

    if (!window.ok) {
      return asError(window.error);
    }

    const created = await createEventRecord({
      orgId: org.orgId,
      createdByUserId: org.userId,
      title: payload.title,
      summary: normalizeOptional(payload.summary),
      location: normalizeOptional(payload.location),
      timezone: resolveTimezone(payload.timezone),
      status: payload.status,
      isAllDay: payload.isAllDay,
      allDayStartDate: window.window.allDayStartDate,
      allDayEndDate: window.window.allDayEndDate,
      startsAtUtc: window.window.startsAtUtc,
      endsAtUtc: window.window.endsAtUtc,
      settingsJson: {}
    });

    revalidateEventsRoutes(org.orgSlug);

    return {
      ok: true,
      data: {
        eventId: created.id
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to create this event right now.");
  }
}

export async function updateEventAction(input: z.input<typeof updateEventSchema>): Promise<EventsActionResult<{ eventId: string }>> {
  const parsed = updateEventSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Please review the event details.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "events.write");
    const existing = await getEventById(org.orgId, payload.eventId);

    if (!existing) {
      return asError("Event not found.");
    }

    const window = resolveEventWindow(payload);

    if (!window.ok) {
      return asError(window.error);
    }

    const updated = await updateEventRecord({
      orgId: org.orgId,
      eventId: payload.eventId,
      title: payload.title,
      summary: normalizeOptional(payload.summary),
      location: normalizeOptional(payload.location),
      timezone: resolveTimezone(payload.timezone),
      status: payload.status,
      isAllDay: payload.isAllDay,
      allDayStartDate: window.window.allDayStartDate,
      allDayEndDate: window.window.allDayEndDate,
      startsAtUtc: window.window.startsAtUtc,
      endsAtUtc: window.window.endsAtUtc,
      settingsJson: existing.settingsJson
    });

    revalidateEventsRoutes(org.orgSlug);

    return {
      ok: true,
      data: {
        eventId: updated.id
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to update this event right now.");
  }
}

export async function deleteEventAction(input: z.input<typeof deleteEventSchema>): Promise<EventsActionResult<{ eventId: string }>> {
  const parsed = deleteEventSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid delete request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "events.write");
    const existing = await getEventById(org.orgId, payload.eventId);

    if (!existing) {
      return asError("Event not found.");
    }

    await deleteEventRecord(org.orgId, payload.eventId);
    revalidateEventsRoutes(org.orgSlug);

    return {
      ok: true,
      data: {
        eventId: payload.eventId
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to delete this event right now.");
  }
}
