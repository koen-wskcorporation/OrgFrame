/**
 * Trace a binary mask PNG into a simplified polygon outline.
 *
 * Pipeline:
 *   1. decode PNG → raw grayscale via sharp
 *   2. threshold to binary (>128 = inside)
 *   3. find the largest connected component containing the click point
 *      (or fall back to the largest component overall)
 *   4. Moore-neighbor boundary trace
 *   5. Douglas-Peucker simplify to ~10-30 vertices
 *   6. classify each surviving vertex as "smooth" if its turn angle is gentle
 */

import sharp from "sharp";

export type TracedPolygon = Array<{ x: number; y: number; smooth?: boolean }>;

export async function traceMaskToPolygon(
  pngBuffer: Buffer,
  options: { simplifyEpsilonPx?: number; smoothAngleThresholdDeg?: number; insidePoint?: { x: number; y: number } } = {}
): Promise<{ polygon: TracedPolygon; width: number; height: number } | null> {
  const epsilon = options.simplifyEpsilonPx ?? 4;
  const smoothAngle = options.smoothAngleThresholdDeg ?? 35;

  // sam2.ts hands us a normalized 1-channel white-on-black PNG. extractChannel
  // bullet-proofs the decode against input mode quirks.
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .extractChannel(0)
    .toColourspace("b-w")
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;

  const inside = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    inside[i] = (data[i] ?? 0) > 128 ? 1 : 0;
  }

  const component = pickComponent(inside, w, h, options.insidePoint);
  if (!component) return null;

  const boundary = traceBoundary(component, w, h);
  if (boundary.length < 3) return null;

  const simplified = douglasPeucker(boundary, epsilon);
  if (simplified.length < 3) return null;

  const polygon = annotateSmoothness(simplified, smoothAngle);

  return { polygon, width: w, height: h };
}

