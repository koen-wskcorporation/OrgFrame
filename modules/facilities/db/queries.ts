import { createSupabaseServer } from "@/lib/supabase/server";
import type {
  Facility,
  FacilityBookingMapSnapshot,
  FacilityMapReadModel,
  FacilityNode,
  FacilityPublicAvailabilitySnapshot,
  FacilityPublicReservation,
  FacilityPublicSpaceAvailability
} from "@/modules/facilities/types";
import { normalizeFacilityNodeLayout, collectNodeAncestorIds, collectNodeDescendantIds } from "@/modules/facilities/utils";

const facilitySelect = "id, org_id, name, slug, facility_type, status, timezone, metadata_json, sort_index, created_at, updated_at";
const nodeSelect =
  "id, org_id, facility_id, parent_node_id, name, slug, node_kind, status, is_bookable, capacity, layout_json, metadata_json, sort_index, created_at, updated_at";

type FacilityRow = {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  facility_type: Facility["facilityType"];
  status: Facility["status"];
  timezone: string;
  metadata_json: unknown;
  sort_index: number;
  created_at: string;
  updated_at: string;
};

type FacilityNodeRow = {
  id: string;
  org_id: string;
  facility_id: string;
  parent_node_id: string | null;
  name: string;
  slug: string;
  node_kind: FacilityNode["nodeKind"];
  status: FacilityNode["status"];
  is_bookable: boolean;
  capacity: number | null;
  layout_json: unknown;
  metadata_json: unknown;
  sort_index: number;
  created_at: string;
  updated_at: string;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function mapFacility(row: FacilityRow): Facility {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    slug: row.slug,
    facilityType: row.facility_type,
    status: row.status,
    timezone: row.timezone,
    metadataJson: asObject(row.metadata_json),
    sortIndex: Number.isFinite(row.sort_index) ? row.sort_index : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapNode(row: FacilityNodeRow): FacilityNode {
  return {
    id: row.id,
    orgId: row.org_id,
    facilityId: row.facility_id,
    parentNodeId: row.parent_node_id,
    name: row.name,
    slug: row.slug,
    nodeKind: row.node_kind,
    status: row.status,
    isBookable: row.is_bookable,
    capacity: row.capacity,
    layout: normalizeFacilityNodeLayout(row.layout_json),
    metadataJson: asObject(row.metadata_json),
    sortIndex: Number.isFinite(row.sort_index) ? row.sort_index : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listFacilitiesForManage(orgId: string): Promise<Facility[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("facilities")
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
    .from("facilities")
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
  facilityType: Facility["facilityType"];
  status: Facility["status"];
  timezone: string;
  metadataJson?: Record<string, unknown>;
  sortIndex?: number;
}): Promise<Facility> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("facilities")
    .insert({
      org_id: input.orgId,
      name: input.name,
      slug: input.slug,
      facility_type: input.facilityType,
      status: input.status,
      timezone: input.timezone,
      metadata_json: input.metadataJson ?? {},
      sort_index: input.sortIndex ?? 0
    })
    .select(facilitySelect)
    .single();

  if (error) {
    throw new Error(`Failed to create facility: ${error.message}`);
  }

  return mapFacility(data as FacilityRow);
}

export async function updateFacilityRecord(input: {
  orgId: string;
  facilityId: string;
  name: string;
  slug: string;
  facilityType: Facility["facilityType"];
  status: Facility["status"];
  timezone: string;
  metadataJson?: Record<string, unknown>;
  sortIndex?: number;
}): Promise<Facility> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("facilities")
    .update({
      name: input.name,
      slug: input.slug,
      facility_type: input.facilityType,
      status: input.status,
      timezone: input.timezone,
      metadata_json: input.metadataJson ?? {},
      sort_index: input.sortIndex ?? 0
    })
    .eq("org_id", input.orgId)
    .eq("id", input.facilityId)
    .select(facilitySelect)
    .single();

  if (error) {
    throw new Error(`Failed to update facility: ${error.message}`);
  }

  return mapFacility(data as FacilityRow);
}

export async function deleteFacilityRecord(input: { orgId: string; facilityId: string }): Promise<void> {
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("facilities").delete().eq("org_id", input.orgId).eq("id", input.facilityId);
  if (error) {
    throw new Error(`Failed to delete facility: ${error.message}`);
  }
}

export async function listFacilityNodes(
  orgId: string,
  options?: {
    facilityId?: string;
    includeArchived?: boolean;
  }
): Promise<FacilityNode[]> {
  const supabase = await createSupabaseServer();
  let query = supabase
    .from("facility_nodes")
    .select(nodeSelect)
    .eq("org_id", orgId)
    .order("sort_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (options?.facilityId) {
    query = query.eq("facility_id", options.facilityId);
  }

  if (!options?.includeArchived) {
    query = query.neq("status", "archived");
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list facility nodes: ${error.message}`);
  }

  return (data ?? []).map((row) => mapNode(row as FacilityNodeRow));
}

export async function getFacilityNodeById(orgId: string, nodeId: string): Promise<FacilityNode | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("facility_nodes")
    .select(nodeSelect)
    .eq("org_id", orgId)
    .eq("id", nodeId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load facility node: ${error.message}`);
  }

  return data ? mapNode(data as FacilityNodeRow) : null;
}

