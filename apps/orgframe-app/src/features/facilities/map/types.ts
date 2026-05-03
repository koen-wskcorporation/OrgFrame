import type { CanvasPoint } from "@/src/features/canvas/core/types";
import type { FacilitySpace, FacilitySpaceKind, FacilitySpaceStatus } from "@/src/features/facilities/types";

/**
 * A polygon on the facility canvas. Derived from a `FacilitySpace` —
 * one shape per space, the same UUID. Bounds are NOT stored; callers
 * recompute them from `points` on demand. Corner radius is a constant
 * defined on the canvas.
 */
export type MapShape = {
  /** Same UUID as the underlying space. */
  id: string;
  label: string;
  spaceKind: FacilitySpaceKind;
  status: FacilitySpaceStatus;
  /** Optional org-customizable status definition id, used by the StatusChip lookup. */
  statusId: string | null;
  /** When false the editor renders the polygon with a hatched fill so the
   *  "you can't book this" intent reads at a glance on the canvas. */
  isBookable: boolean;
  parentSpaceId: string | null;
  points: CanvasPoint[];
  zIndex: number;
};

export function shapeFromSpace(space: FacilitySpace, fallback: { points: CanvasPoint[]; zIndex: number }): MapShape {
  return {
    id: space.id,
    label: space.name,
    spaceKind: space.spaceKind,
    status: space.status,
    statusId: space.statusId ?? null,
    isBookable: space.isBookable,
    parentSpaceId: space.parentSpaceId,
    points: space.mapPoints ?? fallback.points,
    zIndex: space.mapZIndex ?? fallback.zIndex
  };
}
