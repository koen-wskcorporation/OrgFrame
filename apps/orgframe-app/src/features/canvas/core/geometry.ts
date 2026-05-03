import {
  CANVAS_CORNER_RADIUS,
  CANVAS_GRID_SIZE,
  CANVAS_HEIGHT,
  CANVAS_MIN_NODE_SIZE,
  CANVAS_PADDING,
  CANVAS_WIDTH
} from "@/src/features/canvas/core/constants";
import type { CanvasBounds, CanvasNode, CanvasPoint } from "@/src/features/canvas/core/types";

export function snapToGrid(value: number): number {
  return Math.round(value / CANVAS_GRID_SIZE) * CANVAS_GRID_SIZE;
}

export function snapPoint(point: CanvasPoint): CanvasPoint {
  return {
    x: snapToGrid(point.x),
    y: snapToGrid(point.y)
  };
}

export function rectPoints(bounds: CanvasBounds): CanvasPoint[] {
  const x2 = bounds.x + bounds.width;
  const y2 = bounds.y + bounds.height;
  return [
    { x: bounds.x, y: bounds.y },
    { x: x2, y: bounds.y },
    { x: x2, y: y2 },
    { x: bounds.x, y: y2 }
  ];
}

export function boundsFromPoints(points: CanvasPoint[]): CanvasBounds {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

export function normalizeBounds(input: CanvasBounds): CanvasBounds {
  const width = Math.max(CANVAS_MIN_NODE_SIZE, snapToGrid(input.width));
  const height = Math.max(CANVAS_MIN_NODE_SIZE, snapToGrid(input.height));
  const maxX = CANVAS_WIDTH - CANVAS_PADDING - width;
  const maxY = CANVAS_HEIGHT - CANVAS_PADDING - height;

  const x = Math.max(CANVAS_PADDING, Math.min(maxX, snapToGrid(input.x)));
  const y = Math.max(CANVAS_PADDING, Math.min(maxY, snapToGrid(input.y)));

  return { x, y, width, height };
}

function normalizePolygonPoints(points: CanvasPoint[]): CanvasPoint[] {
  const normalized = points.map((point) => snapPoint(point));
  if (normalized.length >= 3) {
    return normalized;
  }

  const fallbackBounds = normalizeBounds({
    x: normalized[0]?.x ?? CANVAS_PADDING,
    y: normalized[0]?.y ?? CANVAS_PADDING,
    width: CANVAS_MIN_NODE_SIZE,
    height: CANVAS_MIN_NODE_SIZE
  });
  return rectPoints(fallbackBounds);
}

export function normalizeNodeGeometry(node: CanvasNode): CanvasNode {
  // Every node is a polygon now — a rectangle is just a 4-vertex polygon.
  const points = normalizePolygonPoints(node.points);
  const rawBounds = boundsFromPoints(points);
  const bounds = normalizeBounds(rawBounds);
  const dx = bounds.x - rawBounds.x;
  const dy = bounds.y - rawBounds.y;

  return {
    ...node,
    points: points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
    bounds,
    cornerRadius: CANVAS_CORNER_RADIUS
  };
}

export function sortNodesDeterministic<T extends Pick<CanvasNode, "id" | "zIndex">>(nodes: T[]): T[] {
  return [...nodes].sort((a, b) => {
    if (a.zIndex !== b.zIndex) {
      return a.zIndex - b.zIndex;
    }
    return a.id.localeCompare(b.id);
  });
}

export function connectorAnchorBottom(bounds: CanvasBounds): CanvasPoint {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height
  };
}

export function connectorAnchorTop(bounds: CanvasBounds): CanvasPoint {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y
  };
}

export function isNodeGeometryOnGrid(node: CanvasNode): boolean {
  const values = [node.bounds.x, node.bounds.y, node.bounds.width, node.bounds.height, ...node.points.flatMap((point) => [point.x, point.y])];
  return values.every((value) => value % CANVAS_GRID_SIZE === 0);
}
