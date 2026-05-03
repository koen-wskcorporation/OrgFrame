import { createSupabaseServer } from "@/src/shared/data-api/server";
import type {
  Facility,
  FacilityPublicAvailabilitySnapshot,
  FacilityPublicReservation,
  FacilityPublicSpaceAvailability,
  FacilityReservation,
  FacilityReservationException,
  FacilityReservationRule,
  FacilitySpace
} from "@/src/features/facilities/types";
import type { GeneratedFacilityReservationInput } from "@/src/features/facilities/schedule/rule-engine";

// `status_labels_json` is referenced by app code but the migration that adds
// the column hasn't been applied yet — selecting it raises
// `column spaces.status_labels_json does not exist`. Until the migration
// lands, we omit the column and synthesize an empty object in `mapSpace`.
const spaceSelect =
  "id, org_id, facility_id, parent_space_id, name, slug, space_kind, status, is_bookable, timezone, capacity, metadata_json, sort_index, created_at, updated_at";
const facilitySelect =
  "id, org_id, name, slug, status, timezone, environment, geo_anchor_lat, geo_anchor_lng, geo_address, geo_show_map, metadata_json, sort_index, created_at, updated_at";
const ruleSelect =
  "id, org_id, space_id, mode, reservation_kind, default_status, public_label, internal_notes, timezone, start_date, end_date, start_time, end_time, interval_count, interval_unit, by_weekday, by_monthday, end_mode, until_date, max_occurrences, event_id, program_id, conflict_override, sort_index, is_active, config_json, rule_hash, created_by, created_at, updated_at";
const reservationSelect =
  "id, org_id, space_id, source_rule_id, source_key, reservation_kind, status, timezone, local_date, local_start_time, local_end_time, starts_at_utc, ends_at_utc, public_label, internal_notes, event_id, program_id, conflict_override, approved_by, approved_at, rejected_by, rejected_at, metadata_json, created_by, created_at, updated_at";
const exceptionSelect =
  "id, org_id, rule_id, source_key, kind, override_reservation_id, payload_json, created_by, created_at, updated_at";

type SpaceRow = {
  id: string;
  org_id: string;
  facility_id: string;
  parent_space_id: string | null;
  name: string;
  slug: string;
  space_kind: FacilitySpace["spaceKind"];
  status: FacilitySpace["status"];
  is_bookable: boolean;
  timezone: string;
  capacity: number | null;
  metadata_json: unknown;
  sort_index: number;
  created_at: string;
  updated_at: string;
};

type FacilityRow = {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  status: Facility["status"];
  timezone: string;
  environment: Facility["environment"];
  geo_anchor_lat: number | null;
  geo_anchor_lng: number | null;
  geo_address: string | null;
  geo_show_map: boolean;
  metadata_json: unknown;
  sort_index: number;
  created_at: string;
  updated_at: string;
};