function pickComponent(
  inside: Uint8Array,
  w: number,
  h: number,
  preferred?: { x: number; y: number }
): Uint8Array | null {
  // Flood-fill connected components of "inside" pixels, keep the largest (or
  // the one containing the user's click if provided).
  const visited = new Uint8Array(w * h);
  const stack: number[] = [];

  let bestSize = 0;
  let bestMask: Uint8Array | null = null;
  let preferredFound = false;

  const px = preferred ? Math.max(0, Math.min(w - 1, Math.round(preferred.x))) : -1;
  const py = preferred ? Math.max(0, Math.min(h - 1, Math.round(preferred.y))) : -1;
  const preferredIdx = preferred ? py * w + px : -1;

  for (let i = 0; i < w * h; i += 1) {
    if (visited[i] || !inside[i]) continue;
    stack.length = 0;
    stack.push(i);
    visited[i] = 1;
    const mask = new Uint8Array(w * h);
    let size = 0;
    let containsPreferred = false;
    while (stack.length > 0) {
      const idx = stack.pop()!;
      mask[idx] = 1;
      size += 1;
      if (idx === preferredIdx) containsPreferred = true;
      const x = idx % w;
      const y = (idx - x) / w;
      if (x > 0) {
        const n = idx - 1;
        if (!visited[n] && inside[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
      if (x < w - 1) {
        const n = idx + 1;
        if (!visited[n] && inside[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
      if (y > 0) {
        const n = idx - w;
        if (!visited[n] && inside[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
      if (y < h - 1) {
        const n = idx + w;
        if (!visited[n] && inside[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
    }
    if (containsPreferred) {
      preferredFound = true;
      bestMask = mask;
      bestSize = size;
      break;
    }
    if (size > bestSize) {
      bestSize = size;
      bestMask = mask;
    }
  }

  // Sanity floor: ignore tiny specks.
  if (!bestMask || (bestSize < 25 && !preferredFound)) return null;
  return bestMask;
}

function traceBoundary(mask: Uint8Array, w: number, h: number): Array<{ x: number; y: number }> {
  // Moore-neighbor tracing. Find first "inside" pixel in raster order, then
  // walk clockwise around the boundary using the neighbor lookup until we
  // return to the start with the same entry direction.
  let startIdx = -1;
  for (let i = 0; i < w * h; i += 1) {
    if (mask[i]) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) return [];

  const boundary: Array<{ x: number; y: number }> = [];
  // Neighbor offsets (dx, dy) clockwise starting from west.
  const nbrs: Array<[number, number]> = [
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1]
  ];

  const sx = startIdx % w;
  const sy = (startIdx - sx) / w;
  let cx = sx;
  let cy = sy;
  // Previous pixel direction — we approached the start from "west" (idx 0).
  let prevDir = 0;
  boundary.push({ x: cx, y: cy });

  // Hard cap to avoid runaway loops on degenerate masks.
  const maxSteps = 8 * (w + h) + 1000;
  for (let step = 0; step < maxSteps; step += 1) {
    // Start checking from prevDir+2 (counter-clockwise from where we came).
    let foundDir = -1;
    for (let i = 1; i <= 8; i += 1) {
      const dir = (prevDir + 6 + i) % 8;
      const [dx, dy] = nbrs[dir]!;
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (mask[ny * w + nx]) {
        foundDir = dir;
        cx = nx;
        cy = ny;
        break;
      }
    }
    if (foundDir < 0) break;
    prevDir = foundDir;
    if (cx === sx && cy === sy) break;
    boundary.push({ x: cx, y: cy });
  }

  return boundary;
}

function douglasPeucker(points: Array<{ x: number; y: number }>, epsilon: number): Array<{ x: number; y: number }> {
  if (points.length <= 2) return points.slice();

  // Closed polygon — split at the point furthest from the centroid so DP runs
  // on an "open" path; reattach at the end.
  let furthestIdx = 0;
  let furthestDist = -1;
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  for (let i = 0; i < points.length; i += 1) {
    const dx = points[i]!.x - cx;
    const dy = points[i]!.y - cy;
    const d = dx * dx + dy * dy;
    if (d > furthestDist) {
      furthestDist = d;
      furthestIdx = i;
    }
  }

  const rolled = points.slice(furthestIdx).concat(points.slice(0, furthestIdx));
  const opened = rolled.concat([rolled[0]!]);
  const simplified = dpRecursive(opened, 0, opened.length - 1, epsilon);
  // Remove the duplicated closing point.
  if (simplified.length > 1) {
    const first = simplified[0]!;
    const last = simplified[simplified.length - 1]!;
    if (first.x === last.x && first.y === last.y) simplified.pop();
  }
  return simplified;
}

function dpRecursive(
  points: Array<{ x: number; y: number }>,
  startIdx: number,
  endIdx: number,
  epsilon: number
): Array<{ x: number; y: number }> {
  const a = points[startIdx]!;
  const b = points[endIdx]!;
  let maxDist = 0;
  let maxIdx = -1;
  for (let i = startIdx + 1; i < endIdx; i += 1) {
    const d = perpendicularDistance(points[i]!, a, b);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }
  if (maxDist > epsilon && maxIdx > 0) {
    const left = dpRecursive(points, startIdx, maxIdx, epsilon);
    const right = dpRecursive(points, maxIdx, endIdx, epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}

function perpendicularDistance(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) {
    const ex = p.x - a.x;
    const ey = p.y - a.y;
    return Math.sqrt(ex * ex + ey * ey);
  }
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  const ex = p.x - projX;
  const ey = p.y - projY;
  return Math.sqrt(ex * ex + ey * ey);
}

function annotateSmoothness(
  points: Array<{ x: number; y: number }>,
  smoothAngleDeg: number
): TracedPolygon {
  // A vertex with a turn angle smaller than the threshold (i.e. nearly
  // straight) is treated as a "smooth" point so the renderer interpolates
  // through it instead of drawing a hard corner.
  const out: TracedPolygon = [];
  const n = points.length;
  const threshold = (smoothAngleDeg * Math.PI) / 180;
  for (let i = 0; i < n; i += 1) {
    const prev = points[(i - 1 + n) % n]!;
    const cur = points[i]!;
    const next = points[(i + 1) % n]!;
    const v1x = cur.x - prev.x;
    const v1y = cur.y - prev.y;
    const v2x = next.x - cur.x;
    const v2y = next.y - cur.y;
    const a1 = Math.atan2(v1y, v1x);
    const a2 = Math.atan2(v2y, v2x);
    let delta = Math.abs(a2 - a1);
    if (delta > Math.PI) delta = 2 * Math.PI - delta;
    out.push(delta < threshold ? { x: cur.x, y: cur.y, smooth: true } : { x: cur.x, y: cur.y });
  }
  return out;
}
