import { createSupabaseServer } from "@/lib/supabase/server";
import type {
  CalendarEntry,
  CalendarEntryStatus,
  CalendarEntryType,
  CalendarOccurrence,
  CalendarOccurrenceReadModel,
  CalendarPublicCatalogItem,
  CalendarReadModel,
  CalendarRule,
  CalendarRuleException,
  FacilityAllocation,
  FacilitySpaceConfiguration,
  InboxItem,
  OccurrenceInviteStatus,
  OccurrenceTeamInvite,
  OccurrenceTeamRole
} from "@/modules/calendar/types";
import type { GeneratedCalendarOccurrenceInput } from "@/modules/calendar/rule-engine";

const entrySelect =
  "id, org_id, entry_type, title, summary, visibility, status, host_team_id, default_timezone, settings_json, created_by, updated_by, created_at, updated_at";
const ruleSelect =
  "id, org_id, entry_id, mode, timezone, start_date, end_date, start_time, end_time, interval_count, interval_unit, by_weekday, by_monthday, end_mode, until_date, max_occurrences, sort_index, is_active, config_json, rule_hash, created_by, updated_by, created_at, updated_at";
const occurrenceSelect =
  "id, org_id, entry_id, source_rule_id, source_type, source_key, timezone, local_date, local_start_time, local_end_time, starts_at_utc, ends_at_utc, status, metadata_json, created_by, updated_by, created_at, updated_at";
const exceptionSelect =
  "id, org_id, rule_id, source_key, kind, override_occurrence_id, payload_json, created_by, updated_by, created_at, updated_at";
const configurationSelect =
  "id, org_id, space_id, name, slug, capacity_teams, is_active, sort_index, metadata_json, created_by, updated_by, created_at, updated_at";
const allocationSelect =
  "id, org_id, occurrence_id, space_id, configuration_id, lock_mode, allow_shared, starts_at_utc, ends_at_utc, is_active, metadata_json, created_by, updated_by, created_at, updated_at";
const inviteSelect =
  "id, org_id, occurrence_id, team_id, role, invite_status, invited_by_user_id, invited_at, responded_by_user_id, responded_at, created_at, updated_at";
const inboxSelect =
  "id, org_id, recipient_user_id, item_type, title, body, href, payload_json, is_read, read_at, is_archived, archived_at, created_by, created_at";

