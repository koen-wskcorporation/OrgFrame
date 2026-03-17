"use client";

import { Copy, Settings2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Alert } from "@orgframe/ui/ui/alert";
import { Button } from "@orgframe/ui/ui/button";
import { type CanvasViewportHandle } from "@orgframe/ui/ui/canvas-viewport";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/ui/card";
import { Checkbox } from "@orgframe/ui/ui/checkbox";
import { Chip } from "@orgframe/ui/ui/chip";
import { useConfirmDialog } from "@orgframe/ui/ui/confirm-dialog";
import { FormField } from "@orgframe/ui/ui/form-field";
import { Input } from "@orgframe/ui/ui/input";
import { Panel } from "@orgframe/ui/ui/panel";
import { Popover } from "@orgframe/ui/ui/popover";
import { Popup } from "@orgframe/ui/ui/popup";
import { Select } from "@orgframe/ui/ui/select";
import { StructureCanvas } from "@orgframe/ui/modules/core/components/StructureCanvas";
import type { FacilitySpace } from "@/modules/facilities/types";

type StructureElementType = "room" | "court" | "field" | "custom" | "structure";

type InlineCreateDraft = {
  name: string;
  elementType: StructureElementType;
  isBookable: boolean;
};

type InlineEditDraft = {
  spaceId: string;
  name: string;
  elementType: StructureElementType;
  status: FacilitySpace["status"];
  isBookable: boolean;
};

type RoomLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const CANVAS_GRID_SIZE = 25;
const CANVAS_GRID_PITCH = CANVAS_GRID_SIZE;
const CANVAS_POSITION_STEP = CANVAS_GRID_PITCH;
const CANVAS_SIZE_STEP = CANVAS_GRID_SIZE;
const NODE_MIN_SIZE = 5;
const RESIZE_HIT_RADIUS = 10;
const GRID_NUMERIC_SCALE = 10;

function edgeToCursor(edge: ResizeEdge) {
  switch (edge) {
    case "n":
      return "n-resize";
    case "s":
      return "s-resize";
    case "e":
      return "e-resize";
    case "w":
      return "w-resize";
    case "ne":
      return "ne-resize";
    case "nw":
      return "nw-resize";
    case "se":
      return "se-resize";
    case "sw":
      return "sw-resize";
    default:
      return "default";
  }
}

