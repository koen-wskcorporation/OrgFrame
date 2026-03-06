"use client";

import { Copy, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { type CanvasViewportHandle } from "@/components/ui/canvas-viewport";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StructureCanvasShell } from "@/modules/core/components/StructureCanvasShell";
import type { FacilitySpace } from "@/modules/facilities/types";

type StructureElementType = "room" | "court" | "field" | "custom" | "structure";

type SpaceDraft = {
  spaceId?: string;
  parentSpaceId: string;
  name: string;
  slug: string;
  elementType: StructureElementType;
  status: FacilitySpace["status"];
  isBookable: boolean;
  timezone: string;
  capacity: string;
};

type RoomLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const FLOOR_MIN_WIDTH = 900;
const FLOOR_MIN_HEIGHT = 600;
const FLOOR_GRID_SIZE = 25;
const FLOOR_CONTENT_PADDING = FLOOR_GRID_SIZE;
const FLOOR_EDGE_INSET = FLOOR_GRID_SIZE;

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

function getRoomLayout(space: FacilitySpace, index: number): RoomLayout {
  const metadata = asObject(space.metadataJson);
  const floorPlan = asObject(metadata.floorPlan);
  const fallbackX = FLOOR_GRID_SIZE + (index % 6) * 200;
  const fallbackY = FLOOR_GRID_SIZE + Math.floor(index / 6) * 150;
  const rawWidth = Math.max(FLOOR_GRID_SIZE * 3, asNumber(floorPlan.width, FLOOR_GRID_SIZE * 8));
  const rawHeight = Math.max(FLOOR_GRID_SIZE * 2, asNumber(floorPlan.height, FLOOR_GRID_SIZE * 5));

  return {
    x: Math.max(FLOOR_EDGE_INSET, snapToGrid(asNumber(floorPlan.x, fallbackX))),
    y: Math.max(FLOOR_EDGE_INSET, snapToGrid(asNumber(floorPlan.y, fallbackY))),
    width: snapToGrid(rawWidth),
    height: snapToGrid(rawHeight)
  };
}

function roundLayout(layout: RoomLayout): RoomLayout {
  return {
    x: Math.round(layout.x),
    y: Math.round(layout.y),
    width: Math.round(layout.width),
    height: Math.round(layout.height)
  };
}