export async function createFacilityNodeRecord(input: {
  orgId: string;
  facilityId: string;
  parentNodeId: string | null;
  name: string;
  slug: string;
  nodeKind: FacilityNode["nodeKind"];
  status: FacilityNode["status"];
  isBookable: boolean;
  capacity: number | null;
  layoutJson?: Record<string, unknown>;
  metadataJson?: Record<string, unknown>;
  sortIndex?: number;
}): Promise<FacilityNode> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("facility_nodes")
    .insert({
      org_id: input.orgId,
      facility_id: input.facilityId,
      parent_node_id: input.parentNodeId,
      name: input.name,
      slug: input.slug,
      node_kind: input.nodeKind,
      status: input.status,
      is_bookable: input.isBookable,
      capacity: input.capacity,
      layout_json: input.layoutJson ?? {},
      metadata_json: input.metadataJson ?? {},
      sort_index: input.sortIndex ?? 0
    })
    .select(nodeSelect)
    .single();

  if (error) {
    throw new Error(`Failed to create facility node: ${error.message}`);
  }

  return mapNode(data as FacilityNodeRow);
}

export async function updateFacilityNodeRecord(input: {
  orgId: string;
  nodeId: string;
  parentNodeId: string | null;
  name: string;
  slug: string;
  nodeKind: FacilityNode["nodeKind"];
  status: FacilityNode["status"];
  isBookable: boolean;
  capacity: number | null;
  layoutJson?: Record<string, unknown>;
  metadataJson?: Record<string, unknown>;
  sortIndex?: number;
}): Promise<FacilityNode> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("facility_nodes")
    .update({
      parent_node_id: input.parentNodeId,
      name: input.name,
      slug: input.slug,
      node_kind: input.nodeKind,
      status: input.status,
      is_bookable: input.isBookable,
      capacity: input.capacity,
      layout_json: input.layoutJson ?? {},
      metadata_json: input.metadataJson ?? {},
      sort_index: input.sortIndex ?? 0
    })
    .eq("org_id", input.orgId)
    .eq("id", input.nodeId)
    .select(nodeSelect)
    .single();

  if (error) {
    throw new Error(`Failed to update facility node: ${error.message}`);
  }

  return mapNode(data as FacilityNodeRow);
}

export async function deleteFacilityNodeRecord(input: { orgId: string; nodeId: string }): Promise<void> {
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("facility_nodes").delete().eq("org_id", input.orgId).eq("id", input.nodeId);
  if (error) {
    throw new Error(`Failed to delete facility node: ${error.message}`);
  }
}

