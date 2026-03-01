import { createSupabaseServer } from "@/lib/supabase/server";
import type { EventCatalogItem, EventStatus, OrgEvent } from "@/modules/events/types";

const eventSelect =
  "id, org_id, title, summary, location, timezone, status, is_all_day, all_day_start_date, all_day_end_date, starts_at_utc, ends_at_utc, settings_json, created_by, created_at, updated_at";

type EventRow = {
  id: string;
  org_id: string;
  title: string;
  summary: string | null;
  location: string | null;
  timezone: string;
  status: EventStatus;
  is_all_day: boolean;
  all_day_start_date: string | null;
  all_day_end_date: string | null;
  starts_at_utc: string;
  ends_at_utc: string;
  settings_json: unknown;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function mapEvent(row: EventRow): OrgEvent {
  return {
    id: row.id,
    orgId: row.org_id,
    title: row.title,
    summary: row.summary,
    location: row.location,
    timezone: row.timezone,
    status: row.status,
    isAllDay: row.is_all_day,
    allDayStartDate: row.all_day_start_date,
    allDayEndDate: row.all_day_end_date,
    startsAtUtc: row.starts_at_utc,
    endsAtUtc: row.ends_at_utc,
    settingsJson: asObject(row.settings_json),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toCatalogItem(event: OrgEvent): EventCatalogItem {
  return {
    id: event.id,
    title: event.title,
    summary: event.summary,
    location: event.location,
    timezone: event.timezone,
    isAllDay: event.isAllDay,
    allDayStartDate: event.allDayStartDate,
    allDayEndDate: event.allDayEndDate,
    startsAtUtc: event.startsAtUtc,
    endsAtUtc: event.endsAtUtc
  };
}

export async function listEventsForManage(orgId: string): Promise<OrgEvent[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("org_events")
    .select(eventSelect)
    .eq("org_id", orgId)
    .order("starts_at_utc", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list events: ${error.message}`);
  }

  return (data ?? []).map((row) => mapEvent(row as EventRow));
}

export async function listPublishedEventsForCatalog(
  orgId: string,
  options?: {
    limit?: number;
    fromUtc?: string;
    toUtc?: string;
  }
): Promise<EventCatalogItem[]> {
  const supabase = await createSupabaseServer();
  let query = supabase
    .from("org_events")
    .select(eventSelect)
    .eq("org_id", orgId)
    .eq("status", "published")
    .order("starts_at_utc", { ascending: true })
    .order("created_at", { ascending: true });

  if (options?.fromUtc) {
    query = query.gte("ends_at_utc", options.fromUtc);
  }

  if (options?.toUtc) {
    query = query.lte("starts_at_utc", options.toUtc);
  }

  if (options?.limit && options.limit > 0) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list published events: ${error.message}`);
  }

  return (data ?? []).map((row) => toCatalogItem(mapEvent(row as EventRow)));
}

export async function getEventById(orgId: string, eventId: string): Promise<OrgEvent | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("org_events")
    .select(eventSelect)
    .eq("org_id", orgId)
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load event: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return mapEvent(data as EventRow);
}

export async function getPublishedEventById(orgId: string, eventId: string): Promise<OrgEvent | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("org_events")
    .select(eventSelect)
    .eq("org_id", orgId)
    .eq("id", eventId)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load published event: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return mapEvent(data as EventRow);
}

export async function createEventRecord(input: {
  orgId: string;
  createdByUserId: string;
  title: string;
  summary: string | null;
  location: string | null;
  timezone: string;
  status: EventStatus;
  isAllDay: boolean;
  allDayStartDate: string | null;
  allDayEndDate: string | null;
  startsAtUtc: string;
  endsAtUtc: string;
  settingsJson?: Record<string, unknown>;
}): Promise<OrgEvent> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("org_events")
    .insert({
      org_id: input.orgId,
      created_by: input.createdByUserId,
      title: input.title,
      summary: input.summary,
      location: input.location,
      timezone: input.timezone,
      status: input.status,
      is_all_day: input.isAllDay,
      all_day_start_date: input.allDayStartDate,
      all_day_end_date: input.allDayEndDate,
      starts_at_utc: input.startsAtUtc,
      ends_at_utc: input.endsAtUtc,
      settings_json: input.settingsJson ?? {}
    })
    .select(eventSelect)
    .single();

  if (error) {
    throw new Error(`Failed to create event: ${error.message}`);
  }

  return mapEvent(data as EventRow);
}

export async function updateEventRecord(input: {
  orgId: string;
  eventId: string;
  title: string;
  summary: string | null;
  location: string | null;
  timezone: string;
  status: EventStatus;
  isAllDay: boolean;
  allDayStartDate: string | null;
  allDayEndDate: string | null;
  startsAtUtc: string;
  endsAtUtc: string;
  settingsJson?: Record<string, unknown>;
}): Promise<OrgEvent> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("org_events")
    .update({
      title: input.title,
      summary: input.summary,
      location: input.location,
      timezone: input.timezone,
      status: input.status,
      is_all_day: input.isAllDay,
      all_day_start_date: input.allDayStartDate,
      all_day_end_date: input.allDayEndDate,
      starts_at_utc: input.startsAtUtc,
      ends_at_utc: input.endsAtUtc,
      settings_json: input.settingsJson ?? {}
    })
    .eq("org_id", input.orgId)
    .eq("id", input.eventId)
    .select(eventSelect)
    .single();

  if (error) {
    throw new Error(`Failed to update event: ${error.message}`);
  }

  return mapEvent(data as EventRow);
}

export async function deleteEventRecord(orgId: string, eventId: string): Promise<void> {
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("org_events").delete().eq("org_id", orgId).eq("id", eventId);

  if (error) {
    throw new Error(`Failed to delete event: ${error.message}`);
  }
}