type RuleRow = {
  id: string;
  org_id: string;
  space_id: string;
  mode: FacilityReservationRule["mode"];
  reservation_kind: FacilityReservationRule["reservationKind"];
  default_status: FacilityReservationRule["defaultStatus"];
  public_label: string | null;
  internal_notes: string | null;
  timezone: string;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  interval_count: number;
  interval_unit: FacilityReservationRule["intervalUnit"] | null;
  by_weekday: number[] | null;
  by_monthday: number[] | null;
  end_mode: FacilityReservationRule["endMode"];
  until_date: string | null;
  max_occurrences: number | null;
  event_id: string | null;
  program_id: string | null;
  conflict_override: boolean;
  sort_index: number;
  is_active: boolean;
  config_json: unknown;
  rule_hash: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ReservationRow = {
  id: string;
  org_id: string;
  space_id: string;
  source_rule_id: string | null;
  source_key: string;
  reservation_kind: FacilityReservation["reservationKind"];
  status: FacilityReservation["status"];
  timezone: string;
  local_date: string;
  local_start_time: string | null;
  local_end_time: string | null;
  starts_at_utc: string;
  ends_at_utc: string;
  public_label: string | null;
  internal_notes: string | null;
  event_id: string | null;
  program_id: string | null;
  conflict_override: boolean;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  metadata_json: unknown;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ExceptionRow = {
  id: string;
  org_id: string;
  rule_id: string;
  source_key: string;
  kind: FacilityReservationException["kind"];
  override_reservation_id: string | null;
  payload_json: unknown;
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

function mapSpace(row: SpaceRow): FacilitySpace {
  const metadata = asObject(row.metadata_json);
  // statusId / geo* live in metadata_json until their dedicated columns are
  // recovered. `statusId` falls back to the built-in matching the row's
  // existing `status` so the UI's status picker stays consistent.
  const metaStatusId = typeof metadata.statusId === "string" ? metadata.statusId : null;
  const statusId = metaStatusId ?? row.status;
  const geoLat = typeof metadata.geoAnchorLat === "number" ? metadata.geoAnchorLat : null;
  const geoLng = typeof metadata.geoAnchorLng === "number" ? metadata.geoAnchorLng : null;
  const geoAddress = typeof metadata.geoAddress === "string" ? metadata.geoAddress : null;
  const geoShowMap = metadata.geoShowMap === true;
  return {
    id: row.id,
    orgId: row.org_id,
    facilityId: row.facility_id,
    parentSpaceId: row.parent_space_id,
    name: row.name,
    slug: row.slug,
    spaceKind: row.space_kind,
    status: row.status,
    statusId,
    isBookable: row.is_bookable,
    timezone: row.timezone,
    capacity: row.capacity,
    metadataJson: metadata,
    // Column not yet in DB; default to empty so status.ts falls back to built-ins.
    statusLabelsJson: {},
    geoAnchorLat: geoLat,
    geoAnchorLng: geoLng,
    geoAddress,
    geoShowMap,
    sortIndex: Number.isFinite(row.sort_index) ? row.sort_index : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapFacility(row: FacilityRow): Facility {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    timezone: row.timezone,
    environment: row.environment,
    geoAnchorLat: row.geo_anchor_lat,
    geoAnchorLng: row.geo_anchor_lng,
    geoAddress: row.geo_address,
    geoShowMap: row.geo_show_map,
    metadataJson: asObject(row.metadata_json),
    sortIndex: Number.isFinite(row.sort_index) ? row.sort_index : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRule(row: RuleRow): FacilityReservationRule {
  return {
    id: row.id,
    orgId: row.org_id,
    spaceId: row.space_id,
    mode: row.mode,
    reservationKind: row.reservation_kind,
    defaultStatus: row.default_status,
    publicLabel: row.public_label,
    internalNotes: row.internal_notes,
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
    eventId: row.event_id,
    programId: row.program_id,
    conflictOverride: row.conflict_override,
    sortIndex: Number.isFinite(row.sort_index) ? row.sort_index : 0,
    isActive: row.is_active,
    configJson: asObject(row.config_json),
    ruleHash: row.rule_hash ?? "",
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapReservation(row: ReservationRow): FacilityReservation {
  return {
    id: row.id,
    orgId: row.org_id,
    spaceId: row.space_id,
    sourceRuleId: row.source_rule_id,
    sourceKey: row.source_key,
    reservationKind: row.reservation_kind,
    status: row.status,
    timezone: row.timezone,
    localDate: row.local_date,
    localStartTime: row.local_start_time,
    localEndTime: row.local_end_time,
    startsAtUtc: row.starts_at_utc,
    endsAtUtc: row.ends_at_utc,
    publicLabel: row.public_label,
    internalNotes: row.internal_notes,
    eventId: row.event_id,
    programId: row.program_id,
    conflictOverride: row.conflict_override,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    rejectedBy: row.rejected_by,
    rejectedAt: row.rejected_at,
    metadataJson: asObject(row.metadata_json),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapException(row: ExceptionRow): FacilityReservationException {
  return {
    id: row.id,
    orgId: row.org_id,
    ruleId: row.rule_id,
    sourceKey: row.source_key,
    kind: row.kind,
    overrideReservationId: row.override_reservation_id,
    payloadJson: asObject(row.payload_json),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listFacilitySpacesForManage(orgId: string, options?: { facilityId?: string }): Promise<FacilitySpace[]> {
  const supabase = await createSupabaseServer();
  let query = supabase
    .schema("facilities").from("spaces")
    .select(spaceSelect)
    .eq("org_id", orgId);
  if (options?.facilityId) {
    query = query.eq("facility_id", options.facilityId);
  }
  const { data, error } = await query
    .order("sort_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list facility spaces: ${error.message}`);
  }

  return (data ?? []).map((row) => mapSpace(row as SpaceRow));
}

export async function listFacilitiesForManage(orgId: string): Promise<Facility[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("facilities").from("facilities")
    .select(facilitySelect)
    .eq("org_id", orgId)
    .order("sort_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list facilities: ${error.message}`);
  }

  return (data ?? []).map((row) => mapFacility(row as FacilityRow));
}

export async function getFacilityById(orgId: string, facilityId: string): Promise<Facility | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("facilities").from("facilities")
    .select(facilitySelect)
    .eq("org_id", orgId)
    .eq("id", facilityId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load facility: ${error.message}`);
  }
  return data ? mapFacility(data as FacilityRow) : null;
}

export async function createFacilityRecord(input: {
  orgId: string;
  name: string;
  slug: string;
  status?: Facility["status"];
  timezone?: string;
  environment?: Facility["environment"];
  geoAnchorLat?: number | null;
  geoAnchorLng?: number | null;
  geoAddress?: string | null;
  geoShowMap?: boolean;
  metadataJson?: Record<string, unknown>;
  sortIndex?: number;
}): Promise<Facility> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("facilities").from("facilities")
    .insert({
      org_id: input.orgId,
      name: input.name,
      slug: input.slug,
      status: input.status ?? "active",
      timezone: input.timezone ?? "UTC",
      environment: input.environment ?? "outdoor",
      geo_anchor_lat: input.geoAnchorLat ?? null,
      geo_anchor_lng: input.geoAnchorLng ?? null,
      geo_address: input.geoAddress ?? null,
      geo_show_map: input.geoShowMap ?? false,
      metadata_json: input.metadataJson ?? {},
      sort_index: input.sortIndex ?? 0
    })
    .select(facilitySelect)
    .single();
  if (error) throw new Error(`Failed to create facility: ${error.message}`);
  return mapFacility(data as FacilityRow);
}

export async function updateFacilityRecord(input: {
  orgId: string;
  facilityId: string;
  name: string;
  slug: string;
  status: Facility["status"];
  timezone: string;
  environment: Facility["environment"];
  geoAnchorLat: number | null;
  geoAnchorLng: number | null;
  geoAddress: string | null;
  geoShowMap: boolean;
  metadataJson: Record<string, unknown>;
  sortIndex?: number;
}): Promise<Facility> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("facilities").from("facilities")
    .update({
      name: input.name,
      slug: input.slug,
      status: input.status,
      timezone: input.timezone,
      environment: input.environment,
      geo_anchor_lat: input.geoAnchorLat,
      geo_anchor_lng: input.geoAnchorLng,
      geo_address: input.geoAddress,
      geo_show_map: input.geoShowMap,
      metadata_json: input.metadataJson,
      ...(input.sortIndex !== undefined ? { sort_index: input.sortIndex } : {})
    })
    .eq("org_id", input.orgId)
    .eq("id", input.facilityId)
    .select(facilitySelect)
    .single();
  if (error) throw new Error(`Failed to update facility: ${error.message}`);
  return mapFacility(data as FacilityRow);
}

export async function deleteFacilityRecord(input: { orgId: string; facilityId: string }): Promise<void> {
  const supabase = await createSupabaseServer();
  // FK on `spaces.facility_id` cascades; deleting the facility removes its
  // spaces, and the FK on `facility_map_nodes.space_id` cascades from
  // there. One delete, full cleanup.
  const { error } = await supabase
    .schema("facilities").from("facilities")
    .delete()
    .eq("org_id", input.orgId)
    .eq("id", input.facilityId);
  if (error) throw new Error(`Failed to delete facility: ${error.message}`);
}

export async function getFacilitySpaceById(orgId: string, spaceId: string): Promise<FacilitySpace | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("facilities").from("spaces")
    .select(spaceSelect)
    .eq("org_id", orgId)
    .eq("id", spaceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load facility space: ${error.message}`);
  }

  return data ? mapSpace(data as SpaceRow) : null;
}

export async function createFacilitySpaceRecord(input: {
  orgId: string;
  facilityId: string;
  parentSpaceId: string | null;
  name: string;
  slug: string;
  spaceKind: FacilitySpace["spaceKind"];
  status: FacilitySpace["status"];
  isBookable: boolean;
  timezone: string;
  capacity: number | null;
  metadataJson?: Record<string, unknown>;
  statusLabelsJson?: Record<string, unknown>;
  sortIndex?: number;
}): Promise<FacilitySpace> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("facilities").from("spaces")
    .insert({
      org_id: input.orgId,
      facility_id: input.facilityId,
      parent_space_id: input.parentSpaceId,
      name: input.name,
      slug: input.slug,
      space_kind: input.spaceKind,
      status: input.status,
      is_bookable: input.isBookable,
      timezone: input.timezone,
      capacity: input.capacity,
      metadata_json: input.metadataJson ?? {},
      // status_labels_json column not yet in DB; skip until migration lands.
      sort_index: input.sortIndex ?? 0
    })
    .select(spaceSelect)
    .single();

  if (error) {
    throw new Error(`Failed to create facility space: ${error.message}`);
  }

  return mapSpace(data as SpaceRow);
}

export async function updateFacilitySpaceRecord(input: {
  orgId: string;
  spaceId: string;
  parentSpaceId: string | null;
  name: string;
  slug: string;
  spaceKind: FacilitySpace["spaceKind"];
  status: FacilitySpace["status"];
  isBookable: boolean;
  timezone: string;
  capacity: number | null;
  metadataJson?: Record<string, unknown>;
  statusLabelsJson?: Record<string, unknown>;
  sortIndex?: number;
}): Promise<FacilitySpace> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("facilities").from("spaces")
    .update({
      parent_space_id: input.parentSpaceId,
      name: input.name,
      slug: input.slug,
      space_kind: input.spaceKind,
      status: input.status,
      is_bookable: input.isBookable,
      timezone: input.timezone,
      capacity: input.capacity,
      metadata_json: input.metadataJson ?? {},
      // status_labels_json column not yet in DB; skip until migration lands.
      sort_index: input.sortIndex ?? 0
    })
    .eq("org_id", input.orgId)
    .eq("id", input.spaceId)
    .select(spaceSelect)
    .single();

  if (error) {
    throw new Error(`Failed to update facility space: ${error.message}`);
  }

  return mapSpace(data as SpaceRow);
}

export async function updateFacilitySpaceHierarchyRecord(input: {
  orgId: string;
  spaceId: string;
  parentSpaceId: string | null;
  sortIndex: number;
}): Promise<void> {
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .schema("facilities").from("spaces")
    .update({
      parent_space_id: input.parentSpaceId,
      sort_index: input.sortIndex
    })
    .eq("org_id", input.orgId)
    .eq("id", input.spaceId);

  if (error) {
    throw new Error(`Failed to update facility space hierarchy: ${error.message}`);
  }
}

export async function deleteFacilitySpaceRecord(input: { orgId: string; spaceId: string }): Promise<void> {
  const supabase = await createSupabaseServer();

  // Delete the corresponding map node first so we never leave a dangling
  // shape pointing at a non-existent space (the source of the canvas
  // bleed when there's no FK cascade between schemas).
  const { error: nodeError } = await supabase
    .schema("facilities")
    .from("facility_map_nodes")
    .delete()
    .eq("org_id", input.orgId)
    .eq("space_id", input.spaceId);
  if (nodeError) {
    // Non-fatal — proceed with the space delete; the read-time filter
    // will hide any leftover orphan, and the next load will clean it up.
    console.error("Failed to delete map node before deleting facility space", nodeError);
  }

  const { error } = await supabase.schema("facilities").from("spaces").delete().eq("org_id", input.orgId).eq("id", input.spaceId);

  if (error) {
    throw new Error(`Failed to delete facility space: ${error.message}`);
  }
}

export async function listFacilityReservationRules(orgId: string, options?: { spaceId?: string }): Promise<FacilityReservationRule[]> {
  const supabase = await createSupabaseServer();
  let query = supabase
    .schema("facilities").from("policies")
    .select(ruleSelect)
    .eq("org_id", orgId)
    .eq("policy_kind", "rule")
    .order("sort_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (options?.spaceId) {
    query = query.eq("space_id", options.spaceId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list facility reservation rules: ${error.message}`);
  }

  return (data ?? []).map((row) => mapRule(row as RuleRow));
}

export async function getFacilityReservationRuleById(orgId: string, ruleId: string): Promise<FacilityReservationRule | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("facilities").from("policies")
    .select(ruleSelect)
    .eq("org_id", orgId)
    .eq("policy_kind", "rule")
    .eq("id", ruleId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load facility reservation rule: ${error.message}`);
  }

  return data ? mapRule(data as RuleRow) : null;
}

export async function upsertFacilityReservationRule(input: {
  orgId: string;
  ruleId?: string;
  spaceId: string;
  mode: FacilityReservationRule["mode"];
  reservationKind: FacilityReservationRule["reservationKind"];
  defaultStatus: FacilityReservationRule["defaultStatus"];
  publicLabel: string | null;
  internalNotes: string | null;
  timezone: string;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  intervalCount: number;
  intervalUnit: FacilityReservationRule["intervalUnit"];
  byWeekday: number[] | null;
  byMonthday: number[] | null;
  endMode: FacilityReservationRule["endMode"];
  untilDate: string | null;
  maxOccurrences: number | null;
  eventId: string | null;
  programId: string | null;
  conflictOverride: boolean;
  sortIndex: number;
  isActive: boolean;
  configJson: Record<string, unknown>;
  ruleHash: string;
  createdBy: string;
}): Promise<FacilityReservationRule> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("facilities").from("policies")
    .upsert({
      id: input.ruleId,
      org_id: input.orgId,
      policy_kind: "rule",
      space_id: input.spaceId,
      mode: input.mode,
      reservation_kind: input.reservationKind,
      default_status: input.defaultStatus,
      public_label: input.publicLabel,
      internal_notes: input.internalNotes,
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
      event_id: input.eventId,
      program_id: input.programId,
      conflict_override: input.conflictOverride,
      sort_index: input.sortIndex,
      is_active: input.isActive,
      config_json: input.configJson,
      rule_hash: input.ruleHash,
      created_by: input.createdBy
    })
    .select(ruleSelect)
    .single();

  if (error) {
    throw new Error(`Failed to save facility reservation rule: ${error.message}`);
  }

  return mapRule(data as RuleRow);
}

export async function deleteFacilityReservationRule(orgId: string, ruleId: string): Promise<void> {
  const supabase = await createSupabaseServer();
  const { error } = await supabase.schema("facilities").from("policies").delete().eq("org_id", orgId).eq("policy_kind", "rule").eq("id", ruleId);
  if (error) {
    throw new Error(`Failed to delete facility reservation rule: ${error.message}`);
  }
}

export async function listFacilityReservations(
  orgId: string,
  options?: {
    spaceId?: string;
    includeInactive?: boolean;
    fromUtc?: string;
    toUtc?: string;
  }
): Promise<FacilityReservation[]> {
  const supabase = await createSupabaseServer();
  let query = supabase
    .schema("facilities").from("reservations")
    .select(reservationSelect)
    .eq("org_id", orgId)
    .order("starts_at_utc", { ascending: true })
    .order("created_at", { ascending: true });

  if (options?.spaceId) {
    query = query.eq("space_id", options.spaceId);
  }

  if (!options?.includeInactive) {
    query = query.in("status", ["pending", "approved"]);
  }

  if (options?.fromUtc) {
    query = query.gte("ends_at_utc", options.fromUtc);
  }

  if (options?.toUtc) {
    query = query.lte("starts_at_utc", options.toUtc);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list facility reservations: ${error.message}`);
  }

  return (data ?? []).map((row) => mapReservation(row as ReservationRow));
}

export async function getFacilityReservationById(orgId: string, reservationId: string): Promise<FacilityReservation | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("facilities").from("reservations")
    .select(reservationSelect)
    .eq("org_id", orgId)
    .eq("id", reservationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load facility reservation: ${error.message}`);
  }

  return data ? mapReservation(data as ReservationRow) : null;
}

export async function createFacilityReservationRecord(input: {
  orgId: string;
  spaceId: string;
  sourceRuleId: string | null;
  sourceKey: string;
  reservationKind: FacilityReservation["reservationKind"];
  status: FacilityReservation["status"];
  timezone: string;
  localDate: string;
  localStartTime: string | null;
  localEndTime: string | null;
  startsAtUtc: string;
  endsAtUtc: string;
  publicLabel: string | null;
  internalNotes: string | null;
  eventId: string | null;
  programId: string | null;
  conflictOverride: boolean;
  metadataJson?: Record<string, unknown>;
  createdBy: string;
}): Promise<FacilityReservation> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("facilities").from("reservations")
    .insert({
      org_id: input.orgId,
      space_id: input.spaceId,
      source_rule_id: input.sourceRuleId,
      source_key: input.sourceKey,
      reservation_kind: input.reservationKind,
      status: input.status,
      timezone: input.timezone,
      local_date: input.localDate,
      local_start_time: input.localStartTime,
      local_end_time: input.localEndTime,
      starts_at_utc: input.startsAtUtc,
      ends_at_utc: input.endsAtUtc,
      public_label: input.publicLabel,
      internal_notes: input.internalNotes,
      event_id: input.eventId,
      program_id: input.programId,
      conflict_override: input.conflictOverride,
      metadata_json: input.metadataJson ?? {},
      created_by: input.createdBy
    })
    .select(reservationSelect)
    .single();

  if (error) {
    throw new Error(`Failed to create facility reservation: ${error.message}`);
  }

  return mapReservation(data as ReservationRow);
}

export async function updateFacilityReservationRecord(input: {
  orgId: string;
  reservationId: string;
  spaceId: string;
  reservationKind: FacilityReservation["reservationKind"];
  status: FacilityReservation["status"];
  timezone: string;
  localDate: string;
  localStartTime: string | null;
  localEndTime: string | null;
  startsAtUtc: string;
  endsAtUtc: string;
  publicLabel: string | null;
  internalNotes: string | null;
  eventId: string | null;
  programId: string | null;
  conflictOverride: boolean;
  metadataJson?: Record<string, unknown>;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
}): Promise<FacilityReservation> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("facilities").from("reservations")
    .update({
      space_id: input.spaceId,
      reservation_kind: input.reservationKind,
      status: input.status,
      timezone: input.timezone,
      local_date: input.localDate,
      local_start_time: input.localStartTime,
      local_end_time: input.localEndTime,
      starts_at_utc: input.startsAtUtc,
      ends_at_utc: input.endsAtUtc,
      public_label: input.publicLabel,
      internal_notes: input.internalNotes,
      event_id: input.eventId,
      program_id: input.programId,
      conflict_override: input.conflictOverride,
      metadata_json: input.metadataJson ?? {},
      approved_by: input.approvedBy ?? null,
      approved_at: input.approvedAt ?? null,
      rejected_by: input.rejectedBy ?? null,
      rejected_at: input.rejectedAt ?? null
    })
    .eq("org_id", input.orgId)
    .eq("id", input.reservationId)
    .select(reservationSelect)
    .single();

  if (error) {
    throw new Error(`Failed to update facility reservation: ${error.message}`);
  }

  return mapReservation(data as ReservationRow);
}

export async function setFacilityReservationStatus(input: {
  orgId: string;
  reservationId: string;
  status: FacilityReservation["status"];
  actorUserId: string;
}): Promise<FacilityReservation> {
  const supabase = await createSupabaseServer();
  const patch: Record<string, unknown> = {
    status: input.status
  };

  if (input.status === "approved") {
    patch.approved_by = input.actorUserId;
    patch.approved_at = new Date().toISOString();
    patch.rejected_by = null;
    patch.rejected_at = null;
  } else if (input.status === "rejected") {
    patch.rejected_by = input.actorUserId;
    patch.rejected_at = new Date().toISOString();
    patch.approved_by = null;
    patch.approved_at = null;
  } else {
    patch.approved_by = null;
    patch.approved_at = null;
    patch.rejected_by = null;
    patch.rejected_at = null;
  }

  const { data, error } = await supabase
    .schema("facilities").from("reservations")
    .update(patch)
    .eq("org_id", input.orgId)
    .eq("id", input.reservationId)
    .select(reservationSelect)
    .single();

  if (error) {
    throw new Error(`Failed to update facility reservation status: ${error.message}`);
  }

  return mapReservation(data as ReservationRow);
}

export async function listFacilityReservationExceptions(
  orgId: string,
  options?: { ruleId?: string }
): Promise<FacilityReservationException[]> {
  const supabase = await createSupabaseServer();
  let query = supabase
    .schema("facilities").from("policies")
    .select(exceptionSelect)
    .eq("org_id", orgId)
    .eq("policy_kind", "exception")
    .order("created_at", { ascending: true });

  if (options?.ruleId) {
    query = query.eq("rule_id", options.ruleId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list facility reservation exceptions: ${error.message}`);
  }

  return (data ?? []).map((row) => mapException(row as ExceptionRow));
}

export async function upsertFacilityReservationException(input: {
  orgId: string;
  ruleId: string;
  sourceKey: string;
  kind: FacilityReservationException["kind"];
  overrideReservationId: string | null;
  payloadJson?: Record<string, unknown>;
  createdBy: string;
}): Promise<FacilityReservationException> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("facilities").from("policies")
    .upsert({
      org_id: input.orgId,
      policy_kind: "exception",
      rule_id: input.ruleId,
      source_key: input.sourceKey,
      kind: input.kind,
      override_reservation_id: input.overrideReservationId,
      payload_json: input.payloadJson ?? {},
      created_by: input.createdBy
    })
    .select(exceptionSelect)
    .single();

  if (error) {
    throw new Error(`Failed to upsert facility reservation exception: ${error.message}`);
  }

  return mapException(data as ExceptionRow);
}

export async function deleteFacilityReservationException(input: { orgId: string; ruleId: string; sourceKey: string; kind?: FacilityReservationException["kind"] }) {
  const supabase = await createSupabaseServer();
  let query = supabase
    .schema("facilities").from("policies")
    .delete()
    .eq("org_id", input.orgId)
    .eq("policy_kind", "exception")
    .eq("rule_id", input.ruleId)
    .eq("source_key", input.sourceKey);
  if (input.kind) {
    query = query.eq("kind", input.kind);
  }

  const { error } = await query;
  if (error) {
    throw new Error(`Failed to delete facility reservation exception: ${error.message}`);
  }
}

export async function upsertRuleGeneratedReservations(
  orgId: string,
  ruleId: string,
  reservations: GeneratedFacilityReservationInput[]
) {
  const supabase = await createSupabaseServer();
  const sourceKeys = new Set(reservations.map((item) => item.sourceKey));

  if (reservations.length > 0) {
    const { error: upsertError } = await supabase.schema("facilities").from("reservations").upsert(
      reservations.map((reservation) => ({
        org_id: orgId,
        space_id: reservation.spaceId,
        source_rule_id: reservation.sourceRuleId,
        source_key: reservation.sourceKey,
        reservation_kind: reservation.reservationKind,
        status: reservation.status,
        timezone: reservation.timezone,
        local_date: reservation.localDate,
        local_start_time: reservation.localStartTime,
        local_end_time: reservation.localEndTime,
        starts_at_utc: reservation.startsAtUtc,
        ends_at_utc: reservation.endsAtUtc,
        public_label: reservation.publicLabel,
        internal_notes: reservation.internalNotes,
        event_id: reservation.eventId,
        program_id: reservation.programId,
        conflict_override: reservation.conflictOverride,
        metadata_json: reservation.metadataJson
      })),
      {
        onConflict: "org_id,source_key"
      }
    );

    if (upsertError) {
      throw new Error(`Failed to upsert generated facility reservations: ${upsertError.message}`);
    }
  }

  const { data: existingRows, error: existingError } = await supabase
    .schema("facilities").from("reservations")
    .select("id, source_key")
    .eq("org_id", orgId)
    .eq("source_rule_id", ruleId);

  if (existingError) {
    throw new Error(`Failed to read generated facility reservations: ${existingError.message}`);
  }

  const staleIds = (existingRows ?? [])
    .filter((row) => typeof row.source_key === "string" && !sourceKeys.has(row.source_key))
    .map((row) => row.id)
    .filter((value): value is string => typeof value === "string");

  if (staleIds.length > 0) {
    const { error: staleError } = await supabase.schema("facilities").from("reservations").update({ status: "cancelled" }).in("id", staleIds);
    if (staleError) {
      throw new Error(`Failed to cancel stale generated facility reservations: ${staleError.message}`);
    }
  }
}

// Built-in space-status definitions used until the org-customizable
// `facility_space_statuses` migration is recovered. Keep these stable —
// `id === FacilitySpaceStatus`, with `behavesAs` set so anything that
// gates on "open" / "closed" / "archived" still works.
export const BUILT_IN_FACILITY_SPACE_STATUSES = [
  { id: "open", label: "Open", color: "green", isSystem: true, behavesAs: "open" as const },
  { id: "closed", label: "Closed", color: "gray", isSystem: true, behavesAs: "closed" as const },
  { id: "archived", label: "Archived", color: "neutral", isSystem: true, behavesAs: "archived" as const }
];

export async function listFacilitySpaceStatuses(_orgId: string) {
  return BUILT_IN_FACILITY_SPACE_STATUSES;
}

export async function listFacilityReservationReadModel(orgId: string) {
  const [facilities, spaces, spaceStatuses, rules, reservations, exceptions] = await Promise.all([
    listFacilitiesForManage(orgId),
    listFacilitySpacesForManage(orgId),
    listFacilitySpaceStatuses(orgId),
    listFacilityReservationRules(orgId),
    listFacilityReservations(orgId, { includeInactive: true }),
    listFacilityReservationExceptions(orgId)
  ]);

  return {
    facilities,
    spaces,
    spaceStatuses,
    rules,
    reservations,
    exceptions
  };
}

function overlapsNow(reservation: FacilityPublicReservation, now: Date) {
  const startsAt = new Date(reservation.startsAtUtc);
  const endsAt = new Date(reservation.endsAtUtc);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return false;
  }
  return startsAt.getTime() <= now.getTime() && now.getTime() < endsAt.getTime();
}

function getCurrentStatusForSpace(space: FacilitySpace, reservations: FacilityPublicReservation[], now: Date): FacilityPublicSpaceAvailability["currentStatus"] {
  if (space.status !== "open" || !space.isBookable) {
    return "closed";
  }

  const hasActiveReservation = reservations.some((reservation) => reservation.spaceId === space.id && overlapsNow(reservation, now));
  return hasActiveReservation ? "booked" : "open";
}

function getNextAvailableAtUtcForSpace(space: FacilitySpace, reservations: FacilityPublicReservation[], now: Date) {
  if (space.status !== "open" || !space.isBookable) {
    return null;
  }

  const future = reservations
    .filter((reservation) => reservation.spaceId === space.id)
    .map((reservation) => ({
      startsAt: new Date(reservation.startsAtUtc),
      endsAt: new Date(reservation.endsAtUtc)
    }))
    .filter((item) => !Number.isNaN(item.startsAt.getTime()) && !Number.isNaN(item.endsAt.getTime()))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  if (future.length === 0) {
    return now.toISOString();
  }

  let cursor = new Date(now.getTime());
  for (const window of future) {
    if (window.endsAt.getTime() <= cursor.getTime()) {
      continue;
    }

    if (window.startsAt.getTime() > cursor.getTime()) {
      return cursor.toISOString();
    }

    cursor = new Date(window.endsAt.getTime());
  }

  return cursor.toISOString();
}

export async function listFacilityPublicAvailabilitySnapshot(
  orgId: string,
  options?: {
    fromUtc?: string;
    toUtc?: string;
  }
): Promise<FacilityPublicAvailabilitySnapshot> {
  const now = new Date();
  const fromUtc = options?.fromUtc ?? new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const toUtc = options?.toUtc ?? new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000).toISOString();
  const [spaces, reservations] = await Promise.all([
    listFacilitySpacesForManage(orgId).then((items) => items.filter((item) => item.status !== "archived")),
    listFacilityReservations(orgId, {
      includeInactive: false,
      fromUtc,
      toUtc
    })
  ]);

  const publicReservations: FacilityPublicReservation[] = reservations
    .filter(
      (reservation): reservation is FacilityReservation & { status: FacilityPublicReservation["status"] } =>
        reservation.status === "pending" || reservation.status === "approved"
    )
    .map((reservation) => ({
      id: reservation.id,
      spaceId: reservation.spaceId,
      reservationKind: reservation.reservationKind,
      status: reservation.status,
      publicLabel: reservation.publicLabel,
      startsAtUtc: reservation.startsAtUtc,
      endsAtUtc: reservation.endsAtUtc,
      timezone: reservation.timezone
    }));

  const publicSpaces: FacilityPublicSpaceAvailability[] = spaces.map((space) => ({
    id: space.id,
    parentSpaceId: space.parentSpaceId,
    name: space.name,
    slug: space.slug,
    spaceKind: space.spaceKind,
    status: space.status,
    isBookable: space.isBookable,
    timezone: space.timezone,
    currentStatus: getCurrentStatusForSpace(space, publicReservations, now),
    nextAvailableAtUtc: getNextAvailableAtUtcForSpace(space, publicReservations, now)
  }));

  return {
    generatedAtUtc: now.toISOString(),
    spaces: publicSpaces,
    reservations: publicReservations
  };
}
