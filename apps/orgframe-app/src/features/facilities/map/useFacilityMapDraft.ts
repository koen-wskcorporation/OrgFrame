"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CanvasPoint } from "@/src/features/canvas/core/types";
import { CANVAS_PADDING, CANVAS_MIN_NODE_SIZE } from "@/src/features/canvas/core/constants";
import { rectPoints } from "@/src/features/canvas/core/geometry";
import type { FacilitySpace, FacilitySpaceStatusDef } from "@/src/features/facilities/types";
import { type MapShape, shapeFromSpace } from "@/src/features/facilities/map/types";

/**
 * Workspace-level state model for the facility map editor.
 *
 * Single source of truth: a list of `MapShape`. Loaded shapes carry the
 * server-issued UUID; locally-created shapes carry a client-issued UUID
 * (via `crypto.randomUUID()`) — the same UUID survives the round-trip,
 * so there is no tempId-to-realId remap.
 *
 * Dirty detection is a structural diff against the snapshot captured on
 * mount. Save extracts {creates, updates, deletes} from that diff.
 *
 * Nothing in this hook talks to the network — the consumer wires it up
 * to `saveFacilityMapAction` and reflects success back via `commit()`.
 */
export type FacilityMapDraft = {
  /** Current shape list. */
  shapes: MapShape[];
  /** True when the draft has uncommitted changes vs the loaded snapshot. */
  isDirty: boolean;

  /** Replace the entire shape list (geometry edits, multi-shape moves, etc.). */
  setShapes: (next: MapShape[]) => void;
  /** Mutate exactly one shape by id. */
  updateShape: (id: string, patch: Partial<MapShape>) => void;
  /** Add a brand-new shape at the given polygon. Returns the new shape's id. */
  createShape: (points: CanvasPoint[]) => string;
  /** Remove a shape from the draft. If it was server-loaded, queue a delete. */
  removeShape: (id: string) => void;

  /** Diff vs the snapshot, ready to feed to `saveFacilityMapAction`. */
  buildSavePayload: (defaults: { isBookable: boolean; timezone: string }) => {
    creates: Array<{
      id: string;
      name: string;
      spaceKind: MapShape["spaceKind"];
      statusId: string | null;
      isBookable: boolean;
      timezone: string;
      capacity: number | null;
      sortIndex: number;
      points: CanvasPoint[];
      zIndex: number;
    }>;
    updates: Array<{ id: string; points: CanvasPoint[]; zIndex: number }>;
    deletes: string[];
  };

  /** Commit a successful save: replace the snapshot with the latest spaces. */
  commit: (spaces: FacilitySpace[]) => void;
  /** Discard all uncommitted changes — reverts to the snapshot. */
  discard: () => void;

  /** Has the shape been added in this session and not yet saved? */
  isPendingCreate: (id: string) => boolean;
};

