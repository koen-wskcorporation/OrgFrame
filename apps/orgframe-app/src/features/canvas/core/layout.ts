import { CANVAS_GRID_SIZE, CANVAS_OVERLAP_GAP } from "@/src/features/canvas/core/constants";
import { normalizeNodeGeometry, sortNodesDeterministic } from "@/src/features/canvas/core/geometry";
import type { CanvasBounds, CanvasNode } from "@/src/features/canvas/core/types";

export function boxesOverlap(a: CanvasBounds, b: CanvasBounds, gap = CANVAS_OVERLAP_GAP): boolean {
  return !(a.x + a.width + gap <= b.x || b.x + b.width + gap <= a.x || a.y + a.height + gap <= b.y || b.y + b.height + gap <= a.y);
}

export function pushNodeAwayFromCollisions(node: CanvasNode, others: CanvasNode[]): CanvasNode {
  let current = normalizeNodeGeometry(node);
  let attempts = 0;

  while (others.some((other) => boxesOverlap(current.bounds, other.bounds))) {
    attempts += 1;
    if (attempts > 500) {
      break;
    }

    current = normalizeNodeGeometry({
      ...current,
      bounds: {
        ...current.bounds,
        x: current.bounds.x + CANVAS_GRID_SIZE,
        y: current.bounds.y + (attempts % 8 === 0 ? CANVAS_GRID_SIZE : 0)
      }
    });
  }

  return current;
}

export function normalizeLayout(nodes: CanvasNode[]): CanvasNode[] {
  const placed: CanvasNode[] = [];

  for (const node of sortNodesDeterministic(nodes)) {
    const normalized = normalizeNodeGeometry(node);
    placed.push(pushNodeAwayFromCollisions(normalized, placed));
  }

  return placed;
}
