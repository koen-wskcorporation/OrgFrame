import { createSupabaseServer } from "@/lib/supabase/server";
import { listProgramScheduleBlocks } from "@/modules/programs/db/queries";
import type {
  ProgramOccurrence,
  ProgramScheduleException,
  ProgramScheduleRule,
  ProgramWithDetails
} from "@/modules/programs/types";
import type { GeneratedOccurrenceInput } from "@/modules/programs/schedule/rule-engine";

const scheduleRuleSelect =
  "id, program_id, program_node_id, mode, title, timezone, start_date, end_date, start_time, end_time, interval_count, interval_unit, by_weekday, by_monthday, end_mode, until_date, max_occurrences, sort_index, is_active, config_json, rule_hash, created_at, updated_at";
const occurrenceSelect =
  "id, program_id, program_node_id, source_rule_id, source_type, source_key, title, timezone, local_date, local_start_time, local_end_time, starts_at_utc, ends_at_utc, status, metadata_json, created_at, updated_at";
const exceptionSelect =
  "id, program_id, rule_id, source_key, kind, override_occurrence_id, payload_json, created_at, updated_at";

type ScheduleRuleRow = {
  id: string;
  program_id: string;
  program_node_id: string | null;
  mode: ProgramScheduleRule["mode"];
  title: string | null;
  timezone: string;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  interval_count: number;
  interval_unit: ProgramScheduleRule["intervalUnit"] | null;
  by_weekday: number[] | null;
  by_monthday: number[] | null;
  end_mode: ProgramScheduleRule["endMode"];
  until_date: string | null;
  max_occurrences: number | null;
  sort_index: number;
  is_active: boolean;
  config_json: unknown;
  rule_hash: string;
  created_at: string;
  updated_at: string;
};

type OccurrenceRow = {
  id: string;
  program_id: string;
  program_node_id: string | null;
  source_rule_id: string | null;
  source_type: ProgramOccurrence["sourceType"];
  source_key: string;
  title: string | null;
  timezone: string;
  local_date: string;
  local_start_time: string | null;
  local_end_time: string | null;
  starts_at_utc: string;
  ends_at_utc: string;
  status: ProgramOccurrence["status"];
  metadata_json: unknown;
  created_at: string;
  updated_at: string;
};