function areLayoutsEqual(a: RoomLayout, b: RoomLayout) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function snapToGrid(value: number) {
  return Math.round(value / FLOOR_GRID_SIZE) * FLOOR_GRID_SIZE;
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

function toDraft(space: FacilitySpace | null, parentSpaceId: string): SpaceDraft {
  return {
    spaceId: space?.id,
    parentSpaceId: space?.parentSpaceId ?? parentSpaceId,
    name: space?.name ?? "",
    slug: space?.slug ?? "",
    elementType: resolveElementType(space),
    status: space?.status ?? "open",
    isBookable: space?.isBookable ?? true,
    timezone: space?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    capacity: space?.capacity?.toString() ?? ""
  };
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
  isMutating,
  onCreateSpace,
  onUpdateSpace,
  onArchiveSpace,
  onDeleteSpace
}: FacilityStructurePanelProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [structureSearch, setStructureSearch] = useState("");
  const [structureScale, setStructureScale] = useState(1);
  const [structureZoomPercent, setStructureZoomPercent] = useState(100);
  const [showFloorLayering, setShowFloorLayering] = useState(false);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [hoveredRoomId, setHoveredRoomId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SpaceDraft>(() => toDraft(null, selectedSpace.id));
  const [selectedFloorId, setSelectedFloorId] = useState<string>("");
  const [autoFloorSeededForBuildingId, setAutoFloorSeededForBuildingId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<
    | {
        mode: "move" | "resize";
        roomId: string;
        startX: number;
        startY: number;
        origin: RoomLayout;
        edge?: ResizeEdge;
        hasCrossedThreshold: boolean;
      }
    | null
  >(null);
  const [layoutDraftByRoomId, setLayoutDraftByRoomId] = useState<Record<string, RoomLayout>>({});
  const layoutDraftByRoomIdRef = useRef<Record<string, RoomLayout>>({});
  const structureCanvasRef = useRef<CanvasViewportHandle | null>(null);
  const structureSearchInputRef = useRef<HTMLInputElement | null>(null);

  const spaceById = useMemo(() => new Map(spaces.map((space) => [space.id, space])), [spaces]);
  const building = useMemo(() => resolveBuildingContext(selectedSpace, spaceById), [selectedSpace, spaceById]);
  const floors = useMemo(() => {
    if (!building) {
      return [];
    }

    return spaces
      .filter((space) => space.parentSpaceId === building.id && space.spaceKind === "floor" && space.status !== "archived")
      .sort((a, b) => a.sortIndex - b.sortIndex || a.name.localeCompare(b.name));
  }, [building, spaces]);

  useEffect(() => {
    if (floors.length === 0) {
      setSelectedFloorId("");
      return;
    }

    if (!selectedFloorId || !floors.some((floor) => floor.id === selectedFloorId)) {
      setSelectedFloorId(floors[0]?.id ?? "");
    }
  }, [floors, selectedFloorId]);

  useEffect(() => {
    if (!building || floors.length > 0 || !canWrite || isMutating || autoFloorSeededForBuildingId === building.id) {
      return;
    }

    setAutoFloorSeededForBuildingId(building.id);
    onCreateSpace({
      parentSpaceId: building.id,
      name: "Floor 1",
      slug: slugify(`${building.slug}-floor-1`),
      spaceKind: "floor",
      status: "open",
      isBookable: false,
      timezone: building.timezone,
      capacity: null,
      sortIndex: 0,
      metadataJson: {
        floorPlan: {
          canvas: {
            width: 1400,
            height: 900
          }
        }
      }
    });
  }, [autoFloorSeededForBuildingId, building, canWrite, floors.length, isMutating, onCreateSpace]);

  const selectedFloor = selectedFloorId ? (spaceById.get(selectedFloorId) ?? null) : null;
  const roomsByFloorId = useMemo(() => {
    const grouped = new Map<string, FacilitySpace[]>();
    for (const floor of floors) {
      grouped.set(floor.id, []);
    }

    for (const space of spaces) {
      if (!space.parentSpaceId || !isRoomKind(space.spaceKind) || space.status === "archived") {
        continue;
      }

      const bucket = grouped.get(space.parentSpaceId);
      if (!bucket) {
        continue;
      }

      bucket.push(space);
    }

    for (const [floorId, floorRooms] of grouped.entries()) {
      grouped.set(
        floorId,
        floorRooms.sort((a, b) => a.sortIndex - b.sortIndex || a.name.localeCompare(b.name))
      );
    }

    return grouped;
  }, [floors, spaces]);

  const rooms = useMemo(() => {
    if (!selectedFloorId) {
      return [];
    }
    return roomsByFloorId.get(selectedFloorId) ?? [];
  }, [roomsByFloorId, selectedFloorId]);

  const largestFloorCanvasSize = useMemo(() => {
    let width = FLOOR_MIN_WIDTH;
    let height = FLOOR_MIN_HEIGHT;

    for (const floor of floors) {
      const floorRooms = roomsByFloorId.get(floor.id) ?? [];
      let maxX = FLOOR_MIN_WIDTH;
      let maxY = FLOOR_MIN_HEIGHT;

      floorRooms.forEach((room, index) => {
        const layout =
          floor.id === selectedFloorId ? (layoutDraftByRoomId[room.id] ?? getRoomLayout(room, index)) : getRoomLayout(room, index);
        maxX = Math.max(maxX, layout.x + layout.width + FLOOR_CONTENT_PADDING);
        maxY = Math.max(maxY, layout.y + layout.height + FLOOR_CONTENT_PADDING);
      });

      width = Math.max(width, Math.ceil(maxX));
      height = Math.max(height, Math.ceil(maxY));
    }

    return { width, height };
  }, [floors, layoutDraftByRoomId, roomsByFloorId, selectedFloorId]);

  const renderedCanvasSize = useMemo(() => {
    let maxX = FLOOR_MIN_WIDTH;
    let maxY = FLOOR_MIN_HEIGHT;

    rooms.forEach((room, index) => {
      const layout = layoutDraftByRoomId[room.id] ?? getRoomLayout(room, index);
      maxX = Math.max(maxX, layout.x + layout.width + FLOOR_CONTENT_PADDING);
      maxY = Math.max(maxY, layout.y + layout.height + FLOOR_CONTENT_PADDING);
    });

    return {
      width: Math.max(largestFloorCanvasSize.width, Math.ceil(maxX)),
      height: Math.max(largestFloorCanvasSize.height, Math.ceil(maxY))
    };
  }, [largestFloorCanvasSize.height, largestFloorCanvasSize.width, layoutDraftByRoomId, rooms]);

  useEffect(() => {
    const nextDraft: Record<string, RoomLayout> = {};
    rooms.forEach((room, index) => {
      nextDraft[room.id] = getRoomLayout(room, index);
    });

    layoutDraftByRoomIdRef.current = nextDraft;
    setLayoutDraftByRoomId(nextDraft);
  }, [rooms, selectedFloorId]);

  const normalizedSearch = structureSearch.trim().toLowerCase();
  const matchingRooms = useMemo(() => {
    if (!normalizedSearch) {
      return [];
    }

    return rooms.filter((room) => room.name.toLowerCase().includes(normalizedSearch));
  }, [normalizedSearch, rooms]);

  const layeredRooms = useMemo(() => {
    if (!showFloorLayering) {
      return [];
    }

    return floors
      .filter((floor) => floor.id !== selectedFloorId)
      .flatMap((floor) =>
        (roomsByFloorId.get(floor.id) ?? []).map((room, index) => ({
          floorName: floor.name,
          room,
          layout: getRoomLayout(room, index)
        }))
      );
  }, [floors, roomsByFloorId, selectedFloorId, showFloorLayering]);

  function persistRoomLayout(roomId: string, layout: RoomLayout) {
    const room = spaceById.get(roomId);
    if (!room || !canWrite) {
      return;
    }

    const roundedLayout = roundLayout(layout);
    const metadata = asObject(room.metadataJson);
    const floorPlan = asObject(metadata.floorPlan);
    const existingLayout: RoomLayout = {
      x: Math.round(asNumber(floorPlan.x, roundedLayout.x)),
      y: Math.round(asNumber(floorPlan.y, roundedLayout.y)),
      width: Math.round(asNumber(floorPlan.width, roundedLayout.width)),
      height: Math.round(asNumber(floorPlan.height, roundedLayout.height))
    };
    if (areLayoutsEqual(existingLayout, roundedLayout)) {
      return;
    }

    onUpdateSpace({
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
        const previous = current[dragState.roomId] ?? dragState.origin;
        const next =
          dragState.mode === "move"
            ? {
                ...previous,
                x: Math.max(
                  FLOOR_EDGE_INSET,
                  Math.min(renderedCanvasSize.width - previous.width - FLOOR_EDGE_INSET, snapToGrid(dragState.origin.x + dx))
                ),
                y: Math.max(
                  FLOOR_EDGE_INSET,
                  Math.min(renderedCanvasSize.height - previous.height - FLOOR_EDGE_INSET, snapToGrid(dragState.origin.y + dy))
                )
              }
            : (() => {
                const minWidth = FLOOR_GRID_SIZE * 3;
                const minHeight = FLOOR_GRID_SIZE * 2;
                let x = dragState.origin.x;
                let y = dragState.origin.y;
                let width = dragState.origin.width;
                let height = dragState.origin.height;
                const edge = dragState.edge ?? "se";

                if (edge.includes("e")) {
                  width = Math.max(
                    minWidth,
                    Math.min(renderedCanvasSize.width - dragState.origin.x - FLOOR_EDGE_INSET, dragState.origin.width + dx)
                  );
                  width = snapToGrid(width);
                }
                if (edge.includes("s")) {
                  height = Math.max(
                    minHeight,
                    Math.min(renderedCanvasSize.height - dragState.origin.y - FLOOR_EDGE_INSET, dragState.origin.height + dy)
                  );
                  height = snapToGrid(height);
                }
                if (edge.includes("w")) {
                  const right = dragState.origin.x + dragState.origin.width;
                  const clampedDx = Math.min(Math.max(dx, FLOOR_EDGE_INSET - dragState.origin.x), dragState.origin.width - minWidth);
                  x = snapToGrid(dragState.origin.x + clampedDx);
                  x = Math.max(FLOOR_EDGE_INSET, Math.min(right - minWidth, x));
                  width = right - x;
                }
                if (edge.includes("n")) {
                  const bottom = dragState.origin.y + dragState.origin.height;
                  const clampedDy = Math.min(Math.max(dy, FLOOR_EDGE_INSET - dragState.origin.y), dragState.origin.height - minHeight);
                  y = snapToGrid(dragState.origin.y + clampedDy);
                  y = Math.max(FLOOR_EDGE_INSET, Math.min(bottom - minHeight, y));
                  height = bottom - y;
                }

                width = Math.min(width, renderedCanvasSize.width - x - FLOOR_EDGE_INSET);
                height = Math.min(height, renderedCanvasSize.height - y - FLOOR_EDGE_INSET);
                width = Math.max(minWidth, snapToGrid(width));
                height = Math.max(minHeight, snapToGrid(height));
                width = Math.min(width, renderedCanvasSize.width - x - FLOOR_EDGE_INSET);
                height = Math.min(height, renderedCanvasSize.height - y - FLOOR_EDGE_INSET);

                return {
                  ...previous,
                  x,
                  y,
                  width,
                  height
                };
              })();

        const nextState = {
          ...current,
          [dragState.roomId]: next
        };

        layoutDraftByRoomIdRef.current = nextState;
        return nextState;
      });
    };

    const handlePointerUp = () => {
      if (dragState.mode === "move" && !dragState.hasCrossedThreshold) {
        setDragState(null);
        return;
      }

      const layout = layoutDraftByRoomIdRef.current[dragState.roomId] ?? dragState.origin;
      persistRoomLayout(dragState.roomId, layout);
      setDragState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragState, renderedCanvasSize.height, renderedCanvasSize.width, structureScale]);

  function openCreateRoomPanel(elementType: StructureElementType = "room") {
    if (!selectedFloor) {
      return;
    }

    const defaultName = elementType === "structure" ? "Structure" : "";
    setDraft({
      ...toDraft(null, selectedFloor.id),
      name: defaultName,
      slug: defaultName ? slugify(defaultName) : "",
      elementType,
      isBookable: isNonBookableElementType(elementType) ? false : true,
      timezone: selectedFloor.timezone
    });
    setIsCreateOpen(true);
  }

  function openEditRoomPanel(room: FacilitySpace) {
    setActiveRoomId(room.id);
    setDraft(toDraft(room, room.parentSpaceId ?? selectedFloorId));
    setIsEditOpen(true);
  }

  function submitDraft() {
    if (!canWrite || isMutating || !selectedFloor) {
      return;
    }

    const payload = {
      parentSpaceId: draft.parentSpaceId || selectedFloor.id,
      name: draft.name.trim(),
      slug: draft.slug.trim() || slugify(draft.name),
      spaceKind: toSpaceKind(draft.elementType),
      status: draft.status,
      isBookable: isNonBookableElementType(draft.elementType) ? false : draft.isBookable,
      timezone: draft.timezone.trim() || selectedFloor.timezone,
      capacity: draft.capacity.trim().length > 0 ? Number.parseInt(draft.capacity, 10) : null,
      sortIndex: rooms.length
    };

    if (draft.spaceId) {
      const room = spaceById.get(draft.spaceId);
      const existingMetadata = room ? asObject(room.metadataJson) : {};
      onUpdateSpace({
        spaceId: draft.spaceId,
        ...payload,
        sortIndex: room?.sortIndex ?? 0,
        metadataJson: {
          ...existingMetadata,
          floorPlan: {
            ...asObject(existingMetadata.floorPlan),
            elementType: draft.elementType
          }
        }
      });
      setIsEditOpen(false);
      return;
    }

    onCreateSpace({
      ...payload,
      metadataJson: {
        floorPlan: {
          x: FLOOR_GRID_SIZE + (rooms.length % 5) * 200,
          y: FLOOR_GRID_SIZE + Math.floor(rooms.length / 5) * 150,
          width: FLOOR_GRID_SIZE * 8,
          height: FLOOR_GRID_SIZE * 5,
          elementType: draft.elementType
        }
      }
    });
    setIsCreateOpen(false);
  }

  function handleFloorChange(nextFloorId: string) {
    setSelectedFloorId(nextFloorId);
    setActiveRoomId(null);
    setHoveredRoomId(null);
  }

  function focusRoomFromSearch(query: string) {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return;
    }

    const exact = matchingRooms.find((room) => room.name.toLowerCase() === normalizedQuery);
    const target = exact ?? matchingRooms[0];
    if (!target) {
      return;
    }

    setActiveRoomId(target.id);
  }

  function duplicateRoom(room: FacilitySpace) {
    if (!canWrite || isMutating || !selectedFloor) {
      return;
    }

    const roomLayout = layoutDraftByRoomId[room.id] ?? getRoomLayout(room, 0);
    const metadata = asObject(room.metadataJson);
    const floorPlan = asObject(metadata.floorPlan);
    const usedNames = new Set(rooms.map((candidate) => candidate.name.toLowerCase()));
    const usedSlugs = new Set(spaces.map((candidate) => candidate.slug));
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

    onCreateSpace({
      parentSpaceId: room.parentSpaceId ?? selectedFloor.id,
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
          x: Math.max(
            FLOOR_EDGE_INSET,
            Math.min(renderedCanvasSize.width - roomLayout.width - FLOOR_EDGE_INSET, snapToGrid(roomLayout.x + FLOOR_GRID_SIZE))
          ),
          y: Math.max(
            FLOOR_EDGE_INSET,
            Math.min(renderedCanvasSize.height - roomLayout.height - FLOOR_EDGE_INSET, snapToGrid(roomLayout.y + FLOOR_GRID_SIZE))
          ),
          width: roomLayout.width,
          height: roomLayout.height
        }
      }
    });
  }

  function deleteRoom(spaceId: string) {
    if (!canWrite || isMutating) {
      return;
    }

    const target = spaceById.get(spaceId);
    const targetName = target?.name ?? "this space";
    if (!window.confirm(`Delete ${targetName}? This cannot be undone.`)) {
      return;
    }

    onDeleteSpace(spaceId);
    if (activeRoomId === spaceId) {
      setActiveRoomId(null);
    }
    if (draft.spaceId === spaceId) {
      setIsEditOpen(false);
    }
  }

  const rootLabel = building ? `${building.name}` : selectedSpace.name;

  return (
    <>
      <Card>
        <CardHeader className="pb-6">
          <CardTitle>Facility structure</CardTitle>
          <CardDescription>Top-down floor planning for room layout and bookable space mapping.</CardDescription>
        </CardHeader>
        <CardContent>
          {!building ? (
            <Alert variant="info">Select a building-level facility to map floor plans.</Alert>
          ) : (
            <StructureCanvasShell
              addButtonAriaLabel="Add room"
              addButtonDisabled={!canWrite || isMutating || !selectedFloor}
              bottomRightContent={
                <div className="min-w-[220px] rounded-control border bg-surface/95 p-2 shadow-sm">
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-text-muted">Floor</p>
                  <div className="flex items-center gap-2">
                    <select
                      className="h-9 flex-1 rounded-control border border-border bg-surface px-2 text-sm text-text"
                      onChange={(event) => handleFloorChange(event.target.value)}
                      value={selectedFloorId}
                    >
                      {floors.map((floor) => (
                        <option key={floor.id} value={floor.id}>
                          {floor.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      disabled={!canWrite || isMutating || !building}
                      onClick={() => {
                        if (!building) {
                          return;
                        }

                        onCreateSpace({
                          parentSpaceId: building.id,
                          name: `Floor ${floors.length + 1}`,
                          slug: slugify(`${building.slug}-floor-${floors.length + 1}`),
                          spaceKind: "floor",
                          status: "open",
                          isBookable: false,
                          timezone: building.timezone,
                          capacity: null,
                          sortIndex: floors.length,
                          metadataJson: {
                            floorPlan: {
                              canvas: {
                                width: 1400,
                                height: 900
                              }
                            }
                          }
                        });
                      }}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      disabled={!canWrite || isMutating || !selectedFloor}
                      onClick={() => openCreateRoomPanel("structure")}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      + Structure
                    </Button>
                  </div>
                  <label className="mt-2 flex items-center gap-2 text-xs text-text-muted">
                    <Checkbox checked={showFloorLayering} onChange={(event) => setShowFloorLayering(event.target.checked)} />
                    Layer floors
                  </label>
                </div>
              }
              canvasRef={structureCanvasRef}
              dragInProgress={Boolean(dragState)}
              emptyState={
                selectedFloor && rooms.length === 0 ? (
                  <Alert variant="info">No rooms yet on this floor. Add one to start mapping.</Alert>
                ) : null
              }
              onAdd={openCreateRoomPanel}
              onSearchQueryChange={setStructureSearch}
              onSearchSubmit={focusRoomFromSearch}
              onViewScaleChange={(scale) => {
                setStructureScale(scale);
                setStructureZoomPercent(Math.round(scale * 100));
              }}
              rootHeader={
                <div className="w-[320px] max-w-[min(84vw,320px)] rounded-control border bg-surface px-4 py-3 text-center shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-text-muted">Building</p>
                  <p className="font-semibold text-text">{rootLabel}</p>
                  <p className="text-xs text-text-muted">{selectedFloor ? selectedFloor.name : "No floor selected"}</p>
                </div>
              }
              searchInputRef={structureSearchInputRef}
              searchPlaceholder="Search rooms"
              searchQuery={structureSearch}
              searchResults={matchingRooms.map((room) => ({
                id: room.id,
                name: room.name,
                kindLabel: resolveElementType(room)
              }))}
              storageKey={`facility-floorplan-canvas:${orgSlug}:${building.id}`}
              zoomPercent={structureZoomPercent}
            >
              {selectedFloor ? (
                <div className="rounded-control bg-surface p-1 shadow-sm">
                  <div
                    className="relative overflow-hidden rounded-control border border-border bg-[linear-gradient(0deg,transparent_24px,#e5e7eb_25px),linear-gradient(90deg,transparent_24px,#e5e7eb_25px)] bg-[size:25px_25px]"
                    onPointerDown={(event) => {
                      if (event.target !== event.currentTarget) {
                        return;
                      }

                      setActiveRoomId(null);
                      setHoveredRoomId(null);
                    }}
                    style={{
                      width: `${renderedCanvasSize.width}px`,
                      height: `${renderedCanvasSize.height}px`
                    }}
                  >
                    {layeredRooms.map(({ floorName, room, layout }) => (
                      <div
                        className="pointer-events-none absolute rounded-control border border-dashed border-border/40 bg-surface/35"
                        key={`layer:${room.id}`}
                        style={{
                          left: `${layout.x}px`,
                          top: `${layout.y}px`,
                          width: `${layout.width}px`,
                          height: `${layout.height}px`,
                          zIndex: 0
                        }}
                      >
                        <p className="truncate px-2 pt-1 text-[10px] font-medium text-text-muted" title={`${floorName} · ${room.name}`}>
                          {floorName} - {room.name}
                        </p>
                      </div>
                    ))}
                    {rooms.map((room) => {
                      const layout = layoutDraftByRoomId[room.id] ?? getRoomLayout(room, 0);
                      const isActive = activeRoomId === room.id;
                      const showControls = isActive || hoveredRoomId === room.id;
                      const elementType = resolveElementType(room);
                      const isStructuralElement = elementType === "structure";

                      return (
                        <div
                          className={`absolute rounded-control border px-2 py-1 shadow-sm ${
                            isActive
                              ? "border-accent bg-accent/10"
                              : isStructuralElement
                                ? "border-dashed border-border/80 bg-surface/70"
                                : "border-border bg-surface"
                          }`}
                          key={room.id}
                          onClick={() => setActiveRoomId(room.id)}
                          onDoubleClick={() => openEditRoomPanel(room)}
                          onPointerEnter={() => setHoveredRoomId(room.id)}
                          onPointerLeave={() => setHoveredRoomId((current) => (current === room.id ? null : current))}
                          onPointerDown={(event) => {
                            if (!canWrite || isMutating) {
                              return;
                            }

                            event.preventDefault();
                            event.stopPropagation();
                            if (event.button !== 0) {
                              return;
                            }
                            setActiveRoomId(room.id);
                            setDragState({
                              mode: "move",
                              roomId: room.id,
                              startX: event.clientX,
                              startY: event.clientY,
                              origin: layout,
                              hasCrossedThreshold: false
                            });
                          }}
                          style={{
                            left: `${layout.x}px`,
                            top: `${layout.y}px`,
                            width: `${layout.width}px`,
                            height: `${layout.height}px`,
                            zIndex: isActive ? 20 : 1
                          }}
                        >
                          <p className="truncate text-xs font-semibold text-text" title={room.name}>
                            {room.name}
                          </p>
                          <p className="text-[11px] text-text-muted">
                            {isStructuralElement ? elementType : room.isBookable ? "bookable" : "not bookable"}
                          </p>
                          {showControls ? (
                            <>
                              <Button
                                className="absolute right-1 top-1 h-6 px-2"
                                disabled={!canWrite || isMutating}
                                onPointerDown={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                }}
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  duplicateRoom(room);
                                }}
                                size="sm"
                                type="button"
                                variant="ghost"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                              <Button
                                className="absolute right-9 top-1 h-6 px-2 text-danger"
                                disabled={!canWrite || isMutating}
                                onPointerDown={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                }}
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  deleteRoom(room.id);
                                }}
                                size="sm"
                                type="button"
                                variant="ghost"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
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
                                    if (!canWrite || isMutating) {
                                      return;
                                    }

                                    event.preventDefault();
                                    event.stopPropagation();
                                    setActiveRoomId(room.id);
                                    setDragState({
                                      mode: "resize",
                                      roomId: room.id,
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
                  </div>
                </div>
              ) : (
                <Alert variant="info">At least one floor is required. Create a floor to start mapping rooms.</Alert>
              )}
            </StructureCanvasShell>
          )}
        </CardContent>
      </Card>

      <Panel
        footer={
          <>
            <Button onClick={() => setIsCreateOpen(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={!canWrite || isMutating || draft.name.trim().length < 2} onClick={submitDraft} type="button" variant="secondary">
              Add space
            </Button>
          </>
        }
        onClose={() => setIsCreateOpen(false)}
        open={isCreateOpen}
        panelClassName="ml-auto max-w-[320px]"
        subtitle="Add a room or structural element to this floor plan."
        title="Add space"
      >
        <div className="grid gap-3">
          <FormField label="Name">
            <Input onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} value={draft.name} />
          </FormField>
          <FormField hint="Optional, auto-generated if blank." label="Slug">
            <Input onChange={(event) => setDraft((current) => ({ ...current, slug: slugify(event.target.value) }))} value={draft.slug} />
          </FormField>
          <FormField label="Room type">
            <Select
              onChange={(event) => setDraft((current) => ({ ...current, elementType: event.target.value as StructureElementType }))}
              options={[
                { value: "room", label: "Room" },
                { value: "court", label: "Court" },
                { value: "field", label: "Field" },
                { value: "custom", label: "Custom" },
                { value: "structure", label: "Structure (non-bookable)" }
              ]}
              value={draft.elementType}
            />
          </FormField>
          <label className="ui-inline-toggle">
            <Checkbox
              checked={isNonBookableElementType(draft.elementType) ? false : draft.isBookable}
              disabled={isNonBookableElementType(draft.elementType)}
              onChange={(event) => setDraft((current) => ({ ...current, isBookable: event.target.checked }))}
            />
            Bookable
          </label>
        </div>
      </Panel>

      <Panel
        footer={
          <>
            <Button onClick={() => setIsEditOpen(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={!canWrite || isMutating || draft.name.trim().length < 2} onClick={submitDraft} type="button" variant="secondary">
              Save space
            </Button>
          </>
        }
        onClose={() => setIsEditOpen(false)}
        open={isEditOpen}
        panelClassName="ml-auto max-w-[320px]"
        subtitle="Update room details, booking, or archive this element."
        title="Edit space"
      >
        <div className="grid gap-3">
          <FormField label="Name">
            <Input onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} value={draft.name} />
          </FormField>
          <FormField hint="Optional, auto-generated if blank." label="Slug">
            <Input onChange={(event) => setDraft((current) => ({ ...current, slug: slugify(event.target.value) }))} value={draft.slug} />
          </FormField>
          <FormField label="Type">
            <Select
              onChange={(event) => setDraft((current) => ({ ...current, elementType: event.target.value as StructureElementType }))}
              options={[
                { value: "room", label: "Room" },
                { value: "court", label: "Court" },
                { value: "field", label: "Field" },
                { value: "custom", label: "Custom" },
                { value: "structure", label: "Structure (non-bookable)" }
              ]}
              value={draft.elementType}
            />
          </FormField>
          <FormField label="Status">
            <Select
              onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as FacilitySpace["status"] }))}
              options={[
                { value: "open", label: "Open" },
                { value: "closed", label: "Closed" },
                { value: "archived", label: "Archived" }
              ]}
              value={draft.status}
            />
          </FormField>
          <label className="ui-inline-toggle">
            <Checkbox
              checked={isNonBookableElementType(draft.elementType) ? false : draft.isBookable}
              disabled={isNonBookableElementType(draft.elementType)}
              onChange={(event) => setDraft((current) => ({ ...current, isBookable: event.target.checked }))}
            />
            Bookable
          </label>
          {draft.spaceId ? (
            <div className="flex items-center gap-2">
              <Button
                disabled={!canWrite || isMutating}
                onClick={() => {
                  const room = spaceById.get(draft.spaceId as string);
                  if (room) {
                    duplicateRoom(room);
                  }
                }}
                type="button"
                variant="ghost"
              >
                Duplicate room
              </Button>
              <Button
                className="text-danger"
                disabled={!canWrite || isMutating}
                onClick={() => {
                  if (draft.spaceId) {
                    deleteRoom(draft.spaceId);
                  }
                }}
                type="button"
                variant="ghost"
              >
                Delete room
              </Button>
              <Button
                disabled={!canWrite || isMutating}
                onClick={() => {
                  onArchiveSpace(draft.spaceId as string);
                  setIsEditOpen(false);
                }}
                type="button"
                variant="ghost"
              >
                Archive room
              </Button>
            </div>
          ) : null}
        </div>
      </Panel>
    </>
  );
}
