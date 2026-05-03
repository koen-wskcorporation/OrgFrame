import { createSupabaseServer } from "@/src/shared/data-api/server";
import { CANVAS_CORNER_RADIUS, CANVAS_GRID_SIZE, CANVAS_MIN_NODE_SIZE, CANVAS_PADDING } from "@/src/features/canvas/core/constants";
import { normalizeLayout } from "@/src/features/canvas/core/layout";
import { boundsFromPoints, normalizeNodeGeometry, rectPoints } from "@/src/features/canvas/core/geometry";
import type { CanvasNode, CanvasPoint } from "@/src/features/canvas/core/types";
import type { FacilitySpace } from "@/src/features/facilities/types";
import type { FacilityMapNode } from "@/src/features/facilities/map/types";

type FacilityMapNodeRow = {
  id: string;
  org_id: string;
  space_id: string;
  parent_space_id: string | null;
  shape_type: "rectangle" | "polygon";
  points_json: unknown;
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
  corner_radius: number;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
};

const selectColumns =
  "id, org_id, space_id, parent_space_id, shape_type, points_json, x, y, width, height, z_index, corner_radius, status, created_at, updated_at";

function asPoints(input: unknown): CanvasPoint[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((point) => {
      if (!point || typeof point !== "object") {
        return null;
      }

      const x = Number((point as { x?: unknown }).x);
      const y = Number((point as { y?: unknown }).y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
      }

      return { x, y };
    })
    .filter((point): point is CanvasPoint => Boolean(point));
}

function mapRowToNode(row: FacilityMapNodeRow, label: string): FacilityMapNode {
  // Use the saved points verbatim. `normalizeNodeGeometry` snaps every
  // polygon vertex to the 24px grid, which corrupts the precise vertex
  // placement the user achieved on the satellite layer. Worse, its
  // `shapeType === "rectangle"` branch overwrites `points` with
  // `rectPoints(bounds)` — meaning any custom polygon stored under a row
  // whose `shape_type` is still "rectangle" (the seeded default) renders
  // as a plain bbox rectangle. We trust the persisted points and rebuild
  // bounds from them.
  const points = asPoints(row.points_json);
  const dbBounds = {
    x: Number(row.x),
    y: Number(row.y),
    width: Number(row.width),
    height: Number(row.height)
  };
  const bounds = points.length >= 3 ? boundsFromPoints(points) : dbBounds;

  return {
    id: row.id,
    entityId: row.space_id,
    parentEntityId: row.parent_space_id,
    label,
    // Treat every loaded node as a polygon for editing purposes; the
    // editor only knows polygons, and a 4-point rectangle is just a
    // polygon that happens to have right angles.
    shapeType: "polygon",
    points,
    bounds,
    zIndex: Number(row.z_index),
    cornerRadius: CANVAS_CORNER_RADIUS,
    status: row.status,
    spaceId: row.space_id,
    orgId: row.org_id,
    parentSpaceId: row.parent_space_id
  };
}

function buildSeedNode(space: FacilitySpace, index: number): CanvasNode {
  const col = index % 6;
  const row = Math.floor(index / 6);
  const x = CANVAS_PADDING + col * (CANVAS_MIN_NODE_SIZE * 3);
  const y = CANVAS_PADDING + row * (CANVAS_MIN_NODE_SIZE * 2);

  return {
    id: `seed-${space.id}`,
    entityId: space.id,
    parentEntityId: space.parentSpaceId,
    label: space.name,
    shapeType: "rectangle",
    bounds: {
      x,
      y,
      width: CANVAS_MIN_NODE_SIZE * 3,
      height: CANVAS_MIN_NODE_SIZE * 2
    },
    points: rectPoints({ x, y, width: CANVAS_MIN_NODE_SIZE * 3, height: CANVAS_MIN_NODE_SIZE * 2 }),
    zIndex: index + 1,
    cornerRadius: CANVAS_CORNER_RADIUS,
    status: space.status === "archived" ? "archived" : "active"
  };
}