type ExceptionRow = {
  id: string;
  program_id: string;
  rule_id: string;
  source_key: string;
  kind: ProgramScheduleException["kind"];
  override_occurrence_id: string | null;
  payload_json: unknown;
  created_at: string;
  updated_at: string;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function mapRule(row: ScheduleRuleRow): ProgramScheduleRule {
  return {
    id: row.id,
    programId: row.program_id,
    programNodeId: row.program_node_id,
    mode: row.mode,
    title: row.title,
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
    ruleHash: row.rule_hash ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapOccurrence(row: OccurrenceRow): ProgramOccurrence {
  return {
    id: row.id,
    programId: row.program_id,
    programNodeId: row.program_node_id,
    sourceRuleId: row.source_rule_id,
    sourceType: row.source_type,
    sourceKey: row.source_key,
    title: row.title,
    timezone: row.timezone,
    localDate: row.local_date,
    localStartTime: row.local_start_time,
    localEndTime: row.local_end_time,
    startsAtUtc: row.starts_at_utc,
    endsAtUtc: row.ends_at_utc,
    status: row.status,
    metadataJson: asObject(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapException(row: ExceptionRow): ProgramScheduleException {
  return {
    id: row.id,
    programId: row.program_id,
    ruleId: row.rule_id,
    sourceKey: row.source_key,
    kind: row.kind,
    overrideOccurrenceId: row.override_occurrence_id,
    payloadJson: asObject(row.payload_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listProgramScheduleRulesV2(programId: string): Promise<ProgramScheduleRule[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("program_schedule_rules")
    .select(scheduleRuleSelect)
    .eq("program_id", programId)
    .order("sort_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list schedule rules: ${error.message}`);
  }

  return (data ?? []).map((row) => mapRule(row as ScheduleRuleRow));
}

export async function getProgramScheduleRuleByIdV2(programId: string, ruleId: string): Promise<ProgramScheduleRule | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("program_schedule_rules")
    .select(scheduleRuleSelect)
    .eq("program_id", programId)
    .eq("id", ruleId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load schedule rule: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return mapRule(data as ScheduleRuleRow);
}

export async function listProgramOccurrencesV2(programId: string, options?: { includeCancelled?: boolean }): Promise<ProgramOccurrence[]> {
  const supabase = await createSupabaseServer();
  let query = supabase
    .from("program_occurrences")
    .select(occurrenceSelect)
    .eq("program_id", programId)
    .order("starts_at_utc", { ascending: true })
    .order("created_at", { ascending: true });

  if (!options?.includeCancelled) {
    query = query.eq("status", "scheduled");
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list occurrences: ${error.message}`);
  }

  return (data ?? []).map((row) => mapOccurrence(row as OccurrenceRow));
}

export async function getProgramOccurrenceByIdV2(programId: string, occurrenceId: string): Promise<ProgramOccurrence | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("program_occurrences")
    .select(occurrenceSelect)
    .eq("program_id", programId)
    .eq("id", occurrenceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load occurrence: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return mapOccurrence(data as OccurrenceRow);
}

export async function listProgramScheduleExceptionsV2(programId: string, options?: { ruleId?: string }): Promise<ProgramScheduleException[]> {
  const supabase = await createSupabaseServer();
  let query = supabase
    .from("program_schedule_exceptions")
    .select(exceptionSelect)
    .eq("program_id", programId)
    .order("created_at", { ascending: true });

  if (options?.ruleId) {
    query = query.eq("rule_id", options.ruleId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list schedule exceptions: ${error.message}`);
  }

  return (data ?? []).map((row) => mapException(row as ExceptionRow));
}

export async function upsertProgramScheduleRuleV2(input: {
  programId: string;
  ruleId?: string;
  programNodeId: string | null;
  mode: ProgramScheduleRule["mode"];
  title: string | null;
  timezone: string;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  intervalCount: number;
  intervalUnit: ProgramScheduleRule["intervalUnit"];
  byWeekday: number[] | null;
  byMonthday: number[] | null;
  endMode: ProgramScheduleRule["endMode"];
  untilDate: string | null;
  maxOccurrences: number | null;
  sortIndex: number;
  isActive: boolean;
  configJson: Record<string, unknown>;
  ruleHash: string;
}): Promise<ProgramScheduleRule> {
  const supabase = await createSupabaseServer();
  const payload = {
    id: input.ruleId,
    program_id: input.programId,
    program_node_id: input.programNodeId,
    mode: input.mode,
    title: input.title,
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
    rule_hash: input.ruleHash
  };
  const { data, error } = await supabase.from("program_schedule_rules").upsert(payload).select(scheduleRuleSelect).single();

  if (error) {
    throw new Error(`Failed to save schedule rule: ${error.message}`);
  }

  return mapRule(data as ScheduleRuleRow);
}

export async function deleteProgramScheduleRuleV2(programId: string, ruleId: string) {
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("program_schedule_rules").delete().eq("program_id", programId).eq("id", ruleId);
  if (error) {
    throw new Error(`Failed to delete schedule rule: ${error.message}`);
  }
}

export async function upsertRuleGeneratedOccurrencesV2(programId: string, ruleId: string, occurrences: GeneratedOccurrenceInput[]) {
  const supabase = await createSupabaseServer();
  const sourceKeys = new Set(occurrences.map((item) => item.sourceKey));
  if (occurrences.length > 0) {
    const { error: upsertError } = await supabase.from("program_occurrences").upsert(
      occurrences.map((occurrence) => ({
        program_id: programId,
        program_node_id: occurrence.programNodeId,
        source_rule_id: occurrence.sourceRuleId,
        source_type: occurrence.sourceType,
        source_key: occurrence.sourceKey,
        title: occurrence.title,
        timezone: occurrence.timezone,
        local_date: occurrence.localDate,
        local_start_time: occurrence.localStartTime,
        local_end_time: occurrence.localEndTime,
        starts_at_utc: occurrence.startsAtUtc,
        ends_at_utc: occurrence.endsAtUtc,
        status: occurrence.status,
        metadata_json: occurrence.metadataJson
      })),
      {
        onConflict: "program_id,source_key"
      }
    );

    if (upsertError) {
      throw new Error(`Failed to upsert generated occurrences: ${upsertError.message}`);
    }
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("program_occurrences")
    .select("id, source_key")
    .eq("program_id", programId)
    .eq("source_rule_id", ruleId)
    .eq("source_type", "rule");

  if (existingError) {
    throw new Error(`Failed to read existing generated occurrences: ${existingError.message}`);
  }

  const staleIds = (existingRows ?? [])
    .filter((row) => typeof row.source_key === "string" && !sourceKeys.has(row.source_key))
    .map((row) => row.id)
    .filter((value): value is string => typeof value === "string");

  if (staleIds.length > 0) {
    const { error: staleError } = await supabase.from("program_occurrences").update({ status: "cancelled" }).in("id", staleIds);
    if (staleError) {
      throw new Error(`Failed to mark stale generated occurrences as cancelled: ${staleError.message}`);
    }
  }
}

export async function insertProgramOccurrenceV2(input: {
  programId: string;
  programNodeId: string | null;
  sourceRuleId: string | null;
  sourceType: ProgramOccurrence["sourceType"];
  sourceKey: string;
  title: string | null;
  timezone: string;
  localDate: string;
  localStartTime: string | null;
  localEndTime: string | null;
  startsAtUtc: string;
  endsAtUtc: string;
  status?: ProgramOccurrence["status"];
  metadataJson?: Record<string, unknown>;
}): Promise<ProgramOccurrence> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("program_occurrences")
    .insert({
      program_id: input.programId,
      program_node_id: input.programNodeId,
      source_rule_id: input.sourceRuleId,
      source_type: input.sourceType,
      source_key: input.sourceKey,
      title: input.title,
      timezone: input.timezone,
      local_date: input.localDate,
      local_start_time: input.localStartTime,
      local_end_time: input.localEndTime,
      starts_at_utc: input.startsAtUtc,
      ends_at_utc: input.endsAtUtc,
      status: input.status ?? "scheduled",
      metadata_json: input.metadataJson ?? {}
    })
    .select(occurrenceSelect)
    .single();

  if (error) {
    throw new Error(`Failed to insert occurrence: ${error.message}`);
  }

  return mapOccurrence(data as OccurrenceRow);
}

export async function updateProgramOccurrenceV2(input: {
  programId: string;
  occurrenceId: string;
  title: string | null;
  programNodeId: string | null;
  timezone: string;
  localDate: string;
  localStartTime: string | null;
  localEndTime: string | null;
  startsAtUtc: string;
  endsAtUtc: string;
  status?: ProgramOccurrence["status"];
  metadataJson?: Record<string, unknown>;
}): Promise<ProgramOccurrence> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("program_occurrences")
    .update({
      title: input.title,
      program_node_id: input.programNodeId,
      timezone: input.timezone,
      local_date: input.localDate,
      local_start_time: input.localStartTime,
      local_end_time: input.localEndTime,
      starts_at_utc: input.startsAtUtc,
      ends_at_utc: input.endsAtUtc,
      status: input.status,
      metadata_json: input.metadataJson ?? {}
    })
    .eq("program_id", input.programId)
    .eq("id", input.occurrenceId)
    .select(occurrenceSelect)
    .single();

  if (error) {
    throw new Error(`Failed to update occurrence: ${error.message}`);
  }

  return mapOccurrence(data as OccurrenceRow);
}

export async function setOccurrenceStatusBySourceKeyV2(programId: string, sourceKey: string, status: ProgramOccurrence["status"]) {
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from("program_occurrences")
    .update({
      status
    })
    .eq("program_id", programId)
    .eq("source_key", sourceKey);

  if (error) {
    throw new Error(`Failed to update occurrence status by source key: ${error.message}`);
  }
}

export async function upsertProgramScheduleExceptionV2(input: {
  programId: string;
  ruleId: string;
  sourceKey: string;
  kind: ProgramScheduleException["kind"];
  overrideOccurrenceId: string | null;
  payloadJson?: Record<string, unknown>;
}): Promise<ProgramScheduleException> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("program_schedule_exceptions")
    .upsert({
      program_id: input.programId,
      rule_id: input.ruleId,
      source_key: input.sourceKey,
      kind: input.kind,
      override_occurrence_id: input.overrideOccurrenceId,
      payload_json: input.payloadJson ?? {}
    })
    .select(exceptionSelect)
    .single();

  if (error) {
    throw new Error(`Failed to upsert schedule exception: ${error.message}`);
  }

  return mapException(data as ExceptionRow);
}

export async function deleteProgramScheduleExceptionV2(input: { programId: string; ruleId: string; sourceKey: string; kind?: ProgramScheduleException["kind"] }) {
  const supabase = await createSupabaseServer();
  let query = supabase
    .from("program_schedule_exceptions")
    .delete()
    .eq("program_id", input.programId)
    .eq("rule_id", input.ruleId)
    .eq("source_key", input.sourceKey);
  if (input.kind) {
    query = query.eq("kind", input.kind);
  }

  const { error } = await query;

  if (error) {
    throw new Error(`Failed to delete schedule exception: ${error.message}`);
  }
}

export async function listProgramScheduleReadModelV2(programId: string) {
  const [rules, occurrences, exceptions] = await Promise.all([
    listProgramScheduleRulesV2(programId),
    listProgramOccurrencesV2(programId),
    listProgramScheduleExceptionsV2(programId)
  ]);

  return {
    rules,
    occurrences,
    exceptions
  };
}

export async function listProgramScheduleTimelineWithFallback(input: { programId: string; legacyDetails?: ProgramWithDetails }) {
  const v2Occurrences = await listProgramOccurrencesV2(input.programId).catch(() => []);
  if (v2Occurrences.length > 0) {
    return {
      source: "v2" as const,
      occurrences: v2Occurrences
    };
  }

  const legacyBlocks = input.legacyDetails?.scheduleBlocks ?? (await listProgramScheduleBlocks(input.programId).catch(() => []));
  const fallbackOccurrences: ProgramOccurrence[] = legacyBlocks.map((block) => {
    const localDate = block.oneOffAt ? block.oneOffAt.slice(0, 10) : block.startDate ?? block.endDate ?? new Date().toISOString().slice(0, 10);
    const localStartTime = block.startTime ?? (block.oneOffAt ? block.oneOffAt.slice(11, 16) : "00:00");
    const localEndTime = block.endTime ?? "23:59";
    const startsAt = block.oneOffAt ?? `${localDate}T${localStartTime}:00.000Z`;
    const endsAt = block.oneOffAt ?? `${localDate}T${localEndTime}:00.000Z`;

    return {
      id: `legacy-${block.id}`,
      programId: block.programId,
      programNodeId: block.programNodeId,
      sourceRuleId: null,
      sourceType: "manual",
      sourceKey: `legacy:${block.id}`,
      title: block.title,
      timezone: block.timezone ?? "UTC",
      localDate,
      localStartTime,
      localEndTime,
      startsAtUtc: startsAt,
      endsAtUtc: endsAt,
      status: "scheduled",
      metadataJson: {
        legacyBlockId: block.id,
        blockType: block.blockType
      },
      createdAt: block.createdAt,
      updatedAt: block.updatedAt
    } satisfies ProgramOccurrence;
  });

  return {
    source: "legacy" as const,
    occurrences: fallbackOccurrences
  };
}

export async function markProgramScheduleVersionV2(programId: string) {
  const supabase = await createSupabaseServer();
  const { data: existingRow, error: existingError } = await supabase
    .from("programs")
    .select("settings_json")
    .eq("id", programId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to load program settings: ${existingError.message}`);
  }

  const existingSettings = asObject(existingRow?.settings_json);
  const { error } = await supabase
    .from("programs")
    .update({
      settings_json: {
        ...existingSettings,
        schedule_version: 2
      }
    })
    .eq("id", programId);

  if (error) {
    throw new Error(`Failed to mark schedule version: ${error.message}`);
  }
}
