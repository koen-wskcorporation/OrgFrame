import { createSupabaseServer } from "@/src/shared/data-api/server";
import { CANVAS_CORNER_RADIUS, CANVAS_GRID_SIZE, CANVAS_MIN_NODE_SIZE, CANVAS_PADDING } from "@/src/features/canvas/core/constants";
import { normalizeLayout } from "@/src/features/canvas/core/layout";
import { normalizeNodeGeometry, rectPoints } from "@/src/features/canvas/core/geometry";
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
  const node = normalizeNodeGeometry({
    id: row.id,
    entityId: row.space_id,
    parentEntityId: row.parent_space_id,
    label,
    shapeType: row.shape_type,
    points: asPoints(row.points_json),
    bounds: {
      x: Number(row.x),
      y: Number(row.y),
      width: Number(row.width),
      height: Number(row.height)
    },
    zIndex: Number(row.z_index),
    cornerRadius: CANVAS_CORNER_RADIUS,
    status: row.status
  });

  return {
    ...node,
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

  return rows.map((row) => mapRowToNode(row, spaceById.get(row.space_id)?.name ?? row.space_id));
}

export async function seedFacilityMapNodesForMissingSpaces(orgId: string, spaces: FacilitySpace[]): Promise<void> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.schema("facilities").from("facility_map_nodes").select("space_id").eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to load existing facility map nodes: ${error.message}`);
  }

  const existing = new Set((data ?? []).map((row) => String((row as { space_id: string }).space_id)));
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
    points_json: node.points.map((point) => ({
      x: Math.round(point.x / CANVAS_GRID_SIZE) * CANVAS_GRID_SIZE,
      y: Math.round(point.y / CANVAS_GRID_SIZE) * CANVAS_GRID_SIZE
    })),
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

export function normalizeFacilityMapNodesForPersistence(nodes: FacilityMapNode[]): FacilityMapNode[] {
  return normalizeLayout(
    nodes.map((node) =>
      normalizeNodeGeometry({
        ...node,
        status: node.status ?? "active",
        cornerRadius: CANVAS_CORNER_RADIUS
      })
    )
  ) as FacilityMapNode[];
}