function getResizeEdgeFromPoint(localX: number, localY: number, width: number, height: number): ResizeEdge | null {
  const nearLeft = localX <= RESIZE_HIT_RADIUS;
  const nearRight = localX >= width - RESIZE_HIT_RADIUS;
  const nearTop = localY <= RESIZE_HIT_RADIUS;
  const nearBottom = localY >= height - RESIZE_HIT_RADIUS;

  if (nearTop && nearLeft) {
    return "nw";
  }
  if (nearTop && nearRight) {
    return "ne";
  }
  if (nearBottom && nearLeft) {
    return "sw";
  }
  if (nearBottom && nearRight) {
    return "se";
  }
  if (nearTop) {
    return "n";
  }
  if (nearBottom) {
    return "s";
  }
  if (nearLeft) {
    return "w";
  }
  if (nearRight) {
    return "e";
  }

  return null;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function isRoomKind(kind: FacilitySpace["spaceKind"]) {
  return kind === "room" || kind === "court" || kind === "field" || kind === "custom";
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function snapByStep(value: number, step: number) {
  const scaledValue = Math.round(value * GRID_NUMERIC_SCALE);
  const scaledStep = Math.max(1, Math.round(step * GRID_NUMERIC_SCALE));
  const snappedScaled = Math.round(scaledValue / scaledStep) * scaledStep;
  return snappedScaled / GRID_NUMERIC_SCALE;
}

function getRoomLayout(space: FacilitySpace, index: number): RoomLayout {
  const metadata = asObject(space.metadataJson);
  const floorPlan = asObject(metadata.floorPlan);
  const fallbackX = CANVAS_GRID_PITCH + (index % 6) * 200;
  const fallbackY = CANVAS_GRID_PITCH + Math.floor(index / 6) * 150;
  const rawWidth = Math.max(NODE_MIN_SIZE, asNumber(floorPlan.width, CANVAS_GRID_SIZE * 8));
  const rawHeight = Math.max(NODE_MIN_SIZE, asNumber(floorPlan.height, CANVAS_GRID_SIZE * 5));

  return {
    x: snapToGrid(asNumber(floorPlan.x, fallbackX)),
    y: snapToGrid(asNumber(floorPlan.y, fallbackY)),
    width: snapSizeToGrid(rawWidth),
    height: snapSizeToGrid(rawHeight)
  };
}

function roundLayout(layout: RoomLayout): RoomLayout {
  return {
    x: snapToGrid(layout.x),
    y: snapToGrid(layout.y),
    width: snapSizeToGrid(layout.width),
    height: snapSizeToGrid(layout.height)
  };
}

function areLayoutsEqual(a: RoomLayout, b: RoomLayout) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function snapToGrid(value: number) {
  return snapByStep(value, CANVAS_POSITION_STEP);
}

function snapSizeToGrid(value: number) {
  const minSize = Math.max(NODE_MIN_SIZE, CANVAS_SIZE_STEP);
  if (value <= CANVAS_GRID_SIZE) {
    return minSize;
  }

  const snappedRemainder = snapByStep(value - CANVAS_GRID_SIZE, CANVAS_GRID_PITCH);
  return Math.max(minSize, CANVAS_GRID_SIZE + Math.max(0, snappedRemainder));
}

function resolveElementType(space: FacilitySpace | null): StructureElementType {
  if (!space) {
    return "room";
  }

  const metadata = asObject(space.metadataJson);
  const floorPlan = asObject(metadata.floorPlan);
  const metadataElementType = floorPlan.elementType;
  if (metadataElementType === "structure" || metadataElementType === "hallway" || metadataElementType === "entryway") {
    return "structure";
  }

  if (space.spaceKind === "room" || space.spaceKind === "court" || space.spaceKind === "field" || space.spaceKind === "custom") {
    return space.spaceKind;
  }

  return "room";
}

function toSpaceKind(elementType: StructureElementType): FacilitySpace["spaceKind"] {
  if (elementType === "structure") {
    return "custom";
  }

  return elementType;
}

function isNonBookableElementType(elementType: StructureElementType) {
  return elementType === "structure";
}

function resolveFacilitySpaceStatusChip(status: FacilitySpace["status"]) {
  switch (status) {
    case "open":
      return { label: "Open", color: "green" as const };
    case "closed":
      return { label: "Closed", color: "yellow" as const };
    case "archived":
      return { label: "Archived", color: "neutral" as const };
    default:
      return { label: status, color: "neutral" as const };
  }
}

function resolveFacilityNodeStateChip(elementType: StructureElementType, isBookable: boolean) {
  if (elementType === "structure") {
    return { label: "Structure", color: "neutral" as const };
  }

  if (isBookable) {
    return { label: "Bookable", color: "green" as const };
  }

  return { label: "Not bookable", color: "yellow" as const };
}

function resolveBuildingContext(selectedSpace: FacilitySpace, byId: Map<string, FacilitySpace>) {
  if (selectedSpace.spaceKind === "building") {
    return selectedSpace;
  }

  let cursor = selectedSpace.parentSpaceId;
  while (cursor) {
    const candidate = byId.get(cursor);
    if (!candidate) {
      return null;
    }

    if (candidate.spaceKind === "building") {
      return candidate;
    }

    cursor = candidate.parentSpaceId;
  }

  return null;
}

function isDescendantOf(space: FacilitySpace, ancestorId: string, byId: Map<string, FacilitySpace>) {
  let cursor = space.parentSpaceId;
  while (cursor) {
    if (cursor === ancestorId) {
      return true;
    }

    const parent = byId.get(cursor);
    if (!parent) {
      return false;
    }
    cursor = parent.parentSpaceId;
  }

  return false;
}

type FacilityStructurePanelProps = {
  orgSlug: string;
  selectedSpace: FacilitySpace;
  spaces: FacilitySpace[];
  canWrite: boolean;
  isMutating: boolean;
  onCreateSpace: (input: {
    parentSpaceId: string | null;
    name: string;
    slug: string;
    spaceKind: FacilitySpace["spaceKind"];
    status: FacilitySpace["status"];
    isBookable: boolean;
    timezone: string;
    capacity: number | null;
    sortIndex: number;
    metadataJson?: Record<string, unknown>;
  }) => void;
  onUpdateSpace: (input: {
    spaceId: string;
    parentSpaceId: string | null;
    name: string;
    slug: string;
    spaceKind: FacilitySpace["spaceKind"];
    status: FacilitySpace["status"];
    isBookable: boolean;
    timezone: string;
    capacity: number | null;
    sortIndex: number;
    metadataJson?: Record<string, unknown>;
  }) => void;
  onArchiveSpace: (spaceId: string) => void;
  onDeleteSpace: (spaceId: string) => void;
};

export function FacilityStructurePanel({
  orgSlug,
  selectedSpace,
  spaces,
  canWrite,
  isMutating: _isMutating,
  onCreateSpace,
  onUpdateSpace,
  onArchiveSpace,
  onDeleteSpace
}: FacilityStructurePanelProps) {
  const { confirm } = useConfirmDialog();
  const [structureSearch, setStructureSearch] = useState("");
  const [structureScale, setStructureScale] = useState(1);
  const [structureZoomPercent, setStructureZoomPercent] = useState(100);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);
  const [hoveredRoomId, setHoveredRoomId] = useState<string | null>(null);
  const [inlineCreateDraft, setInlineCreateDraft] = useState<InlineCreateDraft | null>(null);
  const [inlineCreateLayout, setInlineCreateLayout] = useState<RoomLayout | null>(null);
  const [nodeEditorDraft, setNodeEditorDraft] = useState<InlineEditDraft | null>(null);
  const [actionMenuRoomId, setActionMenuRoomId] = useState<string | null>(null);
  const [actionMenuPoint, setActionMenuPoint] = useState<{ x: number; y: number } | null>(null);
  const [actionMenuStamp, setActionMenuStamp] = useState(0);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isStructureCanvasEditMode, setIsStructureCanvasEditMode] = useState(false);
  const [hoverResizeEdgeByRoomId, setHoverResizeEdgeByRoomId] = useState<Record<string, ResizeEdge | null>>({});
  const [copiedRoomId, setCopiedRoomId] = useState<string | null>(null);
  const [pasteCount, setPasteCount] = useState(0);
  const [dragState, setDragState] = useState<
    | {
        mode: "move" | "resize";
        roomId: string;
        roomIds: string[];
        startX: number;
        startY: number;
        origin: RoomLayout;
        originsByRoomId?: Record<string, RoomLayout>;
        edge?: ResizeEdge;
        hasCrossedThreshold: boolean;
      }
    | null
  >(null);
  const [layoutDraftByRoomId, setLayoutDraftByRoomId] = useState<Record<string, RoomLayout>>({});
  const layoutDraftByRoomIdRef = useRef<Record<string, RoomLayout>>({});
  const structureCanvasRef = useRef<CanvasViewportHandle | null>(null);
  const structureSearchInputRef = useRef<HTMLInputElement | null>(null);
  const actionMenuAnchorRef = useRef<HTMLSpanElement | null>(null);
  const optimisticIdRef = useRef(0);
  const [optimisticSpaces, setOptimisticSpaces] = useState<FacilitySpace[]>(spaces);

  useEffect(() => {
    setOptimisticSpaces(spaces);
  }, [spaces]);

  const effectiveSpaces = optimisticSpaces;
  const selectedRoomIdSet = useMemo(() => new Set(selectedRoomIds), [selectedRoomIds]);

  function createSpaceOptimistically(input: Parameters<FacilityStructurePanelProps["onCreateSpace"]>[0]) {
    const now = new Date().toISOString();
    const optimisticId = `optimistic-space-${optimisticIdRef.current++}`;
    const optimisticSpace: FacilitySpace = {
      id: optimisticId,
      orgId: selectedSpace.orgId,
      parentSpaceId: input.parentSpaceId,
      name: input.name,
      slug: input.slug,
      spaceKind: input.spaceKind,
      status: input.status,
      isBookable: input.isBookable,
      timezone: input.timezone,
      capacity: input.capacity,
      metadataJson: input.metadataJson ?? {},
      statusLabelsJson: {},
      sortIndex: input.sortIndex,
      createdAt: now,
      updatedAt: now
    };

    setOptimisticSpaces((current) => [...current, optimisticSpace]);
    onCreateSpace(input);
  }

  function updateSpaceOptimistically(input: Parameters<FacilityStructurePanelProps["onUpdateSpace"]>[0]) {
    setOptimisticSpaces((current) =>
      current.map((space) =>
        space.id === input.spaceId
          ? {
              ...space,
              parentSpaceId: input.parentSpaceId,
              name: input.name,
              slug: input.slug,
              spaceKind: input.spaceKind,
              status: input.status,
              isBookable: input.isBookable,
              timezone: input.timezone,
              capacity: input.capacity,
              sortIndex: input.sortIndex,
              metadataJson: input.metadataJson ?? space.metadataJson,
              updatedAt: new Date().toISOString()
            }
          : space
      )
    );
    onUpdateSpace(input);
  }

  function deleteSpaceOptimistically(spaceId: string) {
    setOptimisticSpaces((current) => current.filter((space) => space.id !== spaceId));
    onDeleteSpace(spaceId);
  }

  function archiveSpaceOptimistically(spaceId: string) {
    setOptimisticSpaces((current) =>
      current.map((space) => (space.id === spaceId ? { ...space, status: "archived", updatedAt: new Date().toISOString() } : space))
    );
    onArchiveSpace(spaceId);
  }

  function clearNodeSelection() {
    setActiveRoomId(null);
    setSelectedRoomIds([]);
    setHoveredRoomId(null);
    setActionMenuRoomId(null);
    setActionMenuPoint(null);
  }

  function handleCanvasPointerDownCapture(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("[data-structure-node-id]")) {
      return;
    }

    clearNodeSelection();
  }

  const spaceById = useMemo(() => new Map(effectiveSpaces.map((space) => [space.id, space])), [effectiveSpaces]);
  const building = useMemo(() => resolveBuildingContext(selectedSpace, spaceById), [selectedSpace, spaceById]);
  const mappingRoot = building ?? selectedSpace;
  const rooms = useMemo(
    () =>
      effectiveSpaces
        .filter((space) => space.status !== "archived" && isRoomKind(space.spaceKind) && isDescendantOf(space, mappingRoot.id, spaceById))
        .sort((a, b) => a.sortIndex - b.sortIndex || a.name.localeCompare(b.name)),
    [effectiveSpaces, mappingRoot.id, spaceById]
  );

  const roomFitBounds = useMemo(() => {
    const fitLayouts: RoomLayout[] = rooms.map((room, index) => layoutDraftByRoomId[room.id] ?? getRoomLayout(room, index));

    if (fitLayouts.length === 0) {
      return null;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    fitLayouts.forEach((layout) => {
      minX = Math.min(minX, layout.x);
      minY = Math.min(minY, layout.y);
      maxX = Math.max(maxX, layout.x + layout.width);
      maxY = Math.max(maxY, layout.y + layout.height);
    });

    const padding = Math.max(16, CANVAS_GRID_SIZE);
    const left = Math.floor(minX - padding);
    const top = Math.floor(minY - padding);
    const width = Math.max(1, Math.ceil(maxX - minX + padding * 2));
    const height = Math.max(1, Math.ceil(maxY - minY + padding * 2));
    return { left, top, width, height };
  }, [layoutDraftByRoomId, rooms]);

  function handleFitToRooms(options?: { viewportOffsetX?: number; viewportOffsetY?: number; animated?: boolean }) {
    if (!roomFitBounds) {
      structureCanvasRef.current?.fitToView(options);
      return;
    }

    structureCanvasRef.current?.fitToBounds({
      x: roomFitBounds.left,
      y: roomFitBounds.top,
      width: roomFitBounds.width,
      height: roomFitBounds.height
    }, options);
  }

  useEffect(() => {
    const nextDraft: Record<string, RoomLayout> = {};
    rooms.forEach((room, index) => {
      nextDraft[room.id] = getRoomLayout(room, index);
    });

    layoutDraftByRoomIdRef.current = nextDraft;
    setLayoutDraftByRoomId(nextDraft);
  }, [rooms]);

  useEffect(() => {
    const roomIdSet = new Set(rooms.map((room) => room.id));
    setSelectedRoomIds((current) => current.filter((roomId) => roomIdSet.has(roomId)));
    setActiveRoomId((current) => (current && roomIdSet.has(current) ? current : null));
  }, [rooms]);

  const normalizedSearch = structureSearch.trim().toLowerCase();
  const normalizeSearchKey = useCallback((value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, ""), []);
  const matchingRooms = useMemo(() => {
    if (!normalizedSearch) {
      return [];
    }

    const queryKey = normalizeSearchKey(normalizedSearch);
    if (!queryKey) {
      return [];
    }

    return rooms.filter((room) => normalizeSearchKey(room.name).includes(queryKey));
  }, [normalizeSearchKey, normalizedSearch, rooms]);

  const actionMenuRoom = useMemo(
    () => (actionMenuRoomId ? (spaceById.get(actionMenuRoomId) ?? null) : null),
    [actionMenuRoomId, spaceById]
  );
  const canvasCenterTitle = mappingRoot.name;
  const mapCanEdit = canWrite && isStructureCanvasEditMode;

  useEffect(() => {
    if (!actionMenuRoomId) {
      return;
    }

    if (!spaceById.has(actionMenuRoomId)) {
      setActionMenuRoomId(null);
      setActionMenuPoint(null);
    }
  }, [actionMenuRoomId, spaceById]);

  function persistRoomLayout(roomId: string, layout: RoomLayout) {
    const room = spaceById.get(roomId);
    if (!room || !canWrite) {
      return;
    }

    const roundedLayout = roundLayout(layout);
    const metadata = asObject(room.metadataJson);
    const floorPlan = asObject(metadata.floorPlan);
    const existingLayout: RoomLayout = {
      x: snapToGrid(asNumber(floorPlan.x, roundedLayout.x)),
      y: snapToGrid(asNumber(floorPlan.y, roundedLayout.y)),
      width: snapSizeToGrid(asNumber(floorPlan.width, roundedLayout.width)),
      height: snapSizeToGrid(asNumber(floorPlan.height, roundedLayout.height))
    };
    if (areLayoutsEqual(existingLayout, roundedLayout)) {
      return;
    }

    updateSpaceOptimistically({
      spaceId: room.id,
      parentSpaceId: room.parentSpaceId,
      name: room.name,
      slug: room.slug,
      spaceKind: room.spaceKind,
      status: room.status,
      isBookable: room.isBookable,
      timezone: room.timezone,
      capacity: room.capacity,
      sortIndex: room.sortIndex,
      metadataJson: {
        ...metadata,
        floorPlan: {
          ...floorPlan,
          x: roundedLayout.x,
          y: roundedLayout.y,
          width: roundedLayout.width,
          height: roundedLayout.height
        }
      }
    });
  }

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.buttons === 0) {
        setDragState(null);
        return;
      }

      const dx = (event.clientX - dragState.startX) / Math.max(0.2, structureScale);
      const dy = (event.clientY - dragState.startY) / Math.max(0.2, structureScale);
      const hasCrossedThreshold =
        dragState.mode === "resize" || dragState.hasCrossedThreshold || Math.abs(dx) >= 4 || Math.abs(dy) >= 4;

      if (dragState.mode === "move" && !hasCrossedThreshold) {
        return;
      }

      if (!dragState.hasCrossedThreshold && hasCrossedThreshold) {
        setDragState((current) => (current ? { ...current, hasCrossedThreshold: true } : current));
      }

      setLayoutDraftByRoomId((current) => {
        const nextState = { ...current };
        if (dragState.mode === "move") {
          const origins = dragState.originsByRoomId ?? { [dragState.roomId]: dragState.origin };
          for (const moveRoomId of dragState.roomIds) {
            const origin = origins[moveRoomId];
            if (!origin) {
              continue;
            }
            const previous = current[moveRoomId] ?? origin;
            nextState[moveRoomId] = {
              ...previous,
              x: snapToGrid(origin.x + dx),
              y: snapToGrid(origin.y + dy)
            };
          }
        } else {
          const previous = current[dragState.roomId] ?? dragState.origin;
          const minWidth = NODE_MIN_SIZE;
          const minHeight = NODE_MIN_SIZE;
          let x = dragState.origin.x;
          let y = dragState.origin.y;
          let width = dragState.origin.width;
          let height = dragState.origin.height;
          const edge = dragState.edge ?? "se";

          if (edge.includes("e")) {
            width = Math.max(minWidth, snapSizeToGrid(dragState.origin.width + dx));
          }
          if (edge.includes("s")) {
            height = Math.max(minHeight, snapSizeToGrid(dragState.origin.height + dy));
          }
          if (edge.includes("w")) {
            const right = dragState.origin.x + dragState.origin.width;
            x = snapToGrid(dragState.origin.x + dx);
            width = right - x;
            if (width < minWidth) {
              width = minWidth;
              x = right - minWidth;
            }
          }
          if (edge.includes("n")) {
            const bottom = dragState.origin.y + dragState.origin.height;
            y = snapToGrid(dragState.origin.y + dy);
            height = bottom - y;
            if (height < minHeight) {
              height = minHeight;
              y = bottom - minHeight;
            }
          }

          width = Math.max(minWidth, snapSizeToGrid(width));
          height = Math.max(minHeight, snapSizeToGrid(height));
          nextState[dragState.roomId] = {
            ...previous,
            x,
            y,
            width,
            height
          };
        }

        layoutDraftByRoomIdRef.current = nextState;
        return nextState;
      });
    };

    const handlePointerUp = () => {
      if (dragState.mode === "move" && !dragState.hasCrossedThreshold) {
        setDragState(null);
        return;
      }

      if (dragState.mode === "move") {
        const origins = dragState.originsByRoomId ?? { [dragState.roomId]: dragState.origin };
        for (const moveRoomId of dragState.roomIds) {
          const fallbackLayout = origins[moveRoomId];
          if (!fallbackLayout) {
            continue;
          }
          const layout = layoutDraftByRoomIdRef.current[moveRoomId] ?? fallbackLayout;
          persistRoomLayout(moveRoomId, layout);
        }
      } else {
        const layout = layoutDraftByRoomIdRef.current[dragState.roomId] ?? dragState.origin;
        persistRoomLayout(dragState.roomId, layout);
      }
      setDragState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragState, structureScale]);

  function startInlineCreate(elementType: StructureElementType = "room") {
    const defaultName = elementType === "structure" ? "Structure" : "";
    setInlineCreateDraft({
      name: defaultName,
      elementType,
      isBookable: isNonBookableElementType(elementType) ? false : true,
    });
    setInlineCreateLayout({
      x: CANVAS_GRID_PITCH + (rooms.length % 5) * 200,
      y: CANVAS_GRID_PITCH + Math.floor(rooms.length / 5) * 150,
      width: CANVAS_GRID_SIZE * 8,
      height: CANVAS_GRID_SIZE * 5
    });
    setIsCreateOpen(true);
    setActiveRoomId(null);
    setSelectedRoomIds([]);
    setHoveredRoomId(null);
  }

  function openEditRoomPanel(room: FacilitySpace) {
    setActionMenuRoomId(null);
    setActionMenuPoint(null);
    setActiveRoomId(room.id);
    setSelectedRoomIds([room.id]);
    setNodeEditorDraft({
      spaceId: room.id,
      name: room.name,
      elementType: resolveElementType(room),
      status: room.status,
      isBookable: room.isBookable
    });
    setIsEditOpen(true);
  }

  function submitNodeEditor() {
    if (!canWrite || !nodeEditorDraft) {
      return;
    }

    const room = spaceById.get(nodeEditorDraft.spaceId);
    if (!room) {
      return;
    }

    const name = nodeEditorDraft.name.trim();
    if (name.length < 2) {
      return;
    }

    const existingMetadata = room ? asObject(room.metadataJson) : {};
    updateSpaceOptimistically({
      spaceId: nodeEditorDraft.spaceId,
      parentSpaceId: room.parentSpaceId,
      name,
      slug: room.slug || slugify(name),
      spaceKind: toSpaceKind(nodeEditorDraft.elementType),
      status: nodeEditorDraft.status,
      isBookable: isNonBookableElementType(nodeEditorDraft.elementType) ? false : nodeEditorDraft.isBookable,
      timezone: room.timezone,
      capacity: room.capacity,
      sortIndex: room.sortIndex,
      metadataJson: {
        ...existingMetadata,
        floorPlan: {
          ...asObject(existingMetadata.floorPlan),
          elementType: nodeEditorDraft.elementType
        }
      }
    });
    setIsEditOpen(false);
  }

  function submitInlineCreate() {
    if (!canWrite || !inlineCreateDraft || !inlineCreateLayout) {
      return;
    }

    const name = inlineCreateDraft.name.trim();
    if (name.length < 2) {
      return;
    }

    const usedSlugs = new Set(effectiveSpaces.map((candidate) => candidate.slug));
    const baseSlug = slugify(name);
    let slug = baseSlug;
    let index = 2;
    while (usedSlugs.has(slug)) {
      slug = `${baseSlug}-${index}`;
      index += 1;
    }

    createSpaceOptimistically({
      parentSpaceId: mappingRoot.id,
      name,
      slug,
      spaceKind: toSpaceKind(inlineCreateDraft.elementType),
      status: "open",
      isBookable: isNonBookableElementType(inlineCreateDraft.elementType) ? false : inlineCreateDraft.isBookable,
      timezone: mappingRoot.timezone,
      capacity: null,
      sortIndex: rooms.length,
      metadataJson: {
        floorPlan: {
          x: inlineCreateLayout.x,
          y: inlineCreateLayout.y,
          width: inlineCreateLayout.width,
          height: inlineCreateLayout.height,
          elementType: inlineCreateDraft.elementType
        }
      }
    });

    setInlineCreateDraft(null);
    setInlineCreateLayout(null);
    setIsCreateOpen(false);
  }

  function focusRoomFromSearch(query: string) {
    const normalizedQuery = normalizeSearchKey(query.trim());
    if (!normalizedQuery) {
      return;
    }

    const exact = matchingRooms.find((room) => normalizeSearchKey(room.name) === normalizedQuery);
    const target = exact ?? matchingRooms[0];
    if (!target) {
      return;
    }

    setActiveRoomId(target.id);
    setSelectedRoomIds([target.id]);
    const node = document.querySelector(`[data-structure-node-id="${target.id}"]`);
    if (node instanceof HTMLElement) {
      structureCanvasRef.current?.focusElement(node, { targetScale: 1.3 });
    }
    openEditRoomPanel(target);
  }

  function duplicateRoomWithOffset(room: FacilitySpace, offsetMultiplier = 1) {
    if (!canWrite) {
      return;
    }

    const roomLayout = layoutDraftByRoomId[room.id] ?? getRoomLayout(room, 0);
    const metadata = asObject(room.metadataJson);
    const floorPlan = asObject(metadata.floorPlan);
    const usedNames = new Set(rooms.map((candidate) => candidate.name.toLowerCase()));
    const usedSlugs = new Set(effectiveSpaces.map((candidate) => candidate.slug));
    const baseName = `${room.name} Copy`;
    const baseSlug = `${room.slug || slugify(room.name)}-copy`;
    let nextName = baseName;
    let counter = 2;
    while (usedNames.has(nextName.toLowerCase())) {
      nextName = `${baseName} ${counter}`;
      counter += 1;
    }

    let nextSlug = baseSlug;
    let slugCounter = 2;
    while (usedSlugs.has(nextSlug)) {
      nextSlug = `${baseSlug}-${slugCounter}`;
      slugCounter += 1;
    }

    const offset = CANVAS_GRID_PITCH * Math.max(1, offsetMultiplier);
    const baseLayout: RoomLayout = {
      x: snapToGrid(roomLayout.x + offset),
      y: snapToGrid(roomLayout.y + offset),
      width: roomLayout.width,
      height: roomLayout.height
    };
    createSpaceOptimistically({
      parentSpaceId: mappingRoot.id,
      name: nextName,
      slug: nextSlug,
      spaceKind: room.spaceKind,
      status: room.status,
      isBookable: room.isBookable,
      timezone: room.timezone,
      capacity: room.capacity,
      sortIndex: rooms.length,
      metadataJson: {
        ...metadata,
        floorPlan: {
          ...floorPlan,
          x: baseLayout.x,
          y: baseLayout.y,
          width: baseLayout.width,
          height: baseLayout.height
        }
      }
    });
  }

  function duplicateRoom(room: FacilitySpace) {
    duplicateRoomWithOffset(room, 1);
  }

  async function deleteRoom(spaceId: string) {
    if (!canWrite) {
      return;
    }

    const target = spaceById.get(spaceId);
    const targetName = target?.name ?? "this space";
    const shouldDelete = await confirm({
      title: "Delete space?",
      description: `Delete ${targetName}? This cannot be undone.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      variant: "destructive"
    });
    if (!shouldDelete) {
      return;
    }

    deleteSpaceOptimistically(spaceId);
    if (activeRoomId === spaceId) {
      setActiveRoomId(null);
    }
    setSelectedRoomIds((current) => current.filter((roomId) => roomId !== spaceId));
    if (actionMenuRoomId === spaceId) {
      setActionMenuRoomId(null);
      setActionMenuPoint(null);
    }
    if (nodeEditorDraft?.spaceId === spaceId) {
      setNodeEditorDraft(null);
      setIsEditOpen(false);
    }
  }

  useEffect(() => {
    const shouldIgnoreTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      if (target.isContentEditable) {
        return true;
      }

      return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!mapCanEdit || shouldIgnoreTarget(event.target)) {
        return;
      }

      const activeRoom = activeRoomId ? (spaceById.get(activeRoomId) ?? null) : null;
      const isCopy = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c";
      const isPaste = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v";
      const isDelete = event.key === "Delete" || event.key === "Backspace";

      if (isCopy) {
        if (!activeRoom) {
          return;
        }
        event.preventDefault();
        setCopiedRoomId(activeRoom.id);
        setPasteCount(0);
        return;
      }

      if (isPaste) {
        const sourceId = copiedRoomId ?? activeRoomId;
        if (!sourceId) {
          return;
        }

        const sourceRoom = spaceById.get(sourceId);
        if (!sourceRoom) {
          return;
        }

        event.preventDefault();
        const nextPasteCount = pasteCount + 1;
        duplicateRoomWithOffset(sourceRoom, nextPasteCount);
        setCopiedRoomId(sourceRoom.id);
        setPasteCount(nextPasteCount);
        return;
      }

      if (isDelete && activeRoom) {
        event.preventDefault();
        void deleteRoom(activeRoom.id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeRoomId, copiedRoomId, mapCanEdit, pasteCount, spaceById]);

  useEffect(() => {
    if (!dragState) {
      document.body.style.removeProperty("cursor");
      return;
    }

    if (dragState.mode === "move") {
      document.body.style.cursor = "grabbing";
      return () => {
        document.body.style.removeProperty("cursor");
      };
    }

    if (dragState.mode === "resize") {
      document.body.style.cursor = edgeToCursor(dragState.edge ?? "se");
      return () => {
        document.body.style.removeProperty("cursor");
      };
    }
  }, [dragState]);

  return (
    <>
      <Card>
        <CardHeader className="pb-6">
          <CardTitle>Facility structure</CardTitle>
          <CardDescription>Top-down space planning for rooms, zones, and bookable layout mapping.</CardDescription>
        </CardHeader>
        <CardContent>
            <div onPointerDownCapture={handleCanvasPointerDownCapture}>
              <StructureCanvas
                addButtonAriaLabel="Add space"
                addButtonDisabled={!canWrite}
                autoFitKey={
                  roomFitBounds
                    ? `${roomFitBounds.left},${roomFitBounds.top},${roomFitBounds.width},${roomFitBounds.height}`
                    : `rooms:${rooms.length}`
                }
                canvasRef={structureCanvasRef}
                dragInProgress={Boolean(dragState)}
                editContent={
                  <>
                    {rooms.map((room) => {
                      const layout = roundLayout(layoutDraftByRoomId[room.id] ?? getRoomLayout(room, 0));
                      const isActive = activeRoomId === room.id;
                      const isSelected = selectedRoomIdSet.has(room.id);
                      const dragMode = dragState?.mode;
                      const dragEdge = dragState?.edge;
                      const isDraggingThisRoom = Boolean(
                        dragState &&
                          (dragState.mode === "move" ? dragState.roomIds.includes(room.id) : dragState.roomId === room.id)
                      );
                      const showControls = mapCanEdit && (isActive || hoveredRoomId === room.id);
                      const elementType = resolveElementType(room);
                      const isStructuralElement = elementType === "structure";
                      const spaceStatusChip = resolveFacilitySpaceStatusChip(room.status);
                      const nodeStateChip = resolveFacilityNodeStateChip(elementType, room.isBookable);

                      return (
                        <div
                          data-structure-node-id={room.id}
                          className={`absolute rounded-control border px-2 py-1 shadow-sm transition-[left,top,width,height,transform,box-shadow,border-color,background-color] duration-100 ease-out ${
                            isDraggingThisRoom ? "transition-none shadow-lg" : ""
                          } ${
                            isActive
                              ? "border-accent bg-accent/10"
                              : isSelected
                                ? "border-accent/60 bg-accent/5"
                              : isStructuralElement
                                ? "border-dashed border-border/80 bg-surface/70"
                                : "border-border bg-surface"
                          }`}
                          key={room.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (event.shiftKey) {
                              return;
                            }

                            setActiveRoomId(room.id);
                            setSelectedRoomIds([room.id]);
                            if (mapCanEdit) {
                              setActionMenuRoomId(room.id);
                              setActionMenuPoint({ x: event.clientX, y: event.clientY });
                              setActionMenuStamp((current) => current + 1);
                            } else {
                              setActionMenuRoomId(null);
                              setActionMenuPoint(null);
                            }
                          }}
                          onDoubleClick={(event) => {
                            if (!mapCanEdit) {
                              return;
                            }
                            event.preventDefault();
                            event.stopPropagation();
                            openEditRoomPanel(room);
                          }}
                          onPointerEnter={() => setHoveredRoomId(room.id)}
                          onPointerLeave={() => {
                            setHoveredRoomId((current) => (current === room.id ? null : current));
                            setHoverResizeEdgeByRoomId((current) => ({ ...current, [room.id]: null }));
                          }}
                          onPointerMove={(event) => {
                            if (!mapCanEdit) {
                              return;
                            }

                            const rect = event.currentTarget.getBoundingClientRect();
                            const localX = event.clientX - rect.left;
                            const localY = event.clientY - rect.top;
                            const edge = getResizeEdgeFromPoint(localX, localY, rect.width, rect.height);
                            setHoverResizeEdgeByRoomId((current) => {
                              if (current[room.id] === edge) {
                                return current;
                              }
                              return { ...current, [room.id]: edge };
                            });
                          }}
                          onPointerDown={(event) => {
                            if (!mapCanEdit) {
                              return;
                            }

                            event.preventDefault();
                            event.stopPropagation();
                            if (event.button !== 0) {
                              return;
                            }
                            const rect = event.currentTarget.getBoundingClientRect();
                            const localX = event.clientX - rect.left;
                            const localY = event.clientY - rect.top;
                            const edge = getResizeEdgeFromPoint(localX, localY, rect.width, rect.height);
                            setActiveRoomId(room.id);
                            const shiftSelection = event.shiftKey
                              ? selectedRoomIdSet.has(room.id)
                                ? selectedRoomIds
                                : [...selectedRoomIds, room.id]
                              : null;
                            const moveRoomIds =
                              shiftSelection && shiftSelection.length > 1
                                ? shiftSelection
                                : selectedRoomIdSet.has(room.id) && selectedRoomIds.length > 0
                                  ? selectedRoomIds
                                  : [room.id];
                            const originsByRoomId: Record<string, RoomLayout> = {};
                            for (const moveRoomId of moveRoomIds) {
                              const originLayout = layoutDraftByRoomIdRef.current[moveRoomId];
                              if (originLayout) {
                                originsByRoomId[moveRoomId] = originLayout;
                              }
                            }
                            if (shiftSelection) {
                              setSelectedRoomIds(shiftSelection);
                            } else if (!selectedRoomIdSet.has(room.id)) {
                              setSelectedRoomIds([room.id]);
                            }
                            if (edge) {
                              setDragState({
                                mode: "resize",
                                roomId: room.id,
                                roomIds: [room.id],
                                startX: event.clientX,
                                startY: event.clientY,
                                origin: layout,
                                edge,
                                hasCrossedThreshold: true
                              });
                              return;
                            }
                            setDragState({
                              mode: "move",
                              roomId: room.id,
                              roomIds: moveRoomIds,
                              startX: event.clientX,
                              startY: event.clientY,
                              origin: layout,
                              originsByRoomId,
                              hasCrossedThreshold: false
                            });
                          }}
                          style={{
                            left: `${layout.x}px`,
                            top: `${layout.y}px`,
                            width: `${layout.width}px`,
                            height: `${layout.height}px`,
                            zIndex: isActive ? 20 : 1,
                            transform: isDraggingThisRoom ? "scale(1.006)" : "scale(1)",
                            cursor: isDraggingThisRoom
                              ? dragMode === "resize"
                                ? edgeToCursor(dragEdge ?? "se")
                                : "grabbing"
                              : hoverResizeEdgeByRoomId[room.id]
                                ? edgeToCursor(hoverResizeEdgeByRoomId[room.id] as ResizeEdge)
                                : mapCanEdit
                                  ? "grab"
                                  : "default"
                          }}
                        >
                          <div className="pointer-events-none absolute inset-0">
                            <div className="pointer-events-none flex h-full w-full items-center justify-center" data-canvas-pan-ignore="true">
                              <div className="group relative inline-flex max-w-[86%] items-center rounded-full border border-border/70 bg-surface/95 px-4 py-1.5 text-center shadow-sm">
                                <div className="min-w-0 px-1.5 text-center">
                                  <span className="flex min-w-0 w-full max-w-[16rem] flex-col items-center leading-tight">
                                    <span className="block w-full truncate text-center text-xs font-semibold text-text" title={room.name}>
                                      {room.name}
                                    </span>
                                    <span className="mt-1 flex flex-wrap items-center justify-center gap-1">
                                      <Chip className="normal-case tracking-normal" color={spaceStatusChip.color} size="compact" variant="flat">
                                        {spaceStatusChip.label}
                                      </Chip>
                                      <Chip className="normal-case tracking-normal" color={nodeStateChip.color} size="compact" variant="flat">
                                        {nodeStateChip.label}
                                      </Chip>
                                    </span>
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          {showControls ? (
                            <>
                              {(
                                [
                                  ["n", "absolute -top-1 left-1/2 h-2 w-10 -translate-x-1/2 cursor-n-resize"],
                                  ["s", "absolute -bottom-1 left-1/2 h-2 w-10 -translate-x-1/2 cursor-s-resize"],
                                  ["e", "absolute right-0 top-1/2 h-10 w-2 -translate-y-1/2 cursor-e-resize"],
                                  ["w", "absolute left-0 top-1/2 h-10 w-2 -translate-y-1/2 cursor-w-resize"],
                                  ["ne", "absolute -right-1 -top-1 h-3 w-3 cursor-ne-resize"],
                                  ["nw", "absolute -left-1 -top-1 h-3 w-3 cursor-nw-resize"],
                                  ["se", "absolute -bottom-1 -right-1 h-3 w-3 cursor-se-resize"],
                                  ["sw", "absolute -bottom-1 -left-1 h-3 w-3 cursor-sw-resize"]
                                ] as Array<[ResizeEdge, string]>
                              ).map(([edge, className]) => (
                                <button
                                  aria-label={`Resize ${edge}`}
                                  className={`${className} rounded-sm border border-border bg-surface/95`}
                                  key={edge}
                                  onPointerDown={(event) => {
                                    if (!mapCanEdit) {
                                      return;
                                    }

                                    event.preventDefault();
                                    event.stopPropagation();
                                    setActiveRoomId(room.id);
                                    setDragState({
                                      mode: "resize",
                                      roomId: room.id,
                                      roomIds: [room.id],
                                      startX: event.clientX,
                                      startY: event.clientY,
                                      origin: layout,
                                      edge,
                                      hasCrossedThreshold: true
                                    });
                                  }}
                                  type="button"
                                />
                              ))}
                            </>
                          ) : null}
                        </div>
                      );
                    })}
                  </>
                }
                emptyState={rooms.length === 0 ? <Alert variant="info">No mapped spaces yet. Add one to start building this layout.</Alert> : null}
                facilityRootId={mappingRoot.id}
                facilitySpaces={effectiveSpaces}
                mapMode="facility"
                onAdd={() => startInlineCreate("room")}
                onEditOpenChange={setIsStructureCanvasEditMode}
                onFacilitySelect={(space) => {
                  setActiveRoomId(space.id);
                  setSelectedRoomIds([space.id]);
                }}
                onFit={handleFitToRooms}
                onSearchQueryChange={setStructureSearch}
                onSearchSubmit={focusRoomFromSearch}
                onViewNodeSelect={(nodeId) => {
                  setActiveRoomId(nodeId);
                  setSelectedRoomIds([nodeId]);
                  setActionMenuRoomId(null);
                  setActionMenuPoint(null);
                }}
                onViewScaleChange={(scale) => {
                  setStructureScale(scale);
                  setStructureZoomPercent(Math.round(scale * 100));
                }}
                persistViewState={false}
                popupSubtitle="Edit structure map, rooms, and layout."
                popupTitle={`Editing map: ${canvasCenterTitle}`}
                rootHeader={null}
                searchInputRef={structureSearchInputRef}
                searchPlaceholder="Search spaces"
                searchQuery={structureSearch}
                searchResults={matchingRooms.map((room) => ({
                  id: room.id,
                  name: room.name,
                  kindLabel: resolveElementType(room)
                }))}
                storageKey={`facility-floorplan-canvas:${orgSlug}:${mappingRoot.id}`}
                autoFitOnOpen
                canvasLayoutMode="free"
                canvasContentClassName="p-0"
                canvasGridSize={CANVAS_GRID_SIZE}
                canvasGridColor="hsl(var(--border) / 0.55)"
                viewContentInteractive
                viewEditButtonPlacement="top-right"
                viewViewportInteractive
                zoomPercent={structureZoomPercent}
              />
            </div>
          <Panel
            footer={
              <>
                <Button onClick={() => setIsEditOpen(false)} size="sm" type="button" variant="ghost">
                  Cancel
                </Button>
                <Button disabled={!canWrite || !nodeEditorDraft || nodeEditorDraft.name.trim().length < 2} onClick={submitNodeEditor} size="sm" type="button" variant="secondary">
                  Save
                </Button>
              </>
            }
            onClose={() => setIsEditOpen(false)}
            open={isEditOpen}
            panelClassName="ml-auto max-w-[340px]"
            subtitle="Modify this space and apply updates."
            title="Edit space"
          >
            {nodeEditorDraft ? (
              <div className="w-full space-y-3">
                <FormField label="Name">
                <Input
                  onChange={(event) => setNodeEditorDraft((current) => (current ? { ...current, name: event.target.value } : current))}
                  value={nodeEditorDraft.name}
                />
                </FormField>
                <FormField label="Type">
                <Select
                  onChange={(event) =>
                    setNodeEditorDraft((current) => {
                      if (!current) {
                        return current;
                      }
                      const elementType = event.target.value as StructureElementType;
                      return {
                        ...current,
                        elementType,
                        isBookable: isNonBookableElementType(elementType) ? false : current.isBookable
                      };
                    })
                  }
                  options={[
                    { value: "room", label: "Room" },
                    { value: "court", label: "Court" },
                    { value: "field", label: "Field" },
                    { value: "custom", label: "Custom" },
                    { value: "structure", label: "Structure (non-bookable)" }
                  ]}
                  value={nodeEditorDraft.elementType}
                />
                </FormField>
                <FormField label="Status">
                <Select
                  onChange={(event) =>
                    setNodeEditorDraft((current) => (current ? { ...current, status: event.target.value as FacilitySpace["status"] } : current))
                  }
                  options={[
                    { value: "open", label: "Open" },
                    { value: "closed", label: "Closed" },
                    { value: "archived", label: "Archived" }
                  ]}
                  value={nodeEditorDraft.status}
                />
                </FormField>
                <label className="ui-inline-toggle">
                  <Checkbox
                    checked={isNonBookableElementType(nodeEditorDraft.elementType) ? false : nodeEditorDraft.isBookable}
                    disabled={isNonBookableElementType(nodeEditorDraft.elementType)}
                    onChange={(event) =>
                      setNodeEditorDraft((current) => (current ? { ...current, isBookable: event.target.checked } : current))
                    }
                  />
                  Bookable
                </label>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    disabled={!canWrite}
                    onClick={() => {
                      archiveSpaceOptimistically(nodeEditorDraft.spaceId);
                      setIsEditOpen(false);
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Archive
                  </Button>
                </div>
              </div>
            ) : null}
          </Panel>
          <Popup
            onClose={() => {
              setIsCreateOpen(false);
              setInlineCreateDraft(null);
              setInlineCreateLayout(null);
            }}
            open={isCreateOpen && Boolean(inlineCreateDraft)}
            size="sm"
            subtitle="Create a new space and place it on the map instantly."
            title="Create space"
          >
            {inlineCreateDraft ? (
              <div className="space-y-3">
                <FormField label="Name">
                  <Input
                    autoFocus
                    onChange={(event) => setInlineCreateDraft((current) => (current ? { ...current, name: event.target.value } : current))}
                    onFocus={(event) => event.currentTarget.select()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        submitInlineCreate();
                      }
                    }}
                    placeholder="Space name"
                    value={inlineCreateDraft.name}
                  />
                </FormField>
                <FormField label="Type">
                  <Select
                    onChange={(event) =>
                      setInlineCreateDraft((current) => {
                        if (!current) {
                          return current;
                        }
                        const elementType = event.target.value as StructureElementType;
                        return {
                          ...current,
                          elementType,
                          isBookable: isNonBookableElementType(elementType) ? false : current.isBookable
                        };
                      })
                    }
                    options={[
                      { value: "room", label: "Room" },
                      { value: "court", label: "Court" },
                      { value: "field", label: "Field" },
                      { value: "custom", label: "Custom" },
                      { value: "structure", label: "Structure" }
                    ]}
                    value={inlineCreateDraft.elementType}
                  />
                </FormField>
                <label className="ui-inline-toggle">
                  <Checkbox
                    checked={isNonBookableElementType(inlineCreateDraft.elementType) ? false : inlineCreateDraft.isBookable}
                    disabled={isNonBookableElementType(inlineCreateDraft.elementType)}
                    onChange={(event) =>
                      setInlineCreateDraft((current) => (current ? { ...current, isBookable: event.target.checked } : current))
                    }
                  />
                  Bookable
                </label>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    onClick={() => {
                      setIsCreateOpen(false);
                      setInlineCreateDraft(null);
                      setInlineCreateLayout(null);
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={inlineCreateDraft.name.trim().length < 2}
                    onClick={submitInlineCreate}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : null}
          </Popup>
        </CardContent>
      </Card>
      <span
        aria-hidden
        className="pointer-events-none fixed h-px w-px"
        ref={actionMenuAnchorRef}
        style={
          actionMenuPoint
            ? {
                left: `${actionMenuPoint.x}px`,
                top: `${actionMenuPoint.y}px`
              }
            : {
                left: "-9999px",
                top: "-9999px"
              }
        }
      />
      <Popover
        anchorRef={actionMenuAnchorRef}
        className="w-auto rounded-[999px] border border-border/70 bg-surface/95 p-1 shadow-floating backdrop-blur"
        key={`node-actions:${actionMenuRoomId ?? "none"}:${actionMenuStamp}`}
        offset={10}
        onClose={() => {
          setActionMenuRoomId(null);
          setActionMenuPoint(null);
        }}
        open={Boolean(actionMenuRoom && mapCanEdit && actionMenuPoint)}
        placement="bottom-start"
      >
        <div className="flex items-center gap-1">
          <Button
            aria-label="Node settings"
            className="h-8 w-8 rounded-full p-0"
            onClick={() => {
              if (!actionMenuRoom) {
                return;
              }
              openEditRoomPanel(actionMenuRoom);
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
          <Button
            aria-label="Duplicate node"
            className="h-8 w-8 rounded-full p-0"
            disabled={!mapCanEdit}
            onClick={() => {
              if (!actionMenuRoom) {
                return;
              }
              duplicateRoom(actionMenuRoom);
              setActionMenuRoomId(null);
              setActionMenuPoint(null);
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            aria-label="Delete node"
            className="h-8 w-8 rounded-full p-0 text-danger"
            onClick={() => {
              if (!actionMenuRoom) {
                return;
              }
              void deleteRoom(actionMenuRoom.id);
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </Popover>

    </>
  );
}
