import { createSupabaseServer } from "@/src/shared/data-api/server";
import type {
  CalendarAudience,
  CalendarEntry,
  CalendarEntryStatus,
  CalendarEntryType,
  CalendarLensSavedView,
  CalendarOccurrence,
  CalendarOccurrenceReadModel,
  CalendarPageContextType,
  CalendarPurpose,
  CalendarPublicCatalogItem,
  CalendarReadModel,
  CalendarRule,
  CalendarRuleException,
  CalendarRuleFacilityAllocation,
  CalendarSource,
  FacilityAllocation,
  FacilitySpaceConfiguration,
  InboxItem,
  OccurrenceInviteStatus,
  OccurrenceTeamInvite,
  OccurrenceTeamRole
} from "@/src/features/calendar/types";
import type { GeneratedCalendarOccurrenceInput } from "@/src/features/calendar/rule-engine";

const entrySelect =
  "id, org_id, source_id, purpose, audience, entry_type:item_type, title, summary, visibility, status, host_team_id, default_timezone:timezone, settings_json:settings, created_by:created_by_user_id, updated_by:updated_by_user_id, created_at, updated_at";
const sourceSelect =
  "id, org_id, name, scope_type, scope_id, scope_label, parent_source_id, purpose_defaults, audience_defaults, is_custom_calendar, is_active, display_json:display, created_by:created_by_user_id, updated_by:updated_by_user_id, created_at, updated_at";
const ruleSelect =
  "id, org_id, entry_id:item_id, mode, timezone, start_date, end_date, start_time, end_time, interval_count, interval_unit, by_weekday, by_monthday, end_mode, until_date, max_occurrences, sort_index, is_active, config_json:config, rule_hash, created_by:created_by_user_id, updated_by:updated_by_user_id, created_at, updated_at";
const occurrenceSelect =
  "id, org_id, entry_id:item_id, source_rule_id, source_type, source_key, timezone, local_date, local_start_time, local_end_time, starts_at_utc, ends_at_utc, status, metadata_json:metadata, created_by:created_by_user_id, updated_by:updated_by_user_id, created_at, updated_at";
const exceptionSelect =
  "id, org_id, rule_id, source_key, kind, override_occurrence_id, payload_json:payload, created_by:created_by_user_id, updated_by:updated_by_user_id, created_at, updated_at";
const configurationSelect =
  "id, org_id, name, slug, config_name, config_slug, config_capacity_teams, config_is_active, config_sort_index, config_metadata_json, config_created_by, config_updated_by, config_created_at, config_updated_at";
const allocationSelect =
  "id, org_id, occurrence_id, space_id, configuration_id, lock_mode, allow_shared, starts_at_utc, ends_at_utc, is_active, metadata_json:metadata, created_by:created_by_user_id, updated_by:updated_by_user_id, created_at, updated_at";
const ruleAllocationSelect =
  "id, org_id, rule_id, space_id, configuration_id, lock_mode, allow_shared, is_active, metadata_json:metadata, created_by:created_by_user_id, updated_by:updated_by_user_id, created_at, updated_at";
const inviteSelect =
  "id, org_id, occurrence_id, team_id, role, invite_status, invited_by_user_id, invited_at, responded_by_user_id, responded_at, created_at, updated_at";
const inboxSelect =
  "id, org_id, recipient_user_id, item_type, title, body, href, payload_json, is_read, read_at, is_archived, archived_at, created_by, created_at";
const savedLensViewSelect =
  "id, org_id, user_id, name, context_type, is_default, config_json, created_at, updated_at";

