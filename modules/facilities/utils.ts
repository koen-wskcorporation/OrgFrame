import type { FacilityNode, FacilityNodeLayout } from "@/modules/facilities/types";

export const DEFAULT_NODE_LAYOUT: FacilityNodeLayout = {
  x: 80,
  y: 80,
  w: 180,
  h: 120,
  z: 0,
  shape: "rect",
  containerMode: "free"
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asInt(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

export function normalizeFacilityNodeLayout(value: unknown): FacilityNodeLayout {
  const input = asObject(value);
  return {
    x: asInt(input.x, DEFAULT_NODE_LAYOUT.x),
    y: asInt(input.y, DEFAULT_NODE_LAYOUT.y),
    w: Math.max(40, asInt(input.w, DEFAULT_NODE_LAYOUT.w)),
    h: Math.max(40, asInt(input.h, DEFAULT_NODE_LAYOUT.h)),
    z: Math.max(0, asInt(input.z, DEFAULT_NODE_LAYOUT.z)),
    shape: input.shape === "pill" ? "pill" : "rect",
    containerMode: input.containerMode === "stack" ? "stack" : "free"
  };
}

export function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function sortNodes(nodes: FacilityNode[]) {
  return [...nodes].sort((a, b) => a.sortIndex - b.sortIndex || a.name.localeCompare(b.name));
}

export function collectNodeDescendantIds(nodes: FacilityNode[], rootNodeId: string) {
  const byParent = new Map<string | null, FacilityNode[]>();
  for (const node of nodes) {
    const list = byParent.get(node.parentNodeId) ?? [];
    list.push(node);
    byParent.set(node.parentNodeId, list);
  }

  const descendants = new Set<string>();
  const stack = [...(byParent.get(rootNodeId) ?? [])];

  while (stack.length > 0) {
    const next = stack.pop();
    if (!next || descendants.has(next.id)) {
      continue;
    }
    descendants.add(next.id);
    const children = byParent.get(next.id) ?? [];
    for (const child of children) {
      stack.push(child);
    }
  }

  return descendants;
}

export function collectNodeAncestorIds(nodes: FacilityNode[], startNodeId: string) {
  const parentById = new Map(nodes.map((node) => [node.id, node.parentNodeId]));
  const ancestors = new Set<string>();
  let cursor = parentById.get(startNodeId) ?? null;
  while (cursor) {
    if (ancestors.has(cursor)) {
      break;
    }
    ancestors.add(cursor);
    cursor = parentById.get(cursor) ?? null;
  }
  return ancestors;
}
