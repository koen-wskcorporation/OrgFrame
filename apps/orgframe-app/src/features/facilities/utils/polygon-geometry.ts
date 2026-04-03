"use client";

export type PolygonPoint = {
  x: number;
  y: number;
};

export type PolygonBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type FacilityPolygonGeometry = {
  points: PolygonPoint[];
  bounds: PolygonBounds;
};

export const UNIVERSAL_STRUCTURE_CORNER_RADIUS = 16;

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function toRectPolygonPoints(x: number, y: number, width: number, height: number): PolygonPoint[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height }
  ];
}

export function parsePolygonPoints(value: unknown): PolygonPoint[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const parsed: PolygonPoint[] = [];
  for (const entry of value) {
    const obj = asObject(entry);
    const x = obj.x;
    const y = obj.y;
    if (typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)) {
      return null;
    }
    parsed.push({ x, y });
  }
  return parsed.length >= 3 ? parsed : null;
}

export function getPolygonBounds(points: PolygonPoint[]): PolygonBounds {
  if (points.length === 0) {
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }

  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    left = Math.min(left, point.x);
    top = Math.min(top, point.y);
    right = Math.max(right, point.x);
    bottom = Math.max(bottom, point.y);
  }

  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top)
  };
}

export function getFacilityPolygonGeometry(
  floorPlanValue: unknown,
  fallbackRect: { x: number; y: number; width: number; height: number }
): FacilityPolygonGeometry {
  const floorPlan = asObject(floorPlanValue);
  const pointsFromMetadata = parsePolygonPoints(floorPlan.points);
  const points = pointsFromMetadata ?? toRectPolygonPoints(fallbackRect.x, fallbackRect.y, fallbackRect.width, fallbackRect.height);
  return {
    points,
    bounds: getPolygonBounds(points)
  };
}

export function translatePolygon(points: PolygonPoint[], deltaX: number, deltaY: number): PolygonPoint[] {
  return points.map((point) => ({ x: point.x + deltaX, y: point.y + deltaY }));
}

export function getEdgeMidpoint(a: PolygonPoint, b: PolygonPoint): PolygonPoint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

export function getPolygonEdgeMidpoints(points: PolygonPoint[]): Array<{ x: number; y: number; edgeIndex: number }> {
  if (points.length < 2) {
    return [];
  }
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const midpoint = getEdgeMidpoint(point, next);
    return {
      x: midpoint.x,
      y: midpoint.y,
      edgeIndex: index
    };
  });
}