type EntryRow = {
  id: string;
  org_id: string;
  source_id: string | null;
  purpose: CalendarPurpose | null;
  audience: CalendarAudience | null;
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

type SourceRow = {
  id: string;
  org_id: string;
  name: string;
  scope_type: CalendarSource["scopeType"];
  scope_id: string | null;
  scope_label: string | null;
  parent_source_id: string | null;
  purpose_defaults: CalendarPurpose[] | null;
  audience_defaults: CalendarAudience[] | null;
  is_custom_calendar: boolean;
  is_active: boolean;
  display_json: unknown;
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
  name: string;
  slug: string;
  config_name: string;
  config_slug: string;
  config_capacity_teams: number | null;
  config_is_active: boolean;
  config_sort_index: number;
  config_metadata_json: unknown;
  config_created_by: string | null;
  config_updated_by: string | null;
  config_created_at: string;
  config_updated_at: string;
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

type RuleAllocationRow = {
  id: string;
  org_id: string;
  rule_id: string;
  space_id: string;
  configuration_id: string;
  lock_mode: FacilityAllocation["lockMode"];
  allow_shared: boolean;
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

type SavedLensViewRow = {
  id: string;
  org_id: string;
  user_id: string;
  name: string;
  context_type: CalendarPageContextType | null;
  is_default: boolean;
  config_json: unknown;
  created_at: string;
  updated_at: string;
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
    sourceId: row.source_id,
    purpose: row.purpose ?? (row.entry_type === "game" ? "games" : row.entry_type === "practice" ? "practices" : "custom_other"),
    audience: row.audience ?? (row.visibility === "published" ? "public" : "private_internal"),
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

function mapSource(row: SourceRow): CalendarSource {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    scopeLabel: row.scope_label,
    parentSourceId: row.parent_source_id,
    purposeDefaults: Array.isArray(row.purpose_defaults) ? row.purpose_defaults : [],
    audienceDefaults: Array.isArray(row.audience_defaults) ? row.audience_defaults : [],
    isCustomCalendar: row.is_custom_calendar,
    isActive: row.is_active,
    displayJson: asObject(row.display_json),
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
    spaceId: row.id,
    name: row.config_name || "Default",
    slug: row.config_slug || `${row.slug}-default`,
    capacityTeams: row.config_capacity_teams,
    isActive: row.config_is_active,
    sortIndex: Number.isFinite(row.config_sort_index) ? row.config_sort_index : 0,
    metadataJson: asObject(row.config_metadata_json),
    createdBy: row.config_created_by,
    updatedBy: row.config_updated_by,
    createdAt: row.config_created_at,
    updatedAt: row.config_updated_at
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

function mapRuleAllocation(row: RuleAllocationRow): CalendarRuleFacilityAllocation {
  return {
    id: row.id,
    orgId: row.org_id,
    ruleId: row.rule_id,
    spaceId: row.space_id,
    configurationId: row.configuration_id,
    lockMode: row.lock_mode,
    allowShared: row.allow_shared,
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

function mapSavedLensView(row: SavedLensViewRow): CalendarLensSavedView {
  return {
    id: row.id,
    orgId: row.org_id,
    userId: row.user_id,
    name: row.name,
    contextType: row.context_type,
    isDefault: row.is_default,
    configJson: asObject(row.config_json) as CalendarLensSavedView["configJson"],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listCalendarEntries(orgId: string): Promise<CalendarEntry[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("calendar").from("calendar_items")
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
    .schema("calendar").from("calendar_items")
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
  sourceId?: string | null;
  purpose?: CalendarPurpose;
  audience?: CalendarAudience;
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
    .schema("calendar").from("calendar_items")
    .insert({
      org_id: input.orgId,
      source_id: input.sourceId ?? null,
      purpose: input.purpose ?? (input.entryType === "game" ? "games" : input.entryType === "practice" ? "practices" : "custom_other"),
      audience: input.audience ?? (input.visibility === "published" ? "public" : "private_internal"),
      item_type: input.entryType,
      title: input.title,
      summary: input.summary,
      visibility: input.visibility,
      status: input.status,
      host_team_id: input.hostTeamId,
      timezone: input.defaultTimezone,
      settings: input.settingsJson ?? {},
      created_by_user_id: input.createdBy,
      updated_by_user_id: input.createdBy
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
  sourceId?: string | null;
  purpose?: CalendarPurpose;
  audience?: CalendarAudience;
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
    .schema("calendar").from("calendar_items")
    .update({
      source_id: input.sourceId ?? null,
      purpose: input.purpose ?? (input.entryType === "game" ? "games" : input.entryType === "practice" ? "practices" : "custom_other"),
      audience: input.audience ?? (input.visibility === "published" ? "public" : "private_internal"),
      item_type: input.entryType,
      title: input.title,
      summary: input.summary,
      visibility: input.visibility,
      status: input.status,
      host_team_id: input.hostTeamId,
      timezone: input.defaultTimezone,
      settings: input.settingsJson ?? {},
      updated_by_user_id: input.updatedBy
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
  const { error } = await supabase.schema("calendar").from("calendar_items").delete().eq("org_id", orgId).eq("id", entryId);

  if (error) {
    throw new Error(`Failed to delete calendar entry: ${error.message}`);
  }
}

export async function listCalendarRules(orgId: string, options?: { entryId?: string }): Promise<CalendarRule[]> {
  const supabase = await createSupabaseServer();
  let query = supabase
    .schema("calendar").from("calendar_item_rules")
    .select(ruleSelect)
    .eq("org_id", orgId)
    .order("sort_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (options?.entryId) {
    query = query.eq("item_id", options.entryId);
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
    .schema("calendar").from("calendar_item_rules")
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
    .schema("calendar").from("calendar_item_rules")
    .upsert({
      id: input.ruleId,
      org_id: input.orgId,
      item_id: input.entryId,
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
      config: input.configJson,
      rule_hash: input.ruleHash,
      created_by_user_id: input.actorUserId,
      updated_by_user_id: input.actorUserId
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
  const { error } = await supabase.schema("calendar").from("calendar_item_rules").delete().eq("org_id", orgId).eq("id", ruleId);

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
    .schema("calendar").from("calendar_item_occurrences")
    .select(occurrenceSelect)
    .eq("org_id", orgId)
    .order("starts_at_utc", { ascending: true })
    .order("created_at", { ascending: true });

  if (!options?.includeCancelled) {
    query = query.eq("status", "scheduled");
  }

  if (options?.entryId) {
    query = query.eq("item_id", options.entryId);
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

export async function listCalendarOccurrencesByRule(
  orgId: string,
  ruleId: string,
  options?: {
    includeCancelled?: boolean;
  }
): Promise<CalendarOccurrence[]> {
  const supabase = await createSupabaseServer();
  let query = supabase
    .schema("calendar").from("calendar_item_occurrences")
    .select(occurrenceSelect)
    .eq("org_id", orgId)
    .eq("source_rule_id", ruleId)
    .order("starts_at_utc", { ascending: true })
    .order("created_at", { ascending: true });

  if (!options?.includeCancelled) {
    query = query.eq("status", "scheduled");
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list calendar occurrences by rule: ${error.message}`);
  }

  return (data ?? []).map((row) => mapOccurrence(row as OccurrenceRow));
}

export async function getCalendarOccurrenceById(orgId: string, occurrenceId: string): Promise<CalendarOccurrence | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("calendar").from("calendar_item_occurrences")
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
    .schema("calendar").from("calendar_item_occurrences")
    .insert({
      org_id: input.orgId,
      item_id: input.entryId,
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
      metadata: input.metadataJson ?? {},
      created_by_user_id: input.actorUserId,
      updated_by_user_id: input.actorUserId
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
    .schema("calendar").from("calendar_item_occurrences")
    .update({
      timezone: input.timezone,
      local_date: input.localDate,
      local_start_time: input.localStartTime,
      local_end_time: input.localEndTime,
      starts_at_utc: input.startsAtUtc,
      ends_at_utc: input.endsAtUtc,
      status: input.status,
      metadata: input.metadataJson ?? {},
      updated_by_user_id: input.actorUserId
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
    .schema("calendar").from("calendar_item_occurrences")
    .update({
      status: input.status,
      updated_by_user_id: input.actorUserId
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

export async function deleteCalendarOccurrenceRecord(input: {
  orgId: string;
  occurrenceId: string;
}): Promise<void> {
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .schema("calendar").from("calendar_item_occurrences")
    .delete()
    .eq("org_id", input.orgId)
    .eq("id", input.occurrenceId);

  if (error) {
    throw new Error(`Failed to delete calendar occurrence: ${error.message}`);
  }
}

export async function setCalendarOccurrenceStatusBySourceKey(input: {
  orgId: string;
  sourceKey: string;
  status: CalendarOccurrence["status"];
  actorUserId: string;
}): Promise<void> {
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .schema("calendar").from("calendar_item_occurrences")
    .update({
      status: input.status,
      updated_by_user_id: input.actorUserId
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
    const { error: upsertError } = await supabase.schema("calendar").from("calendar_item_occurrences").upsert(
      occurrences.map((occurrence) => ({
        org_id: orgId,
        item_id: occurrence.entryId,
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
        metadata: occurrence.metadataJson,
        updated_by_user_id: actorUserId
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
    .schema("calendar").from("calendar_item_occurrences")
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
      .schema("calendar").from("calendar_item_occurrences")
      .update({ status: "cancelled", updated_by_user_id: actorUserId })
      .in("id", staleIds);

    if (staleError) {
      throw new Error(`Failed to cancel stale generated calendar occurrences: ${staleError.message}`);
    }
  }
}

export async function listCalendarRuleExceptions(orgId: string, options?: { ruleId?: string }): Promise<CalendarRuleException[]> {
  const supabase = await createSupabaseServer();
  let query = supabase
    .schema("calendar").from("calendar_item_rule_exceptions")
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
    .schema("calendar").from("calendar_item_rule_exceptions")
    .upsert({
      org_id: input.orgId,
      rule_id: input.ruleId,
      source_key: input.sourceKey,
      kind: input.kind,
      override_occurrence_id: input.overrideOccurrenceId,
      payload: input.payloadJson ?? {},
      created_by_user_id: input.actorUserId,
      updated_by_user_id: input.actorUserId
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
    .schema("calendar").from("calendar_item_rule_exceptions")
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
    .schema("facilities").from("spaces")
    .select(configurationSelect)
    .eq("org_id", orgId)
    .order("config_sort_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (options?.spaceId) {
    query = query.eq("id", options.spaceId);
  }

  if (!options?.includeInactive) {
    query = query.eq("config_is_active", true);
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
    .schema("facilities").from("spaces")
    .update({
      config_name: input.name,
      config_slug: input.slug,
      config_capacity_teams: input.capacityTeams,
      config_is_active: input.isActive ?? true,
      config_sort_index: input.sortIndex ?? 0,
      config_metadata_json: input.metadataJson ?? {},
      config_updated_by: input.actorUserId,
      config_updated_at: new Date().toISOString(),
      config_created_by: input.actorUserId
    })
    .eq("org_id", input.orgId)
    .eq("id", input.spaceId)
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
  return createFacilitySpaceConfiguration({
    orgId: input.orgId,
    spaceId: input.spaceId,
    name: "Default",
    slug: toSlug("default"),
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
    .schema("calendar").from("calendar_item_space_allocations")
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
    .schema("calendar").from("calendar_item_space_allocations")
    .upsert(
      {
        org_id: input.orgId,
        occurrence_id: input.occurrenceId,
        space_id: input.spaceId,
        configuration_id: input.configurationId,
        lock_mode: input.lockMode,
        allow_shared: input.allowShared,
        metadata: input.metadataJson ?? {},
        created_by_user_id: input.actorUserId,
        updated_by_user_id: input.actorUserId
      },
      {
        onConflict: "occurrence_id,space_id"
      }
    )
    .select(allocationSelect)
    .single();

  if (error) {
    throw new Error(`Failed to save facility allocation: ${error.message}`);
  }

  return mapAllocation(data as AllocationRow);
}

export async function replaceOccurrenceFacilityAllocations(input: {
  orgId: string;
  occurrenceId: string;
  allocations: Array<{
    spaceId: string;
    configurationId: string;
    lockMode: FacilityAllocation["lockMode"];
    allowShared: boolean;
    metadataJson?: Record<string, unknown>;
  }>;
  actorUserId: string;
}): Promise<FacilityAllocation[]> {
  const supabase = await createSupabaseServer();
  const payload = input.allocations.map((allocation) => ({
    org_id: input.orgId,
    occurrence_id: input.occurrenceId,
    space_id: allocation.spaceId,
    configuration_id: allocation.configurationId,
    lock_mode: allocation.lockMode,
    allow_shared: allocation.allowShared,
    metadata: allocation.metadataJson ?? {},
    created_by_user_id: input.actorUserId,
    updated_by_user_id: input.actorUserId
  }));

  const { data, error } = await supabase
    .schema("calendar").from("calendar_item_space_allocations")
    .upsert(payload, { onConflict: "occurrence_id,space_id" })
    .select(allocationSelect);

  if (error) {
    throw new Error(`Failed to save facility allocations: ${error.message}`);
  }

  const keepSpaceIds = input.allocations.map((allocation) => allocation.spaceId);
  const deleteQuery = supabase
    .schema("calendar").from("calendar_item_space_allocations")
    .delete()
    .eq("org_id", input.orgId)
    .eq("occurrence_id", input.occurrenceId);

  if (keepSpaceIds.length > 0) {
    deleteQuery.not("space_id", "in", `(${keepSpaceIds.join(",")})`);
  }

  const { error: deleteError } = await deleteQuery;
  if (deleteError) {
    throw new Error(`Failed to prune facility allocations: ${deleteError.message}`);
  }

  return (data ?? []).map((row) => mapAllocation(row as AllocationRow));
}

export async function listCalendarRuleFacilityAllocations(
  orgId: string,
  options?: {
    ruleId?: string;
  }
): Promise<CalendarRuleFacilityAllocation[]> {
  const supabase = await createSupabaseServer();
  let query = supabase
    .schema("calendar").from("calendar_item_space_allocations")
    .select(ruleAllocationSelect)
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  if (options?.ruleId) {
    query = query.eq("rule_id", options.ruleId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list rule facility allocations: ${error.message}`);
  }

  return (data ?? []).map((row) => mapRuleAllocation(row as RuleAllocationRow));
}

export async function replaceCalendarRuleFacilityAllocations(input: {
  orgId: string;
  ruleId: string;
  allocations: Array<{
    spaceId: string;
    configurationId: string;
    lockMode: FacilityAllocation["lockMode"];
    allowShared: boolean;
    metadataJson?: Record<string, unknown>;
  }>;
  actorUserId: string;
}): Promise<CalendarRuleFacilityAllocation[]> {
  const supabase = await createSupabaseServer();
  const payload = input.allocations.map((allocation) => ({
    org_id: input.orgId,
    rule_id: input.ruleId,
    space_id: allocation.spaceId,
    configuration_id: allocation.configurationId,
    lock_mode: allocation.lockMode,
    allow_shared: allocation.allowShared,
    metadata: allocation.metadataJson ?? {},
    created_by_user_id: input.actorUserId,
    updated_by_user_id: input.actorUserId
  }));

  const { data, error } = await supabase
    .schema("calendar").from("calendar_item_space_allocations")
    .upsert(payload, { onConflict: "rule_id,space_id" })
    .select(ruleAllocationSelect);

  if (error) {
    throw new Error(`Failed to save rule facility allocations: ${error.message}`);
  }

  const keepSpaceIds = input.allocations.map((allocation) => allocation.spaceId);
  const deleteQuery = supabase
    .schema("calendar").from("calendar_item_space_allocations")
    .delete()
    .eq("org_id", input.orgId)
    .eq("rule_id", input.ruleId);

  if (keepSpaceIds.length > 0) {
    deleteQuery.not("space_id", "in", `(${keepSpaceIds.join(",")})`);
  }

  const { error: deleteError } = await deleteQuery;
  if (deleteError) {
    throw new Error(`Failed to prune rule facility allocations: ${deleteError.message}`);
  }

  return (data ?? []).map((row) => mapRuleAllocation(row as RuleAllocationRow));
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
    .schema("calendar").from("calendar_item_participants")
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
    .schema("calendar").from("calendar_item_participants")
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
    .schema("calendar").from("calendar_item_participants")
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
    .schema("notifications").from("user_notifications")
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
  const { error } = await supabase.schema("notifications").from("user_notifications").insert(
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

export async function listCalendarSources(orgId: string): Promise<CalendarSource[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("calendar").from("calendar_item_sources")
    .select(sourceSelect)
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list calendar sources: ${error.message}`);
  }

  return (data ?? []).map((row) => mapSource(row as SourceRow));
}

export async function upsertCalendarSource(input: {
  orgId: string;
  sourceId?: string;
  name: string;
  scopeType: CalendarSource["scopeType"];
  scopeId: string | null;
  scopeLabel: string | null;
  parentSourceId: string | null;
  purposeDefaults: CalendarPurpose[];
  audienceDefaults: CalendarAudience[];
  isCustomCalendar: boolean;
  isActive: boolean;
  displayJson?: Record<string, unknown>;
  actorUserId: string;
}): Promise<CalendarSource> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("calendar").from("calendar_item_sources")
    .upsert({
      id: input.sourceId,
      org_id: input.orgId,
      name: input.name,
      scope_type: input.scopeType,
      scope_id: input.scopeId,
      scope_label: input.scopeLabel,
      parent_source_id: input.parentSourceId,
      purpose_defaults: input.purposeDefaults,
      audience_defaults: input.audienceDefaults,
      is_custom_calendar: input.isCustomCalendar,
      is_active: input.isActive,
      display: input.displayJson ?? {},
      created_by_user_id: input.actorUserId,
      updated_by_user_id: input.actorUserId
    })
    .select(sourceSelect)
    .single();

  if (error) {
    throw new Error(`Failed to save calendar source: ${error.message}`);
  }

  return mapSource(data as SourceRow);
}

export async function listCalendarLensSavedViews(input: {
  orgId: string;
  userId: string;
  contextType?: CalendarPageContextType | null;
}): Promise<CalendarLensSavedView[]> {
  const supabase = await createSupabaseServer();
  let query = supabase
    .schema("calendar").from("calendar_saved_views")
    .select(savedLensViewSelect)
    .eq("org_id", input.orgId)
    .eq("user_id", input.userId)
    .order("updated_at", { ascending: false });

  if (input.contextType) {
    query = query.eq("context_type", input.contextType);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list saved views: ${error.message}`);
  }

  return (data ?? []).map((row) => mapSavedLensView(row as SavedLensViewRow));
}

export async function saveCalendarLensView(input: {
  orgId: string;
  userId: string;
  viewId?: string;
  name: string;
  contextType: CalendarPageContextType | null;
  isDefault: boolean;
  configJson: Record<string, unknown>;
}): Promise<CalendarLensSavedView> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("calendar").from("calendar_saved_views")
    .upsert({
      id: input.viewId,
      org_id: input.orgId,
      user_id: input.userId,
      name: input.name,
      context_type: input.contextType,
      is_default: input.isDefault,
      config_json: input.configJson
    })
    .select(savedLensViewSelect)
    .single();

  if (error) {
    throw new Error(`Failed to save view: ${error.message}`);
  }

  return mapSavedLensView(data as SavedLensViewRow);
}

export async function deleteCalendarLensView(input: { orgId: string; userId: string; viewId: string }): Promise<void> {
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .schema("calendar").from("calendar_saved_views")
    .delete()
    .eq("org_id", input.orgId)
    .eq("user_id", input.userId)
    .eq("id", input.viewId);
  if (error) {
    throw new Error(`Failed to delete saved view: ${error.message}`);
  }
}

type TeamCalendarVisibility = "team_members" | "program_members" | "org_members";

function asTeamCalendarVisibility(value: unknown): TeamCalendarVisibility | null {
  if (value === "team_members" || value === "program_members" || value === "org_members") {
    return value;
  }
  return null;
}

const calendarColorPalette = [
  "#2563EB",
  "#0891B2",
  "#0D9488",
  "#16A34A",
  "#65A30D",
  "#EA580C",
  "#DC2626",
  "#DB2777",
  "#9333EA",
  "#7C3AED",
  "#4F46E5",
  "#0284C7",
  "#0F766E",
  "#15803D",
  "#4D7C0F",
  "#C2410C",
  "#B91C1C",
  "#BE185D",
  "#7E22CE",
  "#6D28D9"
] as const;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }
  return uuidPattern.test(value);
}

function hasSourceColor(displayJson: Record<string, unknown>) {
  const colorKeys = ["color", "accentColor", "calendarColor", "primaryColor", "colorPrimary", "orgColor", "brandColor"];
  return colorKeys.some((key) => typeof displayJson[key] === "string" && (displayJson[key] as string).trim().length > 0);
}

function readSourceColor(displayJson: Record<string, unknown>) {
  const colorKeys = ["color", "accentColor", "calendarColor", "primaryColor", "colorPrimary", "orgColor", "brandColor"];
  for (const key of colorKeys) {
    const value = displayJson[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim().toLowerCase();
    }
  }
  return null;
}

async function buildCalendarSourceHierarchy(orgId: string, sources: CalendarSource[]): Promise<CalendarSource[]> {
  const supabase = await createSupabaseServer();
  const teamSources = sources.filter((source) => source.scopeType === "team");
  const programSources = sources.filter((source) => source.scopeType === "program");
  const divisionSources = sources.filter((source) => source.scopeType === "division");
  const organizationAndCustomSources = sources.filter((source) => source.scopeType === "organization" || source.scopeType === "custom");
  const programSourceIdByProgramId = new Map(
    programSources.map((source) => [source.scopeId ?? source.id, source.id] as const).filter((entry): entry is [string, string] => Boolean(entry[0]))
  );
  const divisionSourceIdByDivisionId = new Map(
    divisionSources.map((source) => [source.scopeId ?? source.id, source.id] as const).filter((entry): entry is [string, string] => Boolean(entry[0]))
  );

  const teamIds = teamSources
    .map((source) => source.scopeId)
    .filter((value): value is string => isUuid(value));

  const { data: teamRows, error: teamError } = teamIds.length
    ? await supabase
        .schema("programs").from("program_teams")
        .select("id, program_id, program_node_id, settings_json, program_structure_nodes(id, name, parent_id, settings_json)")
        .eq("org_id", orgId)
        .in("id", teamIds)
    : { data: [], error: null };

  if (teamError) {
    throw new Error(`Failed to build calendar source hierarchy: ${teamError.message}`);
  }

  const teamMetaByTeamId = new Map<
    string,
    {
      programId: string;
      teamNodeName: string | null;
      divisionId: string | null;
      teamSettings: Record<string, unknown>;
      divisionSettings: Record<string, unknown>;
    }
  >();

  const divisionIds = new Set<string>();
  const programIds = new Set<string>();

  for (const row of (teamRows ?? []) as any[]) {
    const node = Array.isArray(row.program_structure_nodes) ? row.program_structure_nodes[0] : row.program_structure_nodes;
    const divisionId = typeof node?.parent_id === "string" ? node.parent_id : null;
    const teamSettings = asObject(row.settings_json);
    const divisionSettings = asObject(node?.settings_json);
    teamMetaByTeamId.set(row.id, {
      programId: row.program_id,
      teamNodeName: typeof node?.name === "string" ? node.name : null,
      divisionId,
      teamSettings,
      divisionSettings
    });
    if (row.program_id) {
      programIds.add(row.program_id);
    }
    if (divisionId) {
      divisionIds.add(divisionId);
    }
  }

  for (const source of divisionSources) {
    if (isUuid(source.scopeId)) {
      divisionIds.add(source.scopeId);
    }
  }

  const { data: divisionRows, error: divisionError } = divisionIds.size
    ? await supabase.schema("programs").from("program_structure_nodes").select("id, program_id, name, settings_json").in("id", Array.from(divisionIds))
    : { data: [], error: null };
  if (divisionError) {
    throw new Error(`Failed to list division nodes for calendar hierarchy: ${divisionError.message}`);
  }
  const divisionById = new Map(
    (divisionRows ?? []).map(
      (row: any) => [row.id, { name: row.name as string, programId: row.program_id as string | null, settings: asObject(row.settings_json) }] as const
    )
  );

  const { data: programRows, error: programError } = programIds.size
    ? await supabase.schema("programs").from("programs").select("id, name, settings_json").in("id", Array.from(programIds))
    : { data: [], error: null };
  if (programError) {
    throw new Error(`Failed to list program settings for calendar hierarchy: ${programError.message}`);
  }
  const programById = new Map(
    (programRows ?? []).map((row: any) => [row.id, { name: row.name as string, settings: asObject(row.settings_json) }] as const)
  );

  const syntheticDivisionSources = new Map<string, CalendarSource>();
  const enrichedSources = sources.map((source) => {
    if (source.scopeType !== "team" || !source.scopeId) {
      return source;
    }
    const meta = teamMetaByTeamId.get(source.scopeId);
    if (!meta) {
      return source;
    }

    const division = meta.divisionId ? divisionById.get(meta.divisionId) ?? null : null;
    const program = programById.get(meta.programId) ?? null;
    const programDefault = asTeamCalendarVisibility(program?.settings.calendarTeamVisibilityDefault);
    const programForced = asTeamCalendarVisibility(program?.settings.calendarTeamVisibilityForced);
    const divisionDefault = asTeamCalendarVisibility(division?.settings.calendarTeamVisibilityDefault);
    const divisionForced = asTeamCalendarVisibility(division?.settings.calendarTeamVisibilityForced);
    const teamSetting = asTeamCalendarVisibility(meta.teamSettings.calendarTeamVisibility);
    const forcedValue = divisionForced ?? programForced ?? null;
    const forcedBy = divisionForced ? "division" : programForced ? "program" : null;
    const effectiveVisibility = forcedValue ?? teamSetting ?? divisionDefault ?? programDefault ?? "team_members";
    const divisionSourceId = meta.divisionId ? divisionSourceIdByDivisionId.get(meta.divisionId) ?? null : null;
    const syntheticDivisionSourceId = meta.divisionId ? `division:${meta.divisionId}` : null;
    const parentSourceId =
      divisionSourceId ?? syntheticDivisionSourceId ?? programSourceIdByProgramId.get(meta.programId) ?? source.parentSourceId;

    if (meta.divisionId && division && !divisionSourceId) {
      syntheticDivisionSources.set(meta.divisionId, {
        id: `division:${meta.divisionId}`,
        orgId,
        name: division.name || "Division",
        scopeType: "division",
        scopeId: meta.divisionId,
        scopeLabel: division.name || null,
        parentSourceId: programSourceIdByProgramId.get(meta.programId) ?? "group:programs",
        purposeDefaults: source.purposeDefaults,
        audienceDefaults: source.audienceDefaults,
        isCustomCalendar: false,
        isActive: true,
        displayJson: {
          synthetic: true,
          kind: "division_group",
          programId: meta.programId
        },
        createdBy: source.createdBy,
        updatedBy: source.updatedBy,
        createdAt: source.createdAt,
        updatedAt: source.updatedAt
      });
    }

    return {
      ...source,
      parentSourceId,
      displayJson: {
        ...source.displayJson,
        programId: meta.programId,
        programName: program?.name ?? null,
        divisionId: meta.divisionId,
        divisionName: division?.name ?? null,
        teamNodeName: meta.teamNodeName,
        teamCalendarVisibility: effectiveVisibility,
        teamCalendarVisibilityForcedBy: forcedBy
      }
    };
  });

  const withProgramGroup = enrichedSources.map((source) => {
    if (source.scopeType === "program") {
      return {
        ...source,
        parentSourceId: "group:programs"
      };
    }
    if (source.scopeType === "division") {
      const divisionProgramId =
        (source.scopeId ? divisionById.get(source.scopeId)?.programId ?? null : null) ??
        (typeof source.displayJson.programId === "string" ? source.displayJson.programId : null);
      return {
        ...source,
        parentSourceId: divisionProgramId ? (programSourceIdByProgramId.get(divisionProgramId) ?? "group:programs") : "group:programs",
        displayJson: {
          ...source.displayJson,
          ...(divisionProgramId ? { programId: divisionProgramId } : {})
        }
      };
    }
    if (source.scopeType === "organization" || source.scopeType === "custom") {
      return {
        ...source,
        parentSourceId: "group:organization"
      };
    }
    return source;
  });

  const syntheticGroups: CalendarSource[] = [
    {
      id: "group:programs",
      orgId,
      name: "Programs",
      scopeType: "custom",
      scopeId: null,
      scopeLabel: "Programs",
      parentSourceId: null,
      purposeDefaults: [],
      audienceDefaults: [],
      isCustomCalendar: false,
      isActive: true,
      displayJson: { synthetic: true, kind: "group_programs" },
      createdBy: null,
      updatedBy: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: "group:organization",
      orgId,
      name: "Organization Calendars",
      scopeType: "custom",
      scopeId: null,
      scopeLabel: "Organization Calendars",
      parentSourceId: null,
      purposeDefaults: [],
      audienceDefaults: [],
      isCustomCalendar: false,
      isActive: true,
      displayJson: { synthetic: true, kind: "group_org" },
      createdBy: null,
      updatedBy: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  const allSources = [...syntheticGroups, ...withProgramGroup, ...Array.from(syntheticDivisionSources.values())];
  const usageByColor = new Map<string, number>();
  for (const color of calendarColorPalette) {
    usageByColor.set(color.toLowerCase(), 0);
  }

  for (const source of allSources) {
    const color = readSourceColor(source.displayJson);
    if (!color) {
      continue;
    }
    if (!usageByColor.has(color)) {
      continue;
    }
    usageByColor.set(color, (usageByColor.get(color) ?? 0) + 1);
  }

  return allSources.map((source) => {
    if (hasSourceColor(source.displayJson)) {
      return source;
    }

    const nextColor = [...calendarColorPalette]
      .map((color) => color.toLowerCase())
      .sort((left, right) => {
        const leftCount = usageByColor.get(left) ?? 0;
        const rightCount = usageByColor.get(right) ?? 0;
        if (leftCount !== rightCount) {
          return leftCount - rightCount;
        }
        return left.localeCompare(right);
      })[0];

    usageByColor.set(nextColor, (usageByColor.get(nextColor) ?? 0) + 1);

    return {
      ...source,
      displayJson: {
        ...source.displayJson,
        color: nextColor
      }
    };
  });
}

export async function listCalendarReadModel(orgId: string): Promise<CalendarReadModel> {
  const [sourcesResult, entriesResult, rulesResult, occurrencesResult, exceptionsResult, configurationsResult, allocationsResult, ruleAllocationsResult, invitesResult] =
    await Promise.allSettled([
      listCalendarSources(orgId),
      listCalendarEntries(orgId),
      listCalendarRules(orgId),
      listCalendarOccurrences(orgId, { includeCancelled: true }),
      listCalendarRuleExceptions(orgId),
      listFacilitySpaceConfigurations(orgId, { includeInactive: true }),
      listOccurrenceFacilityAllocations(orgId),
      listCalendarRuleFacilityAllocations(orgId),
      listOccurrenceTeamInvites(orgId, { includeInactive: true })
    ]);

  const sources = sourcesResult.status === "fulfilled" ? sourcesResult.value : [];
  const entries = entriesResult.status === "fulfilled" ? entriesResult.value : [];
  const rules = rulesResult.status === "fulfilled" ? rulesResult.value : [];
  const occurrences = occurrencesResult.status === "fulfilled" ? occurrencesResult.value : [];
  const exceptions = exceptionsResult.status === "fulfilled" ? exceptionsResult.value : [];
  const configurations = configurationsResult.status === "fulfilled" ? configurationsResult.value : [];
  const allocations = allocationsResult.status === "fulfilled" ? allocationsResult.value : [];
  const ruleAllocations = ruleAllocationsResult.status === "fulfilled" ? ruleAllocationsResult.value : [];
  const invites = invitesResult.status === "fulfilled" ? invitesResult.value : [];

  if (entriesResult.status === "rejected" && occurrencesResult.status === "rejected") {
    throw new Error("Failed to load calendar entries and occurrences.");
  }

  const hierarchicalSources = await buildCalendarSourceHierarchy(orgId, sources).catch(() => sources);

  return {
    sources: hierarchicalSources,
    entries,
    rules,
    occurrences,
    exceptions,
    configurations,
    allocations,
    ruleAllocations,
    invites
  };
}

export async function getCalendarOccurrenceReadModel(orgId: string, occurrenceId: string): Promise<CalendarOccurrenceReadModel | null> {
  const occurrence = await getCalendarOccurrenceById(orgId, occurrenceId);
  if (!occurrence) {
    return null;
  }

  const [entry, allocations, teams] = await Promise.all([
    getCalendarEntryById(orgId, occurrence.entryId),
    listOccurrenceFacilityAllocations(orgId, { occurrenceId }),
    listOccurrenceTeamInvites(orgId, { occurrenceId, includeInactive: true })
  ]);

  if (!entry) {
    return null;
  }

  return {
    occurrence,
    entry,
    allocations,
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
    .schema("calendar").from("calendar_item_occurrences")
    .select(
      "id, entry_id:item_id, timezone, starts_at_utc, ends_at_utc, local_date, local_start_time, local_end_time, metadata_json:metadata, calendar_items!inner(id, entry_type:item_type, title, summary, visibility, status, settings_json:settings)"
    )
    .eq("org_id", orgId)
    .eq("status", "scheduled")
    .in("calendar_items.item_type", ["event", "game"])
    .eq("calendar_items.visibility", "published")
    .eq("calendar_items.status", "scheduled")
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
    const entry = Array.isArray(row.calendar_items) ? row.calendar_items[0] : row.calendar_items;
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
    .schema("programs").from("program_teams")
    .select("id, program_structure_nodes(name)")
    .eq("org_id", orgId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list active teams: ${error.message}`);
  }

  return (data ?? []).flatMap((row: any) => {
    const programNode = Array.isArray(row.program_structure_nodes) ? row.program_structure_nodes[0] : row.program_structure_nodes;
    if (!row.id || !programNode?.name) {
      return [];
    }
    return [{ id: row.id as string, label: programNode.name as string }];
  });
}