export async function listFacilityMapNodes(orgId: string, spaces: FacilitySpace[]): Promise<FacilityMapNode[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.schema("facilities").from("facility_map_nodes").select(selectColumns).eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to list facility map nodes: ${error.message}`);
  }

  const spaceById = new Map(spaces.map((space) => [space.id, space]));
  const rows = (data ?? []) as FacilityMapNodeRow[];

  // Drop orphan nodes (space row was hard-deleted, FK cascade should have
  // taken the node too but defensive belt-and-suspenders) and archived
  // spaces (they stay in the DB so they can be un-archived later).
  // Note: a `parentSpaceId === null` check used to live here back when
  // top-level rows in the spaces table WERE the facilities themselves —
  // that's the lost-session bug we just removed via 202605030001 — but
  // now `parent_space_id IS NULL` simply means "direct child of the
  // facility", which is the most common case and SHOULD render.
  return rows
    .filter((row) => {
      const space = spaceById.get(row.space_id);
      if (!space) return false;
      if (space.status === "archived") return false;
      return true;
    })
    .map((row) => mapRowToNode(row, spaceById.get(row.space_id)?.name ?? row.space_id));
}

export async function seedFacilityMapNodesForMissingSpaces(orgId: string, spaces: FacilitySpace[]): Promise<void> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.schema("facilities").from("facility_map_nodes").select("space_id").eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to load existing facility map nodes: ${error.message}`);
  }

  const existing = new Set((data ?? []).map((row) => String((row as { space_id: string }).space_id)));
  // Every space in `facilities.spaces` is a real shape on a facility's
  // canvas now (top-level facilities live in `facilities.facilities`,
  // not here). Seed any space that doesn't yet have a map-node row.
  const missing = spaces.filter((space) => !existing.has(space.id));
  if (missing.length === 0) {
    return;
  }

  const seeded = normalizeLayout(missing.map((space, index) => buildSeedNode(space, index)));

  const { error: insertError } = await supabase.schema("facilities").from("facility_map_nodes").insert(
    seeded.map((node) => ({
      org_id: orgId,
      space_id: node.entityId,
      parent_space_id: node.parentEntityId,
      shape_type: node.shapeType,
      points_json: node.points,
      x: node.bounds.x,
      y: node.bounds.y,
      width: node.bounds.width,
      height: node.bounds.height,
      z_index: node.zIndex,
      corner_radius: CANVAS_CORNER_RADIUS,
      status: node.status
    }))
  );

  if (insertError) {
    throw new Error(`Failed to seed facility map nodes: ${insertError.message}`);
  }
}

export async function upsertFacilityMapNodes(input: {
  orgId: string;
  nodes: FacilityMapNode[];
}): Promise<FacilityMapNode[]> {
  const supabase = await createSupabaseServer();

  const normalized = normalizeFacilityMapNodesForPersistence(input.nodes);

  const payload = normalized.map((node) => ({
    id: node.id,
    org_id: input.orgId,
    space_id: node.entityId,
    parent_space_id: node.parentEntityId,
    shape_type: node.shapeType,
    // Persist polygon vertices verbatim. Forcing each point to the 24px
    // canvas grid here destroyed sub-grid positioning achieved on the
    // satellite layer — the editor's own per-drag `snapMaybe` already
    // handles grid alignment when the user is in grid mode.
    points_json: node.points.map((point) => ({ x: point.x, y: point.y })),
    x: node.bounds.x,
    y: node.bounds.y,
    width: node.bounds.width,
    height: node.bounds.height,
    z_index: node.zIndex,
    corner_radius: CANVAS_CORNER_RADIUS,
    status: node.status
  }));

  const { error } = await supabase.schema("facilities").from("facility_map_nodes").upsert(payload, { onConflict: "org_id,space_id" });
  if (error) {
    throw new Error(`Failed to save facility map nodes: ${error.message}`);
  }

  const { data: spaceRows, error: spaceError } = await supabase
    .schema("facilities")
    .from("spaces")
    .select("id, name")
    .eq("org_id", input.orgId)
    .in(
      "id",
      payload.map((row) => row.space_id)
    );

  if (spaceError) {
    throw new Error(`Failed to read facility labels after map save: ${spaceError.message}`);
  }

  const labelBySpaceId = new Map((spaceRows ?? []).map((row) => [String((row as { id: string }).id), String((row as { name: string }).name)]));

  return normalized.map((node) => ({
    ...node,
    spaceId: node.entityId,
    orgId: input.orgId,
    parentSpaceId: node.parentEntityId,
    label: labelBySpaceId.get(node.entityId) ?? node.label
  }));
}