export function useFacilityMapDraft(args: {
  spaces: FacilitySpace[];
  spaceStatuses: FacilitySpaceStatusDef[];
}): FacilityMapDraft {
  const initialShapes = useMemo(() => spacesToShapes(args.spaces), [args.spaces]);
  const [snapshot, setSnapshot] = useState(initialShapes);
  const [shapes, setShapesState] = useState(initialShapes);
  const [pendingCreateIds, setPendingCreateIds] = useState<Set<string>>(() => new Set());
  const [deletedSpaceIds, setDeletedSpaceIds] = useState<Set<string>>(() => new Set());

  // Keep local state aligned with prop changes only when nothing is dirty —
  // a fresh server load (post-save revalidation) replaces both snapshot and
  // current state, but a server poll mid-edit must not blow away the user's
  // unsaved work.
  useEffect(() => {
    if (pendingCreateIds.size > 0 || deletedSpaceIds.size > 0) return;
    if (!shallowShapesEqual(snapshot, initialShapes)) {
      setSnapshot(initialShapes);
      setShapesState(initialShapes);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialShapes]);

  const isDirty = useMemo(
    () =>
      pendingCreateIds.size > 0 ||
      deletedSpaceIds.size > 0 ||
      !shallowShapesEqual(snapshot, shapes),
    [snapshot, shapes, pendingCreateIds, deletedSpaceIds]
  );

  const setShapes = useCallback((next: MapShape[]) => setShapesState(next), []);

  const updateShape = useCallback((id: string, patch: Partial<MapShape>) => {
    setShapesState((current) => current.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const createShape = useCallback(
    (points: CanvasPoint[]) => {
      const id = crypto.randomUUID();
      const fallbackStatus = args.spaceStatuses.find((s) => s.isSystem && s.behavesAs === "open") ?? args.spaceStatuses[0] ?? null;
      const baseName = pickNextSpaceName(shapes.map((s) => s.label));
      setShapesState((current) => {
        const maxZ = current.reduce((acc, s) => Math.max(acc, s.zIndex), 0);
        const newShape: MapShape = {
          id,
          label: baseName,
          spaceKind: "custom",
          status: "open",
          statusId: fallbackStatus?.id ?? null,
          isBookable: true,
          parentSpaceId: null,
          points,
          zIndex: maxZ + 1
        };
        return [...current, newShape];
      });
      setPendingCreateIds((current) => {
        const next = new Set(current);
        next.add(id);
        return next;
      });
      return id;
    },
    [shapes, args.spaceStatuses]
  );

  const removeShape = useCallback((id: string) => {
    setShapesState((current) => current.filter((s) => s.id !== id));
    if (pendingCreateIds.has(id)) {
      setPendingCreateIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      return;
    }
    setDeletedSpaceIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }, [pendingCreateIds]);

  const buildSavePayload = useCallback<FacilityMapDraft["buildSavePayload"]>((defaults) => {
    const snapshotById = new Map(snapshot.map((s) => [s.id, s]));
    const creates: ReturnType<FacilityMapDraft["buildSavePayload"]>["creates"] = [];
    const updates: ReturnType<FacilityMapDraft["buildSavePayload"]>["updates"] = [];

    for (const shape of shapes) {
      if (pendingCreateIds.has(shape.id)) {
        creates.push({
          id: shape.id,
          name: shape.label,
          spaceKind: shape.spaceKind,
          statusId: shape.statusId,
          isBookable: shape.isBookable,
          timezone: defaults.timezone,
          capacity: null,
          sortIndex: 0,
          points: shape.points,
          zIndex: shape.zIndex
        });
        continue;
      }
      const prev = snapshotById.get(shape.id);
      if (!prev) continue; // shouldn't happen — would mean unknown id and not pending-create
      if (
        !pointsEqual(prev.points, shape.points) ||
        prev.zIndex !== shape.zIndex
      ) {
        updates.push({ id: shape.id, points: shape.points, zIndex: shape.zIndex });
      }
    }

    return { creates, updates, deletes: Array.from(deletedSpaceIds) };
  }, [shapes, snapshot, pendingCreateIds, deletedSpaceIds]);

  const commit = useCallback((spaces: FacilitySpace[]) => {
    const next = spacesToShapes(spaces);
    setSnapshot(next);
    setShapesState(next);
    setPendingCreateIds(new Set());
    setDeletedSpaceIds(new Set());
  }, []);

  const discard = useCallback(() => {
    setShapesState(snapshot);
    setPendingCreateIds(new Set());
    setDeletedSpaceIds(new Set());
  }, [snapshot]);

  const isPendingCreate = useCallback((id: string) => pendingCreateIds.has(id), [pendingCreateIds]);

  return { shapes, isDirty, setShapes, updateShape, createShape, removeShape, buildSavePayload, commit, discard, isPendingCreate };
}

// ---------------------------------------------------------------------------

function spacesToShapes(spaces: FacilitySpace[]): MapShape[] {
  // Skip archived: they stay in the DB but don't render on the canvas.
  // Default geometry for spaces without a saved polygon yet — a small
  // rectangle near the origin so they're visible and movable. The user
  // can drag/reshape and save to persist real coordinates.
  let fallbackIndex = 0;
  return spaces
    .filter((space) => space.status !== "archived")
    .sort((a, b) => a.sortIndex - b.sortIndex || a.createdAt.localeCompare(b.createdAt))
    .map((space) => {
      const fallback = defaultFallback(fallbackIndex++);
      return shapeFromSpace(space, fallback);
    });
}

function defaultFallback(index: number) {
  const col = index % 6;
  const row = Math.floor(index / 6);
  const x = CANVAS_PADDING + col * (CANVAS_MIN_NODE_SIZE * 3);
  const y = CANVAS_PADDING + row * (CANVAS_MIN_NODE_SIZE * 2);
  return {
    points: rectPoints({ x, y, width: CANVAS_MIN_NODE_SIZE * 3, height: CANVAS_MIN_NODE_SIZE * 2 }),
    zIndex: index + 1
  };
}

function pickNextSpaceName(existing: string[]) {
  const names = new Set(existing);
  let i = 1;
  let candidate = "New space";
  while (names.has(candidate)) {
    i += 1;
    candidate = `New space ${i}`;
  }
  return candidate;
}

function shallowShapesEqual(a: MapShape[], b: MapShape[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const sa = a[i];
    const sb = b[i];
    if (
      sa.id !== sb.id ||
      sa.label !== sb.label ||
      sa.spaceKind !== sb.spaceKind ||
      sa.status !== sb.status ||
      sa.statusId !== sb.statusId ||
      sa.isBookable !== sb.isBookable ||
      sa.parentSpaceId !== sb.parentSpaceId ||
      sa.zIndex !== sb.zIndex ||
      !pointsEqual(sa.points, sb.points)
    ) {
      return false;
    }
  }
  return true;
}

function pointsEqual(a: CanvasPoint[], b: CanvasPoint[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].x !== b[i].x || a[i].y !== b[i].y) return false;
    if (Boolean(a[i].smooth) !== Boolean(b[i].smooth)) return false;
  }
  return true;
}