export function pointInPolygon(point: PolygonPoint, polygon: PolygonPoint[]): boolean {
  if (polygon.length < 3) {
    return false;
  }

  let inside = false;
  for (let index = 0, prev = polygon.length - 1; index < polygon.length; prev = index, index += 1) {
    const a = polygon[index];
    const b = polygon[prev];

    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || Number.EPSILON) + a.x;
    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function orientation(a: PolygonPoint, b: PolygonPoint, c: PolygonPoint): number {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function onSegment(a: PolygonPoint, b: PolygonPoint, c: PolygonPoint): boolean {
  return (
    Math.min(a.x, c.x) <= b.x &&
    b.x <= Math.max(a.x, c.x) &&
    Math.min(a.y, c.y) <= b.y &&
    b.y <= Math.max(a.y, c.y)
  );
}

function segmentsIntersect(p1: PolygonPoint, q1: PolygonPoint, p2: PolygonPoint, q2: PolygonPoint): boolean {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if ((o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0)) {
    return true;
  }

  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}

export function polygonSelfIntersects(points: PolygonPoint[]): boolean {
  if (points.length < 4) {
    return false;
  }

  const edgeCount = points.length;
  for (let first = 0; first < edgeCount; first += 1) {
    const a1 = points[first];
    const a2 = points[(first + 1) % edgeCount];

    for (let second = first + 1; second < edgeCount; second += 1) {
      const b1 = points[second];
      const b2 = points[(second + 1) % edgeCount];

      if (first === second) {
        continue;
      }
      if ((first + 1) % edgeCount === second || first === (second + 1) % edgeCount) {
        continue;
      }

      if (segmentsIntersect(a1, a2, b1, b2)) {
        return true;
      }
    }
  }

  return false;
}

export function isRectangleLikePolygon(points: PolygonPoint[]): boolean {
  if (points.length !== 4) {
    return false;
  }
  const bounds = getPolygonBounds(points);
  const expected = toRectPolygonPoints(bounds.left, bounds.top, bounds.width, bounds.height);
  return points.every((point, index) => Math.abs(point.x - expected[index].x) < 0.01 && Math.abs(point.y - expected[index].y) < 0.01);
}

function distance(a: PolygonPoint, b: PolygonPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function fmtPathNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const rounded = Math.round(value * 1000) / 1000;
  if (Object.is(rounded, -0)) {
    return "0";
  }
  return String(rounded);
}

function getSignedAreaTwice(points: PolygonPoint[]): number {
  let areaTwice = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    areaTwice += a.x * b.y - b.x * a.y;
  }
  return areaTwice;
}

export function buildRoundedPolygonPath(
  points: PolygonPoint[],
  cornerRadius: number,
  smoothPoints?: number[]
): string {
  if (points.length < 3) {
    return "";
  }

  if (cornerRadius <= 0) {
    const [first, ...rest] = points;
    return `M ${fmtPathNumber(first.x)} ${fmtPathNumber(first.y)} ${rest
      .map((point) => `L ${fmtPathNumber(point.x)} ${fmtPathNumber(point.y)}`)
      .join(" ")} Z`;
  }

  const smoothPointSet = new Set(
    (smoothPoints ?? [])
      .map((index) => Math.trunc(index))
      .filter((index) => index >= 0 && index < points.length)
  );

  const corners = points.map((current, index) => {
    const prev = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];

    const lenToPrev = distance(current, prev);
    const lenToNext = distance(current, next);
    const fixedRadius = smoothPointSet.has(index) ? 0 : Math.min(cornerRadius, lenToPrev * 0.5, lenToNext * 0.5);

    if (fixedRadius <= 0) {
      return {
        current,
        start: current,
        end: current
      };
    }

    const toPrevX = (prev.x - current.x) / Math.max(lenToPrev, Number.EPSILON);
    const toPrevY = (prev.y - current.y) / Math.max(lenToPrev, Number.EPSILON);
    const toNextX = (next.x - current.x) / Math.max(lenToNext, Number.EPSILON);
    const toNextY = (next.y - current.y) / Math.max(lenToNext, Number.EPSILON);

    return {
      current,
      start: {
        x: current.x + toPrevX * fixedRadius,
        y: current.y + toPrevY * fixedRadius
      },
      end: {
        x: current.x + toNextX * fixedRadius,
        y: current.y + toNextY * fixedRadius
      }
    };
  });

  const tangents = points.map((current, index) => {
    const prev = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const length = Math.hypot(tx, ty);
    if (length <= Number.EPSILON) {
      return { x: 0, y: 0, handle: 0 };
    }
    const lenToPrev = distance(current, prev);
    const lenToNext = distance(current, next);
    return {
      x: tx / length,
      y: ty / length,
      handle: Math.min(lenToPrev, lenToNext) * 0.34
    };
  });

  const [first, ...rest] = corners;
  const commands: string[] = [`M ${fmtPathNumber(first.start.x)} ${fmtPathNumber(first.start.y)}`];
  const ordered = [first, ...rest];
  for (let index = 0; index < ordered.length; index += 1) {
    const corner = ordered[index];
    const nextCorner = ordered[(index + 1) % ordered.length];
    if (!smoothPointSet.has(index)) {
      commands.push(
        `Q ${fmtPathNumber(corner.current.x)} ${fmtPathNumber(corner.current.y)} ${fmtPathNumber(corner.end.x)} ${fmtPathNumber(corner.end.y)}`
      );
    }

    const start = corner.end;
    const end = nextCorner.start;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const segmentLength = Math.hypot(dx, dy);
    const startSmooth = smoothPointSet.has(index);
    const endSmooth = smoothPointSet.has((index + 1) % ordered.length);

    if ((startSmooth || endSmooth) && segmentLength > Number.EPSILON) {
      const startTangent = tangents[index];
      const endTangent = tangents[(index + 1) % ordered.length];
      const startHandle = startSmooth ? Math.min(startTangent.handle, segmentLength * 0.45) : 0;
      const endHandle = endSmooth ? Math.min(endTangent.handle, segmentLength * 0.45) : 0;
      const c1x = start.x + startTangent.x * startHandle;
      const c1y = start.y + startTangent.y * startHandle;
      const c2x = end.x - endTangent.x * endHandle;
      const c2y = end.y - endTangent.y * endHandle;
      commands.push(
        `C ${fmtPathNumber(c1x)} ${fmtPathNumber(c1y)} ${fmtPathNumber(c2x)} ${fmtPathNumber(c2y)} ${fmtPathNumber(end.x)} ${fmtPathNumber(end.y)}`
      );
    } else {
      commands.push(`L ${fmtPathNumber(end.x)} ${fmtPathNumber(end.y)}`);
    }
  }
  commands.push("Z");
  return commands.join(" ");
}

export function polygonToFloorPlanPatch(
  points: PolygonPoint[],
  floorPlanValue: unknown,
  smoothPoints?: number[]
): Record<string, unknown> {
  const floorPlan = asObject(floorPlanValue);
  const bounds = getPolygonBounds(points);
  const normalizedSmoothPoints = Array.isArray(smoothPoints)
    ? smoothPoints
        .map((index) => Math.trunc(index))
        .filter((index, position, all) => index >= 0 && index < points.length && all.indexOf(index) === position)
        .sort((a, b) => a - b)
    : [];
  const derivedCurvedEdges = Array.from(
    new Set(
      normalizedSmoothPoints.flatMap((index) => [index, ((index - 1) + points.length) % points.length])
    )
  ).sort((a, b) => a - b);
  return {
    ...floorPlan,
    points: points.map((point) => ({ x: point.x, y: point.y })),
    smoothPoints: normalizedSmoothPoints,
    curvedEdges: derivedCurvedEdges,
    x: bounds.left,
    y: bounds.top,
    width: bounds.width,
    height: bounds.height
  };
}