/**
 * Delete map-node rows that should never render:
 *   - Nodes for top-level facilities (canvases, not shapes).
 *   - Orphan nodes whose `space_id` no longer matches any row in `spaces`.
 *     These accumulate when a space is hard-deleted but the FK cascade
 *     wasn't set up (or the node table is in a different schema).
 *   - Nodes for archived spaces — we don't render them, no reason to keep
 *     the row hanging around with stale geometry.
 *
 * Runs from `getFacilityMapManageDetail` on every load so existing orgs
 * heal themselves the first time they open the map after this fix.
 */
export async function deleteStaleFacilityMapNodes(orgId: string, spaces: FacilitySpace[]): Promise<void> {
  const supabase = await createSupabaseServer();

  // (Legacy step "wipe nodes for top-level spaces" removed: after the
  // 202605030001 facility/space split, top-level spaces no longer exist
  // — facilities live in their own table.)

  // Archived spaces — wipe their nodes.
  const archivedSpaceIds = spaces.filter((s) => s.status === "archived").map((s) => s.id);
  if (archivedSpaceIds.length > 0) {
    const { error } = await supabase
      .schema("facilities")
      .from("facility_map_nodes")
      .delete()
      .eq("org_id", orgId)
      .in("space_id", archivedSpaceIds);
    if (error) console.error("Failed to delete archived facility map nodes", error);
  }

  // 3) Orphans — node rows whose space_id isn't in the current `spaces`
  // list. We pull existing node space_ids and diff against the set of
  // known space ids; the difference is what we delete.
  const { data: existing, error: existingError } = await supabase
    .schema("facilities")
    .from("facility_map_nodes")
    .select("space_id")
    .eq("org_id", orgId);
  if (existingError) {
    console.error("Failed to load existing facility map nodes for orphan cleanup", existingError);
    return;
  }
  const knownSpaceIds = new Set(spaces.map((s) => s.id));
  const orphanSpaceIds = Array.from(
    new Set(
      ((existing ?? []) as Array<{ space_id: string }>)
        .map((row) => row.space_id)
        .filter((spaceId) => spaceId && !knownSpaceIds.has(spaceId))
    )
  );
  if (orphanSpaceIds.length > 0) {
    const { error } = await supabase
      .schema("facilities")
      .from("facility_map_nodes")
      .delete()
      .eq("org_id", orgId)
      .in("space_id", orphanSpaceIds);
    if (error) console.error("Failed to delete orphan facility map nodes", error);
  }
}

/** @deprecated kept for backwards-compat; use `deleteStaleFacilityMapNodes`. */
export const deleteOrphanTopLevelFacilityMapNodes = deleteStaleFacilityMapNodes;

export async function deleteFacilityMapNodes(input: { orgId: string; nodeIds: string[] }): Promise<void> {
  if (input.nodeIds.length === 0) return;
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .schema("facilities")
    .from("facility_map_nodes")
    .delete()
    .eq("org_id", input.orgId)
    .in("id", input.nodeIds);
  if (error) {
    throw new Error(`Failed to delete facility map nodes: ${error.message}`);
  }
}

export function normalizeFacilityMapNodesForPersistence(nodes: FacilityMapNode[]): FacilityMapNode[] {
  // Recompute bounds from the freshest points but DON'T pass through
  // `normalizeNodeGeometry` — that snaps every polygon vertex to the 24px
  // grid, which loses precise satellite-positioned vertices. The editor
  // applies grid snap during drag (`snapMaybe`) when grid mode is active,
  // so save-time normalization here is redundant in grid mode and
  // destructive in satellite mode.
  return nodes.map((node) => {
    const bounds = node.points.length >= 3 ? boundsFromPoints(node.points) : node.bounds;
    return {
      ...node,
      bounds,
      status: node.status ?? "active",
      cornerRadius: CANVAS_CORNER_RADIUS
    };
  });
}