export async function listFacilityMapReadModel(orgId: string): Promise<FacilityMapReadModel> {
  const [facilities, nodes] = await Promise.all([listFacilitiesForManage(orgId), listFacilityNodes(orgId, { includeArchived: true })]);
  return { facilities, nodes };
}

export async function getFacilityMapReadModel(orgId: string, facilityId: string): Promise<FacilityMapReadModel> {
  const [facility, nodes] = await Promise.all([getFacilityById(orgId, facilityId), listFacilityNodes(orgId, { facilityId, includeArchived: true })]);
  return {
    facilities: facility ? [facility] : [],
    nodes
  };
}

export async function listOccurrenceAllocatedNodeIds(orgId: string, occurrenceId: string): Promise<string[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("calendar_occurrence_facility_allocations")
    .select("node_id")
    .eq("org_id", orgId)
    .eq("occurrence_id", occurrenceId)
    .eq("is_active", true);

  if (error) {
    throw new Error(`Failed to list occurrence facility allocations: ${error.message}`);
  }

  return (data ?? [])
    .map((row) => (typeof (row as { node_id?: unknown }).node_id === "string" ? ((row as { node_id: string }).node_id) : null))
    .filter((value): value is string => Boolean(value));
}

export async function listOverlappingAllocationNodeIds(input: {
  orgId: string;
  startsAtUtc: string;
  endsAtUtc: string;
  excludeOccurrenceId?: string;
}): Promise<string[]> {
  const supabase = await createSupabaseServer();
  let query = supabase
    .from("calendar_occurrence_facility_allocations")
    .select("node_id")
    .eq("org_id", input.orgId)
    .eq("is_active", true)
    .lt("starts_at_utc", input.endsAtUtc)
    .gt("ends_at_utc", input.startsAtUtc);

  if (input.excludeOccurrenceId) {
    query = query.neq("occurrence_id", input.excludeOccurrenceId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to list overlapping allocation nodes: ${error.message}`);
  }

  return (data ?? [])
    .map((row) => (typeof (row as { node_id?: unknown }).node_id === "string" ? ((row as { node_id: string }).node_id) : null))
    .filter((value): value is string => Boolean(value));
}

export async function getFacilityBookingMapSnapshotForOccurrence(orgId: string, occurrenceId: string): Promise<FacilityBookingMapSnapshot | null> {
  const supabase = await createSupabaseServer();
  const { data: occurrenceRow, error: occurrenceError } = await supabase
    .from("calendar_occurrences")
    .select("id, starts_at_utc, ends_at_utc")
    .eq("org_id", orgId)
    .eq("id", occurrenceId)
    .maybeSingle();

  if (occurrenceError) {
    throw new Error(`Failed to load occurrence for facility map: ${occurrenceError.message}`);
  }

  if (!occurrenceRow) {
    return null;
  }

  const startsAtUtc = (occurrenceRow as { starts_at_utc: string }).starts_at_utc;
  const endsAtUtc = (occurrenceRow as { ends_at_utc: string }).ends_at_utc;

  const [mapReadModel, selectedNodeIds, overlappingNodeIds] = await Promise.all([
    listFacilityMapReadModel(orgId),
    listOccurrenceAllocatedNodeIds(orgId, occurrenceId),
    listOverlappingAllocationNodeIds({ orgId, startsAtUtc, endsAtUtc, excludeOccurrenceId: occurrenceId })
  ]);

  const unavailableSet = new Set<string>();
  for (const nodeId of overlappingNodeIds) {
    unavailableSet.add(nodeId);
    const ancestors = collectNodeAncestorIds(mapReadModel.nodes, nodeId);
    for (const ancestorId of ancestors) {
      unavailableSet.add(ancestorId);
    }
    const descendants = collectNodeDescendantIds(mapReadModel.nodes, nodeId);
    for (const descendantId of descendants) {
      unavailableSet.add(descendantId);
    }
  }

  for (const selectedId of selectedNodeIds) {
    unavailableSet.delete(selectedId);
  }

  return {
    occurrenceId,
    startsAtUtc,
    endsAtUtc,
    facilities: mapReadModel.facilities,
    nodes: mapReadModel.nodes,
    selectedNodeIds,
    unavailableNodeIds: Array.from(unavailableSet)
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

function getCurrentStatusForNode(node: FacilityNode, reservations: FacilityPublicReservation[], now: Date): FacilityPublicSpaceAvailability["currentStatus"] {
  if (node.status !== "open" || !node.isBookable) {
    return "closed";
  }
  const hasActiveReservation = reservations.some((reservation) => reservation.spaceId === node.id && overlapsNow(reservation, now));
  return hasActiveReservation ? "booked" : "open";
}

function getNextAvailableAtUtcForNode(node: FacilityNode, reservations: FacilityPublicReservation[], now: Date) {
  if (node.status !== "open" || !node.isBookable) {
    return null;
  }

  const future = reservations
    .filter((reservation) => reservation.spaceId === node.id)
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

  const [nodes, allocationRowsResult] = await Promise.all([
    listFacilityNodes(orgId).then((items) => items.filter((item) => item.status !== "archived")),
    (async () => {
      const supabase = await createSupabaseServer();
      return supabase
        .from("calendar_occurrence_facility_allocations")
        .select("id, occurrence_id, node_id, starts_at_utc, ends_at_utc")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .gte("ends_at_utc", fromUtc)
        .lte("starts_at_utc", toUtc)
        .order("starts_at_utc", { ascending: true });
    })()
  ]);

  if (allocationRowsResult.error) {
    throw new Error(`Failed to list node allocations: ${allocationRowsResult.error.message}`);
  }

  const allocationRows = (allocationRowsResult.data ?? []) as Array<{
    id: string;
    occurrence_id: string;
    node_id: string;
    starts_at_utc: string;
    ends_at_utc: string;
  }>;

  const occurrenceIds = Array.from(new Set(allocationRows.map((row) => row.occurrence_id)));
  const occurrenceById = new Map<string, { status: string; timezone: string }>();

  if (occurrenceIds.length > 0) {
    const supabase = await createSupabaseServer();
    const { data: occurrenceRows, error: occurrenceError } = await supabase
      .from("calendar_occurrences")
      .select("id, status, timezone")
      .eq("org_id", orgId)
      .in("id", occurrenceIds);

    if (occurrenceError) {
      throw new Error(`Failed to list allocated occurrences: ${occurrenceError.message}`);
    }

    for (const row of occurrenceRows ?? []) {
      const id = (row as { id?: unknown }).id;
      if (typeof id !== "string") {
        continue;
      }
      occurrenceById.set(id, {
        status: typeof (row as { status?: unknown }).status === "string" ? ((row as { status: string }).status) : "scheduled",
        timezone: typeof (row as { timezone?: unknown }).timezone === "string" ? ((row as { timezone: string }).timezone) : "UTC"
      });
    }
  }

  const publicReservations: FacilityPublicReservation[] = allocationRows
    .filter((row) => occurrenceById.get(row.occurrence_id)?.status === "scheduled")
    .map((row) => ({
      id: row.id,
      spaceId: row.node_id,
      reservationKind: "booking",
      status: "approved",
      publicLabel: null,
      startsAtUtc: row.starts_at_utc,
      endsAtUtc: row.ends_at_utc,
      timezone: occurrenceById.get(row.occurrence_id)?.timezone ?? "UTC"
    }));

  const spaces: FacilityPublicSpaceAvailability[] = nodes.map((node) => ({
    id: node.id,
    parentSpaceId: node.parentNodeId,
    name: node.name,
    slug: node.slug,
    spaceKind: node.nodeKind,
    spaceTypeKey: node.nodeKind,
    status: node.status,
    isBookable: node.isBookable,
    timezone: "UTC",
    currentStatus: getCurrentStatusForNode(node, publicReservations, now),
    nextAvailableAtUtc: getNextAvailableAtUtcForNode(node, publicReservations, now)
  }));

  return {
    generatedAtUtc: now.toISOString(),
    spaces,
    reservations: publicReservations
  };
}