type EntryRow = {
  id: string;
  org_id: string;
  entry_type: CalendarEntryType;
  title: string;
  summary: string | null;
  visibility: CalendarEntry["visibility"];
  status: CalendarEntryStatus;
  host_team_id: string | null;
  default_timezone: string;
  settings_json: unknown;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type RuleRow = {
  id: string;
  org_id: string;
  entry_id: string;
  mode: CalendarRule["mode"];
  timezone: string;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  interval_count: number;
  interval_unit: CalendarRule["intervalUnit"];
  by_weekday: number[] | null;
  by_monthday: number[] | null;
  end_mode: CalendarRule["endMode"];
  until_date: string | null;
  max_occurrences: number | null;
  sort_index: number;
  is_active: boolean;
  config_json: unknown;
  rule_hash: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type OccurrenceRow = {
  id: string;
  org_id: string;
  entry_id: string;
  source_rule_id: string | null;
  source_type: CalendarOccurrence["sourceType"];
  source_key: string;
  timezone: string;
  local_date: string;
  local_start_time: string | null;
  local_end_time: string | null;
  starts_at_utc: string;
  ends_at_utc: string;
  status: CalendarOccurrence["status"];
  metadata_json: unknown;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type ExceptionRow = {
  id: string;
  org_id: string;
  rule_id: string;
  source_key: string;
  kind: CalendarRuleException["kind"];
  override_occurrence_id: string | null;
  payload_json: unknown;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type ConfigurationRow = {
  id: string;
  org_id: string;
  space_id: string;
  name: string;
  slug: string;
  capacity_teams: number | null;
  is_active: boolean;
  sort_index: number;
  metadata_json: unknown;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type AllocationRow = {
  id: string;
  org_id: string;
  occurrence_id: string;
  space_id: string;
  configuration_id: string;
  lock_mode: FacilityAllocation["lockMode"];
  allow_shared: boolean;
  starts_at_utc: string;
  ends_at_utc: string;
  is_active: boolean;
  metadata_json: unknown;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

type InviteRow = {
  id: string;
  org_id: string;
  occurrence_id: string;
  team_id: string;
  role: OccurrenceTeamRole;
  invite_status: OccurrenceInviteStatus;
  invited_by_user_id: string | null;
  invited_at: string | null;
  responded_by_user_id: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
};

type InboxRow = {
  id: string;
  org_id: string;
  recipient_user_id: string;
  item_type: string;
  title: string;
  body: string | null;
  href: string | null;
  payload_json: unknown;
  is_read: boolean;
  read_at: string | null;
  is_archived: boolean;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function mapEntry(row: EntryRow): CalendarEntry {
  return {
    id: row.id,
    orgId: row.org_id,
    entryType: row.entry_type,
    title: row.title,
    summary: row.summary,
    visibility: row.visibility,
    status: row.status,
    hostTeamId: row.host_team_id,
    defaultTimezone: row.default_timezone,
    settingsJson: asObject(row.settings_json),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRule(row: RuleRow): CalendarRule {
  return {
    id: row.id,
    orgId: row.org_id,
    entryId: row.entry_id,
    mode: row.mode,
    timezone: row.timezone,
    startDate: row.start_date,
    endDate: row.end_date,
    startTime: row.start_time,
    endTime: row.end_time,
    intervalCount: Number.isFinite(row.interval_count) ? row.interval_count : 1,
    intervalUnit: row.interval_unit,
    byWeekday: Array.isArray(row.by_weekday) ? row.by_weekday : null,
    byMonthday: Array.isArray(row.by_monthday) ? row.by_monthday : null,
    endMode: row.end_mode,
    untilDate: row.until_date,
    maxOccurrences: row.max_occurrences,
    sortIndex: Number.isFinite(row.sort_index) ? row.sort_index : 0,
    isActive: row.is_active,
    configJson: asObject(row.config_json),
    ruleHash: row.rule_hash,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapOccurrence(row: OccurrenceRow): CalendarOccurrence {
  return {
    id: row.id,
    orgId: row.org_id,
    entryId: row.entry_id,
    sourceRuleId: row.source_rule_id,
    sourceType: row.source_type,
    sourceKey: row.source_key,
    timezone: row.timezone,
    localDate: row.local_date,
    localStartTime: row.local_start_time,
    localEndTime: row.local_end_time,
    startsAtUtc: row.starts_at_utc,
    endsAtUtc: row.ends_at_utc,
    status: row.status,
    metadataJson: asObject(row.metadata_json),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapException(row: ExceptionRow): CalendarRuleException {
  return {
    id: row.id,
    orgId: row.org_id,
    ruleId: row.rule_id,
    sourceKey: row.source_key,
    kind: row.kind,
    overrideOccurrenceId: row.override_occurrence_id,
    payloadJson: asObject(row.payload_json),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapConfiguration(row: ConfigurationRow): FacilitySpaceConfiguration {
  return {
    id: row.id,
    orgId: row.org_id,
    spaceId: row.space_id,
    name: row.name,
    slug: row.slug,
    capacityTeams: row.capacity_teams,
    isActive: row.is_active,
    sortIndex: Number.isFinite(row.sort_index) ? row.sort_index : 0,
    metadataJson: asObject(row.metadata_json),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAllocation(row: AllocationRow): FacilityAllocation {
  return {
    id: row.id,
    orgId: row.org_id,
    occurrenceId: row.occurrence_id,
    spaceId: row.space_id,
    configurationId: row.configuration_id,
    lockMode: row.lock_mode,
    allowShared: row.allow_shared,
    startsAtUtc: row.starts_at_utc,
    endsAtUtc: row.ends_at_utc,
    isActive: row.is_active,
    metadataJson: asObject(row.metadata_json),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapInvite(row: InviteRow): OccurrenceTeamInvite {
  return {
    id: row.id,
    orgId: row.org_id,
    occurrenceId: row.occurrence_id,
    teamId: row.team_id,
    role: row.role,
    inviteStatus: row.invite_status,
    invitedByUserId: row.invited_by_user_id,
    invitedAt: row.invited_at,
    respondedByUserId: row.responded_by_user_id,
    respondedAt: row.responded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapInbox(row: InboxRow): InboxItem {
  return {
    id: row.id,
    orgId: row.org_id,
    recipientUserId: row.recipient_user_id,
    itemType: row.item_type,
    title: row.title,
    body: row.body,
    href: row.href,
    payloadJson: asObject(row.payload_json),
    isRead: row.is_read,
    readAt: row.read_at,
    isArchived: row.is_archived,
    archivedAt: row.archived_at,
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}

export async function listCalendarEntries(orgId: string): Promise<CalendarEntry[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("calendar_entries")
    .select(entrySelect)
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list calendar entries: ${error.message}`);
  }

  return (data ?? []).map((row) => mapEntry(row as EntryRow));
}

export async function getCalendarEntryById(orgId: string, entryId: string): Promise<CalendarEntry | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("calendar_entries")
    .select(entrySelect)
    .eq("org_id", orgId)
    .eq("id", entryId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load calendar entry: ${error.message}`);
  }

  return data ? mapEntry(data as EntryRow) : null;
}

export async function createCalendarEntryRecord(input: {
  orgId: string;
  entryType: CalendarEntryType;
  title: string;
  summary: string | null;
  visibility: CalendarEntry["visibility"];
  status: CalendarEntryStatus;
  hostTeamId: string | null;
  defaultTimezone: string;
  settingsJson?: Record<string, unknown>;
  createdBy: string;
}): Promise<CalendarEntry> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("calendar_entries")
    .insert({
      org_id: input.orgId,
      entry_type: input.entryType,
      title: input.title,
      summary: input.summary,
      visibility: input.visibility,
      status: input.status,
      host_team_id: input.hostTeamId,
      default_timezone: input.defaultTimezone,
      settings_json: input.settingsJson ?? {},
      created_by: input.createdBy,
      updated_by: input.createdBy
    })
    .select(entrySelect)
    .single();

  if (error) {
    throw new Error(`Failed to create calendar entry: ${error.message}`);
  }

  return mapEntry(data as EntryRow);
}

export async function updateCalendarEntryRecord(input: {
  orgId: string;
  entryId: string;
  entryType: CalendarEntryType;
  title: string;
  summary: string | null;
  visibility: CalendarEntry["visibility"];
  status: CalendarEntryStatus;
  hostTeamId: string | null;
  defaultTimezone: string;
  settingsJson?: Record<string, unknown>;
  updatedBy: string;
}): Promise<CalendarEntry> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("calendar_entries")
    .update({
      entry_type: input.entryType,
      title: input.title,
      summary: input.summary,
      visibility: input.visibility,
      status: input.status,
      host_team_id: input.hostTeamId,
      default_timezone: input.defaultTimezone,
      settings_json: input.settingsJson ?? {},
      updated_by: input.updatedBy
    })
    .eq("org_id", input.orgId)
    .eq("id", input.entryId)
    .select(entrySelect)
    .single();

  if (error) {
    throw new Error(`Failed to update calendar entry: ${error.message}`);
  }

  return mapEntry(data as EntryRow);
}

export async function deleteCalendarEntryRecord(orgId: string, entryId: string): Promise<void> {
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("calendar_entries").delete().eq("org_id", orgId).eq("id", entryId);

  if (error) {
    throw new Error(`Failed to delete calendar entry: ${error.message}`);
  }
}

export async function listCalendarRules(orgId: string, options?: { entryId?: string }): Promise<CalendarRule[]> {
  const supabase = await createSupabaseServer();
  let query = supabase
    .from("calendar_rules")
    .select(ruleSelect)
    .eq("org_id", orgId)
    .order("sort_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (options?.entryId) {
    query = query.eq("entry_id", options.entryId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list calendar rules: ${error.message}`);
  }

  return (data ?? []).map((row) => mapRule(row as RuleRow));
}

export async function getCalendarRuleById(orgId: string, ruleId: string): Promise<CalendarRule | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("calendar_rules")
    .select(ruleSelect)
    .eq("org_id", orgId)
    .eq("id", ruleId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load calendar rule: ${error.message}`);
  }

  return data ? mapRule(data as RuleRow) : null;
}

export async function upsertCalendarRuleRecord(input: {
  orgId: string;
  ruleId?: string;
  entryId: string;
  mode: CalendarRule["mode"];
  timezone: string;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  intervalCount: number;
  intervalUnit: CalendarRule["intervalUnit"];
  byWeekday: number[] | null;
  byMonthday: number[] | null;
  endMode: CalendarRule["endMode"];
  untilDate: string | null;
  maxOccurrences: number | null;
  sortIndex: number;
  isActive: boolean;
  configJson: Record<string, unknown>;
  ruleHash: string;
  actorUserId: string;
}): Promise<CalendarRule> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("calendar_rules")
    .upsert({
      id: input.ruleId,
      org_id: input.orgId,
      entry_id: input.entryId,
      mode: input.mode,
      timezone: input.timezone,
      start_date: input.startDate,
      end_date: input.endDate,
      start_time: input.startTime,
      end_time: input.endTime,
      interval_count: input.intervalCount,
      interval_unit: input.intervalUnit,
      by_weekday: input.byWeekday,
      by_monthday: input.byMonthday,
      end_mode: input.endMode,
      until_date: input.untilDate,
      max_occurrences: input.maxOccurrences,
      sort_index: input.sortIndex,
      is_active: input.isActive,
      config_json: input.configJson,
      rule_hash: input.ruleHash,
      created_by: input.actorUserId,
      updated_by: input.actorUserId
    })
    .select(ruleSelect)
    .single();

  if (error) {
    throw new Error(`Failed to save calendar rule: ${error.message}`);
  }

  return mapRule(data as RuleRow);
}

export async function deleteCalendarRuleRecord(orgId: string, ruleId: string): Promise<void> {
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("calendar_rules").delete().eq("org_id", orgId).eq("id", ruleId);

  if (error) {
    throw new Error(`Failed to delete calendar rule: ${error.message}`);
  }
}

export async function listCalendarOccurrences(
  orgId: string,
  options?: {
    includeCancelled?: boolean;
    entryId?: string;
    fromUtc?: string;
    toUtc?: string;
  }
): Promise<CalendarOccurrence[]> {
  const supabase = await createSupabaseServer();
  let query = supabase
    .from("calendar_occurrences")
    .select(occurrenceSelect)
    .eq("org_id", orgId)
    .order("starts_at_utc", { ascending: true })
    .order("created_at", { ascending: true });

  if (!options?.includeCancelled) {
    query = query.eq("status", "scheduled");
  }

  if (options?.entryId) {
    query = query.eq("entry_id", options.entryId);
  }

  if (options?.fromUtc) {
    query = query.gte("ends_at_utc", options.fromUtc);
  }

  if (options?.toUtc) {
    query = query.lte("starts_at_utc", options.toUtc);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list calendar occurrences: ${error.message}`);
  }

  return (data ?? []).map((row) => mapOccurrence(row as OccurrenceRow));
}

export async function getCalendarOccurrenceById(orgId: string, occurrenceId: string): Promise<CalendarOccurrence | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("calendar_occurrences")
    .select(occurrenceSelect)
    .eq("org_id", orgId)
    .eq("id", occurrenceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load calendar occurrence: ${error.message}`);
  }

  return data ? mapOccurrence(data as OccurrenceRow) : null;
}

export async function insertCalendarOccurrenceRecord(input: {
  orgId: string;
  entryId: string;
  sourceRuleId: string | null;
  sourceType: CalendarOccurrence["sourceType"];
  sourceKey: string;
  timezone: string;
  localDate: string;
  localStartTime: string | null;
  localEndTime: string | null;
  startsAtUtc: string;
  endsAtUtc: string;
  status?: CalendarOccurrence["status"];
  metadataJson?: Record<string, unknown>;
  actorUserId: string;
}): Promise<CalendarOccurrence> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("calendar_occurrences")
    .insert({
      org_id: input.orgId,
      entry_id: input.entryId,
      source_rule_id: input.sourceRuleId,
      source_type: input.sourceType,
      source_key: input.sourceKey,
      timezone: input.timezone,
      local_date: input.localDate,
      local_start_time: input.localStartTime,
      local_end_time: input.localEndTime,
      starts_at_utc: input.startsAtUtc,
      ends_at_utc: input.endsAtUtc,
      status: input.status ?? "scheduled",
      metadata_json: input.metadataJson ?? {},
      created_by: input.actorUserId,
      updated_by: input.actorUserId
    })
    .select(occurrenceSelect)
    .single();

  if (error) {
    throw new Error(`Failed to insert calendar occurrence: ${error.message}`);
  }

  return mapOccurrence(data as OccurrenceRow);
}

export async function updateCalendarOccurrenceRecord(input: {
  orgId: string;
  occurrenceId: string;
  timezone: string;
  localDate: string;
  localStartTime: string | null;
  localEndTime: string | null;
  startsAtUtc: string;
  endsAtUtc: string;
  status?: CalendarOccurrence["status"];
  metadataJson?: Record<string, unknown>;
  actorUserId: string;
}): Promise<CalendarOccurrence> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("calendar_occurrences")
    .update({
      timezone: input.timezone,
      local_date: input.localDate,
      local_start_time: input.localStartTime,
      local_end_time: input.localEndTime,
      starts_at_utc: input.startsAtUtc,
      ends_at_utc: input.endsAtUtc,
      status: input.status,
      metadata_json: input.metadataJson ?? {},
      updated_by: input.actorUserId
    })
    .eq("org_id", input.orgId)
    .eq("id", input.occurrenceId)
    .select(occurrenceSelect)
    .single();

  if (error) {
    throw new Error(`Failed to update calendar occurrence: ${error.message}`);
  }

  return mapOccurrence(data as OccurrenceRow);
}

export async function setCalendarOccurrenceStatus(input: {
  orgId: string;
  occurrenceId: string;
  status: CalendarOccurrence["status"];
  actorUserId: string;
}): Promise<CalendarOccurrence> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("calendar_occurrences")
    .update({
      status: input.status,
      updated_by: input.actorUserId
    })
    .eq("org_id", input.orgId)
    .eq("id", input.occurrenceId)
    .select(occurrenceSelect)
    .single();

  if (error) {
    throw new Error(`Failed to set calendar occurrence status: ${error.message}`);
  }

  return mapOccurrence(data as OccurrenceRow);
}

export async function setCalendarOccurrenceStatusBySourceKey(input: {
  orgId: string;
  sourceKey: string;
  status: CalendarOccurrence["status"];
  actorUserId: string;
}): Promise<void> {
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from("calendar_occurrences")
    .update({
      status: input.status,
      updated_by: input.actorUserId
    })
    .eq("org_id", input.orgId)
    .eq("source_key", input.sourceKey);

  if (error) {
    throw new Error(`Failed to set calendar occurrence status by source key: ${error.message}`);
  }
}

export async function upsertRuleGeneratedOccurrences(
  orgId: string,
  ruleId: string,
  actorUserId: string,
  occurrences: GeneratedCalendarOccurrenceInput[]
) {
  const supabase = await createSupabaseServer();
  const sourceKeys = new Set(occurrences.map((item) => item.sourceKey));

  if (occurrences.length > 0) {
    const { error: upsertError } = await supabase.from("calendar_occurrences").upsert(
      occurrences.map((occurrence) => ({
        org_id: orgId,
        entry_id: occurrence.entryId,
        source_rule_id: occurrence.sourceRuleId,
        source_type: occurrence.sourceType,
        source_key: occurrence.sourceKey,
        timezone: occurrence.timezone,
        local_date: occurrence.localDate,
        local_start_time: occurrence.localStartTime,
        local_end_time: occurrence.localEndTime,
        starts_at_utc: occurrence.startsAtUtc,
        ends_at_utc: occurrence.endsAtUtc,
        status: occurrence.status,
        metadata_json: occurrence.metadataJson,
        updated_by: actorUserId
      })),
      {
        onConflict: "org_id,source_key"
      }
    );

    if (upsertError) {
      throw new Error(`Failed to upsert generated calendar occurrences: ${upsertError.message}`);
    }
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("calendar_occurrences")
    .select("id, source_key")
    .eq("org_id", orgId)
    .eq("source_rule_id", ruleId)
    .eq("source_type", "rule");

  if (existingError) {
    throw new Error(`Failed to read existing generated calendar occurrences: ${existingError.message}`);
  }

  const staleIds = (existingRows ?? [])
    .filter((row) => typeof row.source_key === "string" && !sourceKeys.has(row.source_key))
    .map((row) => row.id)
    .filter((value): value is string => typeof value === "string");

  if (staleIds.length > 0) {
    const { error: staleError } = await supabase
      .from("calendar_occurrences")
      .update({ status: "cancelled", updated_by: actorUserId })
      .in("id", staleIds);

    if (staleError) {
      throw new Error(`Failed to cancel stale generated calendar occurrences: ${staleError.message}`);
    }
  }
}

export async function listCalendarRuleExceptions(orgId: string, options?: { ruleId?: string }): Promise<CalendarRuleException[]> {
  const supabase = await createSupabaseServer();
  let query = supabase
    .from("calendar_rule_exceptions")
    .select(exceptionSelect)
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  if (options?.ruleId) {
    query = query.eq("rule_id", options.ruleId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list calendar rule exceptions: ${error.message}`);
  }

  return (data ?? []).map((row) => mapException(row as ExceptionRow));
}

export async function upsertCalendarRuleException(input: {
  orgId: string;
  ruleId: string;
  sourceKey: string;
  kind: CalendarRuleException["kind"];
  overrideOccurrenceId: string | null;
  payloadJson?: Record<string, unknown>;
  actorUserId: string;
}): Promise<CalendarRuleException> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("calendar_rule_exceptions")
    .upsert({
      org_id: input.orgId,
      rule_id: input.ruleId,
      source_key: input.sourceKey,
      kind: input.kind,
      override_occurrence_id: input.overrideOccurrenceId,
      payload_json: input.payloadJson ?? {},
      created_by: input.actorUserId,
      updated_by: input.actorUserId
    })
    .select(exceptionSelect)
    .single();

  if (error) {
    throw new Error(`Failed to save calendar rule exception: ${error.message}`);
  }

  return mapException(data as ExceptionRow);
}

export async function deleteCalendarRuleException(input: { orgId: string; ruleId: string; sourceKey: string; kind?: CalendarRuleException["kind"] }) {
  const supabase = await createSupabaseServer();
  let query = supabase
    .from("calendar_rule_exceptions")
    .delete()
    .eq("org_id", input.orgId)
    .eq("rule_id", input.ruleId)
    .eq("source_key", input.sourceKey);

  if (input.kind) {
    query = query.eq("kind", input.kind);
  }

  const { error } = await query;

  if (error) {
    throw new Error(`Failed to delete calendar rule exception: ${error.message}`);
  }
}

export async function listFacilitySpaceConfigurations(
  orgId: string,
  options?: {
    spaceId?: string;
    includeInactive?: boolean;
  }
): Promise<FacilitySpaceConfiguration[]> {
  const supabase = await createSupabaseServer();
  let query = supabase
    .from("facility_space_configurations")
    .select(configurationSelect)
    .eq("org_id", orgId)
    .order("sort_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (options?.spaceId) {
    query = query.eq("space_id", options.spaceId);
  }

  if (!options?.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list facility space configurations: ${error.message}`);
  }

  return (data ?? []).map((row) => mapConfiguration(row as ConfigurationRow));
}

export async function createFacilitySpaceConfiguration(input: {
  orgId: string;
  spaceId: string;
  name: string;
  slug: string;
  capacityTeams: number | null;
  isActive?: boolean;
  sortIndex?: number;
  metadataJson?: Record<string, unknown>;
  actorUserId: string;
}): Promise<FacilitySpaceConfiguration> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("facility_space_configurations")
    .insert({
      org_id: input.orgId,
      space_id: input.spaceId,
      name: input.name,
      slug: input.slug,
      capacity_teams: input.capacityTeams,
      is_active: input.isActive ?? true,
      sort_index: input.sortIndex ?? 0,
      metadata_json: input.metadataJson ?? {},
      created_by: input.actorUserId,
      updated_by: input.actorUserId
    })
    .select(configurationSelect)
    .single();

  if (error) {
    throw new Error(`Failed to create facility space configuration: ${error.message}`);
  }

  return mapConfiguration(data as ConfigurationRow);
}

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function getOrCreateDefaultFacilitySpaceConfiguration(input: {
  orgId: string;
  spaceId: string;
  actorUserId: string;
}): Promise<FacilitySpaceConfiguration> {
  const existing = await listFacilitySpaceConfigurations(input.orgId, {
    spaceId: input.spaceId,
    includeInactive: true
  });

  if (existing[0]) {
    return existing[0];
  }

  const supabase = await createSupabaseServer();
  const { data: spaceRow, error: spaceError } = await supabase
    .from("facility_spaces")
    .select("name")
    .eq("org_id", input.orgId)
    .eq("id", input.spaceId)
    .maybeSingle();

  if (spaceError) {
    throw new Error(`Failed to load facility space while creating default configuration: ${spaceError.message}`);
  }

  const spaceName = (spaceRow?.name as string | undefined) ?? "Configuration";

  return createFacilitySpaceConfiguration({
    orgId: input.orgId,
    spaceId: input.spaceId,
    name: "Default",
    slug: toSlug(`${spaceName}-default`),
    capacityTeams: 1,
    actorUserId: input.actorUserId
  });
}

export async function listOccurrenceFacilityAllocations(
  orgId: string,
  options?: {
    occurrenceId?: string;
  }
): Promise<FacilityAllocation[]> {
  const supabase = await createSupabaseServer();
  let query = supabase
    .from("calendar_occurrence_facility_allocations")
    .select(allocationSelect)
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  if (options?.occurrenceId) {
    query = query.eq("occurrence_id", options.occurrenceId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list facility allocations: ${error.message}`);
  }

  return (data ?? []).map((row) => mapAllocation(row as AllocationRow));
}

export async function upsertOccurrenceFacilityAllocation(input: {
  orgId: string;
  occurrenceId: string;
  spaceId: string;
  configurationId: string;
  lockMode: FacilityAllocation["lockMode"];
  allowShared: boolean;
  metadataJson?: Record<string, unknown>;
  actorUserId: string;
}): Promise<FacilityAllocation> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("calendar_occurrence_facility_allocations")
    .upsert(
      {
        org_id: input.orgId,
        occurrence_id: input.occurrenceId,
        space_id: input.spaceId,
        configuration_id: input.configurationId,
        lock_mode: input.lockMode,
        allow_shared: input.allowShared,
        metadata_json: input.metadataJson ?? {},
        created_by: input.actorUserId,
        updated_by: input.actorUserId
      },
      {
        onConflict: "occurrence_id"
      }
    )
    .select(allocationSelect)
    .single();

  if (error) {
    throw new Error(`Failed to save facility allocation: ${error.message}`);
  }

  return mapAllocation(data as AllocationRow);
}

export async function listOccurrenceTeamInvites(
  orgId: string,
  options?: {
    occurrenceId?: string;
    teamId?: string;
    includeInactive?: boolean;
  }
): Promise<OccurrenceTeamInvite[]> {
  const supabase = await createSupabaseServer();
  let query = supabase
    .from("calendar_occurrence_teams")
    .select(inviteSelect)
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  if (options?.occurrenceId) {
    query = query.eq("occurrence_id", options.occurrenceId);
  }

  if (options?.teamId) {
    query = query.eq("team_id", options.teamId);
  }

  if (!options?.includeInactive) {
    query = query.in("invite_status", ["accepted", "pending"]);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list occurrence teams: ${error.message}`);
  }

  return (data ?? []).map((row) => mapInvite(row as InviteRow));
}

export async function upsertOccurrenceTeamInvite(input: {
  orgId: string;
  occurrenceId: string;
  teamId: string;
  role: OccurrenceTeamRole;
  inviteStatus: OccurrenceInviteStatus;
  invitedByUserId?: string | null;
  invitedAt?: string | null;
  respondedByUserId?: string | null;
  respondedAt?: string | null;
}): Promise<OccurrenceTeamInvite> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("calendar_occurrence_teams")
    .upsert(
      {
        org_id: input.orgId,
        occurrence_id: input.occurrenceId,
        team_id: input.teamId,
        role: input.role,
        invite_status: input.inviteStatus,
        invited_by_user_id: input.invitedByUserId ?? null,
        invited_at: input.invitedAt ?? null,
        responded_by_user_id: input.respondedByUserId ?? null,
        responded_at: input.respondedAt ?? null
      },
      {
        onConflict: "occurrence_id,team_id"
      }
    )
    .select(inviteSelect)
    .single();

  if (error) {
    throw new Error(`Failed to save occurrence team row: ${error.message}`);
  }

  return mapInvite(data as InviteRow);
}

export async function getOccurrenceTeamInvite(orgId: string, occurrenceId: string, teamId: string): Promise<OccurrenceTeamInvite | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("calendar_occurrence_teams")
    .select(inviteSelect)
    .eq("org_id", orgId)
    .eq("occurrence_id", occurrenceId)
    .eq("team_id", teamId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load occurrence team row: ${error.message}`);
  }

  return data ? mapInvite(data as InviteRow) : null;
}

export async function listInboxItemsForUser(orgId: string, userId: string): Promise<InboxItem[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("org_user_inbox_items")
    .select(inboxSelect)
    .eq("org_id", orgId)
    .eq("recipient_user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list inbox items: ${error.message}`);
  }

  return (data ?? []).map((row) => mapInbox(row as InboxRow));
}

export async function createInboxItems(
  items: Array<{
    orgId: string;
    recipientUserId: string;
    itemType: string;
    title: string;
    body?: string | null;
    href?: string | null;
    payloadJson?: Record<string, unknown>;
    createdBy: string | null;
  }>
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("org_user_inbox_items").insert(
    items.map((item) => ({
      org_id: item.orgId,
      recipient_user_id: item.recipientUserId,
      item_type: item.itemType,
      title: item.title,
      body: item.body ?? null,
      href: item.href ?? null,
      payload_json: item.payloadJson ?? {},
      created_by: item.createdBy
    }))
  );

  if (error) {
    throw new Error(`Failed to create inbox items: ${error.message}`);
  }
}

export async function listCalendarReadModel(orgId: string): Promise<CalendarReadModel> {
  const [entries, rules, occurrences, exceptions, configurationsResult, allocations, invites] = await Promise.all([
    listCalendarEntries(orgId),
    listCalendarRules(orgId),
    listCalendarOccurrences(orgId, { includeCancelled: true }),
    listCalendarRuleExceptions(orgId),
    listFacilitySpaceConfigurations(orgId, { includeInactive: true }).catch((error: unknown) => {
      // Avoid hard-failing facility pages when configuration fetch has transient network issues.
      console.error("[calendar] Falling back to empty facility configurations.", error);
      return [];
    }),
    listOccurrenceFacilityAllocations(orgId),
    listOccurrenceTeamInvites(orgId, { includeInactive: true })
  ]);
  const configurations = configurationsResult;

  return {
    entries,
    rules,
    occurrences,
    exceptions,
    configurations,
    allocations,
    invites
  };
}

export async function getCalendarOccurrenceReadModel(orgId: string, occurrenceId: string): Promise<CalendarOccurrenceReadModel | null> {
  const occurrence = await getCalendarOccurrenceById(orgId, occurrenceId);
  if (!occurrence) {
    return null;
  }

  const [entry, allocation, teams] = await Promise.all([
    getCalendarEntryById(orgId, occurrence.entryId),
    listOccurrenceFacilityAllocations(orgId, { occurrenceId }).then((items) => items[0] ?? null),
    listOccurrenceTeamInvites(orgId, { occurrenceId, includeInactive: true })
  ]);

  if (!entry) {
    return null;
  }

  return {
    occurrence,
    entry,
    allocation,
    teams
  };
}

export async function listPublishedCalendarCatalog(
  orgId: string,
  options?: {
    fromUtc?: string;
    toUtc?: string;
    limit?: number;
  }
): Promise<CalendarPublicCatalogItem[]> {
  const supabase = await createSupabaseServer();
  let query = supabase
    .from("calendar_occurrences")
    .select(
      "id, entry_id, timezone, starts_at_utc, ends_at_utc, local_date, local_start_time, local_end_time, metadata_json, calendar_entries!inner(id, entry_type, title, summary, visibility, status, settings_json)"
    )
    .eq("org_id", orgId)
    .eq("status", "scheduled")
    .in("calendar_entries.entry_type", ["event", "game"])
    .eq("calendar_entries.visibility", "published")
    .eq("calendar_entries.status", "scheduled")
    .order("starts_at_utc", { ascending: true });

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
    throw new Error(`Failed to list published calendar catalog: ${error.message}`);
  }

  return (data ?? []).flatMap((row: any) => {
    const entry = Array.isArray(row.calendar_entries) ? row.calendar_entries[0] : row.calendar_entries;
    if (!entry) {
      return [];
    }

    const entrySettings = asObject(entry.settings_json);
    const occurrenceMeta = asObject(row.metadata_json);

    const isAllDay = Boolean(occurrenceMeta.isAllDay ?? false);
    const allDayStartDate = typeof occurrenceMeta.allDayStartDate === "string" ? occurrenceMeta.allDayStartDate : null;
    const allDayEndDate = typeof occurrenceMeta.allDayEndDate === "string" ? occurrenceMeta.allDayEndDate : null;
    const location = typeof entrySettings.location === "string" ? entrySettings.location : null;

    return [
      {
        occurrenceId: row.id,
        entryId: entry.id,
        entryType: entry.entry_type,
        title: entry.title,
        summary: entry.summary ?? null,
        timezone: row.timezone,
        startsAtUtc: row.starts_at_utc,
        endsAtUtc: row.ends_at_utc,
        isAllDay,
        allDayStartDate,
        allDayEndDate,
        location
      } satisfies CalendarPublicCatalogItem
    ];
  });
}

export async function listOrgActiveTeams(orgId: string): Promise<Array<{ id: string; label: string }>> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("program_teams")
    .select("id, program_nodes(name)")
    .eq("org_id", orgId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list active teams: ${error.message}`);
  }

  return (data ?? []).flatMap((row: any) => {
    const programNode = Array.isArray(row.program_nodes) ? row.program_nodes[0] : row.program_nodes;
    if (!row.id || !programNode?.name) {
      return [];
    }
    return [{ id: row.id as string, label: programNode.name as string }];
  });
}
