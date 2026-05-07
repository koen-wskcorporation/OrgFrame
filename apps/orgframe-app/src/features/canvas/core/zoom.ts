/**
 * Shared zoom engine for canvas editors (program map, facility map, …).
 *
 * The mouse-wheel / trackpad pinch handler computes the next view such that:
 *   - Zoom factor scales **continuously** with `deltaY` via
 *     `Math.exp(-deltaY * sensitivity)`. Trackpads emit many wheel events
 *     with small deltas; a stepped 1.1×-per-event factor feels jerky there.
 *     The exponential mapping integrates smoothly across event volume so a
 *     single firm pinch ends up identical regardless of how the OS chunks
 *     the events.
 *   - The world point under the cursor stays anchored at the same screen
 *     pixel after zoom. This is what makes wheel zoom feel "right" — users
 *     can aim at a node and drill in without re-centering by hand.
 *
 * Both editors model their view as `{ centerX, centerY, zoom }` in world
 * units, with that center anchored at the container's screen midpoint
 * (`rect.width / 2`, `rect.height / 2`). The math here assumes that.
 */
export type CanvasView = {
  centerX: number;
  centerY: number;
  zoom: number;
};

export type CanvasWheelLike = {
  clientX: number;
  clientY: number;
  deltaY: number;
};

export type WheelZoomOptions = {
  minZoom: number;
  maxZoom: number;
  /** Higher = more zoom per wheel notch. Defaults to 0.0025 — the value
   *  the facility map shipped with and that has tested well across mice
   *  and trackpads. */
  sensitivity?: number;
  /** Optional clamp hook (e.g. satellite mode caps zoom lower). Receives
   *  the candidate zoom AFTER the min/max clamp and can pin it further. */
  clampZoom?: (candidate: number) => number;
  /** Pixel offset of the world's on-screen center from the rect's geometric
   *  center. When a side panel occupies the right portion of the canvas the
   *  editor shifts the world content left by `panelWidth / 2`; pass that
   *  same value as a negative number here so the cursor-anchor math stays
   *  pinned to the world point that is actually under the cursor. */
  viewportOffsetX?: number;
  viewportOffsetY?: number;
};

const DEFAULT_SENSITIVITY = 0.0025;

/**
 * Compute the next view for a mouse-wheel zoom event. Returns `null` when
 * the candidate zoom collapses to the same value (e.g. already at min/max
 * and the wheel is pushing further) so callers can short-circuit setState.
 */
export function computeWheelZoom(
  view: CanvasView,
  event: CanvasWheelLike,
  rect: DOMRect,
  options: WheelZoomOptions
): CanvasView | null {
  const sensitivity = options.sensitivity ?? DEFAULT_SENSITIVITY;
  const factor = Math.exp(-event.deltaY * sensitivity);
  let nextZoom = Math.max(options.minZoom, Math.min(options.maxZoom, view.zoom * factor));
  if (options.clampZoom) nextZoom = options.clampZoom(nextZoom);
  if (nextZoom === view.zoom) return null;

  // Cursor offset from the world's screen-center, in screen pixels. When
  // the canvas content is visually shifted (e.g. by a side panel), we add
  // that shift to the geometric center to recover the actual world center.
  const viewportOffsetX = options.viewportOffsetX ?? 0;
  const viewportOffsetY = options.viewportOffsetY ?? 0;
  const offsetX = event.clientX - rect.left - rect.width / 2 - viewportOffsetX;
  const offsetY = event.clientY - rect.top - rect.height / 2 - viewportOffsetY;
  // World point currently rendered under the cursor.
  const worldX = view.centerX + offsetX / view.zoom;
  const worldY = view.centerY + offsetY / view.zoom;
  // Pick the new center so that same world point remains under the cursor.
  return {
    centerX: worldX - offsetX / nextZoom,
    centerY: worldY - offsetY / nextZoom,
    zoom: nextZoom
  };
}
