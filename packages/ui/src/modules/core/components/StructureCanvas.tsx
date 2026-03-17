"use client";

import { useCallback, useMemo, useRef, type ReactNode } from "react";
import type { CanvasViewportHandle } from "@orgframe/ui/ui/canvas-viewport";
import { StructureCanvasShell, type StructureSearchItem } from "@orgframe/ui/modules/core/components/StructureCanvasShell";
import { cn } from "@/lib/utils";
import type { FacilitySpace } from "@/modules/facilities/types";
import type { ProgramNode } from "@/modules/programs/types";

type StructureCanvasShellProps = React.ComponentProps<typeof StructureCanvasShell>;

type StructureCanvasProps = Omit<
  StructureCanvasShellProps,
  "children" | "renderContent" | "searchResults" | "searchPlaceholder" | "onSearchSubmit" | "addButtonAriaLabel" | "onAdd" | "onViewScaleChange"
> & {
  children?: ReactNode;
  viewContent?: ReactNode;
  editContent?: ReactNode;
  mapMode?: "facility" | "program";
  facilitySpaces?: FacilitySpace[];
  facilityRootId?: string | null;
  facilitySelectedIds?: Set<string>;
  facilityConflictedIds?: Set<string>;
  onFacilitySelect?: (space: FacilitySpace) => void;
  programNodes?: ProgramNode[];
  programSelectedIds?: Set<string>;
  onProgramSelect?: (node: ProgramNode) => void;
  searchResults?: StructureSearchItem[];
  searchPlaceholder?: string;
  onSearchSubmit?: (query: string) => void;
  addButtonAriaLabel?: string;
  onAdd?: () => void;
  onViewScaleChange?: (scale: number) => void;
};

type StructureElementType = "room" | "court" | "field" | "custom" | "structure";

const CANVAS_GRID_SIZE = 25;
const CANVAS_GRID_PITCH = CANVAS_GRID_SIZE;
const CANVAS_POSITION_STEP = CANVAS_GRID_PITCH;
const CANVAS_SIZE_STEP = CANVAS_GRID_SIZE;
const NODE_MIN_SIZE = 5;
const GRID_NUMERIC_SCALE = 10;

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

function getRoomLayout(space: FacilitySpace, index: number) {
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

function isRoomKind(kind: FacilitySpace["spaceKind"]) {
  return kind === "room" || kind === "court" || kind === "field" || kind === "custom";
}

function isDescendantOf(space: FacilitySpace, ancestorId: string, byId: Map<string, FacilitySpace>) {
  let current = space.parentSpaceId ? byId.get(space.parentSpaceId) ?? null : null;
  let guard = 0;
  while (current && guard < 60) {
    if (current.id === ancestorId) {
      return true;
    }
    current = current.parentSpaceId ? byId.get(current.parentSpaceId) ?? null : null;
    guard += 1;
  }
  return false;
}

function StructureNodeCard({
  title,
  subtitle,
  isSelected,
  isConflicted,
  isStructural,
  selectable = true
}: {
  title: string;
  subtitle: string;
  isSelected?: boolean;
  isConflicted?: boolean;
  isStructural?: boolean;
  selectable?: boolean;
}) {
  return (
    <div
      className={cn(
        "h-full min-h-[56px] w-full rounded-control border px-2 py-1 shadow-sm transition-[left,top,width,height,transform,box-shadow,border-color,background-color] duration-100 ease-out",
        selectable ? "cursor-pointer" : "cursor-not-allowed opacity-60",
        isSelected ? "border-accent bg-accent/10" : isStructural ? "border-dashed border-border/80 bg-surface/70" : "border-border bg-surface",
        isConflicted ? "border-destructive/70 bg-destructive/10" : ""
      )}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="pointer-events-none flex h-full w-full items-center justify-center" data-canvas-pan-ignore="true">
          <div className="group relative inline-flex max-w-[86%] items-center rounded-full border border-border/70 bg-surface/95 px-4 py-1.5 text-center shadow-sm">
            <div className="min-w-0 px-1.5 text-center">
              <span className="flex min-w-0 w-full max-w-[16rem] flex-col items-center leading-tight">
                <span className="block w-full truncate text-center text-xs font-semibold text-text" title={title}>
                  {title}
                </span>
                <span className="block w-full truncate text-center text-[11px] text-text-muted">{subtitle}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgramMapNodes({
  nodes,
  selectedNodeIds,
  onSelectNode
}: {
  nodes: ProgramNode[];
  selectedNodeIds?: Set<string>;
  onSelectNode?: (node: ProgramNode) => void;
}) {
  const nodesByParent = useMemo(() => {
    const map = new Map<string | null, ProgramNode[]>();
    nodes.forEach((node) => {
      const list = map.get(node.parentId ?? null) ?? [];
      list.push(node);
      map.set(node.parentId ?? null, list);
    });
    for (const list of map.values()) {
      list.sort((a, b) => a.sortIndex - b.sortIndex || a.name.localeCompare(b.name));
    }
    return map;
  }, [nodes]);

  const divisions = nodesByParent.get(null) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4">
        {divisions.map((division) => {
          const teams = nodesByParent.get(division.id)?.filter((node) => node.nodeKind === "team") ?? [];
          const selectedDivision = selectedNodeIds?.has(division.id) ?? false;

          return (
            <div className="flex min-w-[240px] flex-col gap-3 rounded-control border border-border/60 bg-surface/60 p-3" key={division.id}>
              <div
                className="relative"
                data-structure-node-id={division.id}
                onClick={() => {
                  onSelectNode?.(division);
                }}
              >
                <StructureNodeCard isSelected={selectedDivision} subtitle="division" title={division.name} />
              </div>
              <div className="flex flex-col gap-2">
                {teams.map((team) => {
                  const selectedTeam = selectedNodeIds?.has(team.id) ?? false;
                  return (
                    <div
                      className="relative"
                      data-structure-node-id={team.id}
                      key={team.id}
                      onClick={() => {
                        onSelectNode?.(team);
                      }}
                    >
                      <StructureNodeCard isSelected={selectedTeam} subtitle="team" title={team.name} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function StructureCanvas(props: StructureCanvasProps) {
  const {
    viewContent,
    editContent,
    mapMode,
    facilitySpaces,
    facilityRootId,
    facilitySelectedIds,
    facilityConflictedIds,
    onFacilitySelect,
    programNodes,
    programSelectedIds,
    onProgramSelect,
    searchQuery,
    onSearchQueryChange,
    searchResults,
    onSearchSubmit,
    searchPlaceholder,
    onViewNodeSelect,
    onFit,
    onViewScaleChange,
    addButtonAriaLabel,
    onAdd,
    children,
    ...shellProps
  } = props;

  const canvasRef = props.canvasRef ?? useRef<CanvasViewportHandle | null>(null);
  const normalizeSearchKey = useCallback((value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, ""), []);
  const normalizedSearch = searchQuery.trim();

  const facilitySpaceById = useMemo(
    () => (facilitySpaces ? new Map(facilitySpaces.map((space) => [space.id, space])) : new Map<string, FacilitySpace>()),
    [facilitySpaces]
  );
  const facilityRootSpace = useMemo(
    () => (facilityRootId && facilitySpaces ? facilitySpaceById.get(facilityRootId) ?? null : null),
    [facilityRootId, facilitySpaceById, facilitySpaces]
  );
  const facilityRooms = useMemo(() => {
    if (mapMode !== "facility" || !facilityRootSpace || !facilitySpaces) {
      return [];
    }

    return facilitySpaces
      .filter(
        (space) => space.status !== "archived" && isRoomKind(space.spaceKind) && isDescendantOf(space, facilityRootSpace.id, facilitySpaceById)
      )
      .sort((a, b) => a.sortIndex - b.sortIndex || a.name.localeCompare(b.name));
  }, [facilityRootSpace, facilitySpaceById, facilitySpaces, mapMode]);

  const facilityFitBounds = useMemo(() => {
    if (facilityRooms.length === 0) {
      return null;
    }

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    facilityRooms.forEach((room, index) => {
      const layout = getRoomLayout(room, index);
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
  }, [facilityRooms]);

  const resolvedOnFit =
    onFit ??
    (mapMode === "facility"
      ? (options?: { viewportOffsetX?: number; viewportOffsetY?: number; animated?: boolean }) => {
          if (!facilityFitBounds) {
            canvasRef.current?.fitToView(options);
            return;
          }

          canvasRef.current?.fitToBounds(
            {
              x: facilityFitBounds.left,
              y: facilityFitBounds.top,
              width: facilityFitBounds.width,
              height: facilityFitBounds.height
            },
            options
          );
        }
      : undefined);

  const resolvedSearchResults: StructureSearchItem[] =
    searchResults ??
    (mapMode === "facility"
      ? facilityRooms
          .filter((room) => (normalizedSearch ? normalizeSearchKey(room.name).includes(normalizeSearchKey(normalizedSearch)) : false))
          .map((room) => ({
            id: room.id,
            name: room.name,
            kindLabel: room.spaceKind
          }))
      : mapMode === "program" && programNodes
        ? programNodes
            .filter((node) => (normalizedSearch ? normalizeSearchKey(node.name).includes(normalizeSearchKey(normalizedSearch)) : false))
            .map((node) => ({
              id: node.id,
              name: node.name,
              kindLabel: node.nodeKind
            }))
        : []);

  const resolvedOnSearchSubmit =
    onSearchSubmit ??
    ((query: string) => {
      const normalizedQuery = normalizeSearchKey(query.trim());
      if (!normalizedQuery) {
        return;
      }

      if (mapMode === "facility") {
        const target = facilityRooms.find((room) => normalizeSearchKey(room.name) === normalizedQuery) ?? facilityRooms[0];
        if (!target) {
          return;
        }
        const node = document.querySelector(`[data-structure-node-id="${target.id}"]`);
        if (!(node instanceof HTMLElement)) {
          return;
        }
        canvasRef.current?.focusElement(node, { targetScale: 1.3 });
        return;
      }

      if (mapMode === "program" && programNodes) {
        const target = programNodes.find((node) => normalizeSearchKey(node.name) === normalizedQuery) ?? programNodes[0];
        if (!target) {
          return;
        }
        const nodeEl = document.querySelector(`[data-structure-node-id="${target.id}"]`);
        if (!(nodeEl instanceof HTMLElement)) {
          return;
        }
        canvasRef.current?.focusElement(nodeEl, { targetScale: 1.1 });
      }
    });

  const resolvedViewContent = useMemo(() => {
    if (viewContent) {
      return viewContent;
    }
    if (mapMode === "facility") {
      return (
        <>
          {facilityRooms.map((room, index) => {
            const layout = getRoomLayout(room, index);
            const elementType = resolveElementType(room);
            const isStructuralElement = elementType === "structure";
            const statusLabel = isStructuralElement ? elementType : room.isBookable ? "bookable" : "not bookable";
            const isSelected = facilitySelectedIds?.has(room.id) ?? false;
            const isConflicted = facilityConflictedIds?.has(room.id) ?? false;
            const selectable = room.status === "open" && room.isBookable && !isStructuralElement;

            return (
              <div
                className="absolute"
                data-structure-node-id={room.id}
                key={room.id}
                style={{
                  left: `${layout.x}px`,
                  top: `${layout.y}px`,
                  width: `${layout.width}px`,
                  height: `${layout.height}px`
                }}
              >
                <StructureNodeCard
                  isConflicted={isConflicted}
                  isSelected={isSelected}
                  isStructural={isStructuralElement}
                  selectable={selectable}
                  subtitle={statusLabel}
                  title={room.name}
                />
              </div>
            );
          })}
        </>
      );
    }
    if (mapMode === "program" && programNodes) {
      return <ProgramMapNodes nodes={programNodes} onSelectNode={onProgramSelect} selectedNodeIds={programSelectedIds} />;
    }
    return children ?? null;
  }, [
    children,
    facilityConflictedIds,
    facilityRooms,
    facilitySelectedIds,
    mapMode,
    onProgramSelect,
    programNodes,
    programSelectedIds,
    viewContent
  ]);

  const resolvedEditContent = editContent ?? children ?? null;

  const resolvedOnViewNodeSelect =
    onViewNodeSelect ??
    (mapMode === "facility"
      ? (nodeId: string) => {
          if (!onFacilitySelect) {
            return;
          }
          const space = facilitySpaceById.get(nodeId);
          if (!space) {
            return;
          }
          const elementType = resolveElementType(space);
          const selectable = space.status === "open" && space.isBookable && elementType !== "structure";
          if (!selectable) {
            return;
          }
          onFacilitySelect(space);
        }
      : mapMode === "program"
        ? (nodeId: string) => {
            if (!onProgramSelect || !programNodes) {
              return;
            }
            const node = programNodes.find((item) => item.id === nodeId);
            if (!node) {
              return;
            }
            onProgramSelect(node);
          }
        : undefined);

  return (
    <StructureCanvasShell
      {...shellProps}
      addButtonAriaLabel={addButtonAriaLabel ?? "Add"}
      canvasRef={canvasRef}
      onAdd={onAdd ?? (() => {})}
      onFit={resolvedOnFit}
      onSearchQueryChange={onSearchQueryChange}
      onSearchSubmit={resolvedOnSearchSubmit}
      onViewNodeSelect={resolvedOnViewNodeSelect}
      onViewScaleChange={onViewScaleChange ?? (() => {})}
      renderContent={(editable) => (editable ? resolvedEditContent : resolvedViewContent)}
      searchPlaceholder={searchPlaceholder ?? (mapMode === "program" ? "Search nodes" : "Search spaces")}
      searchQuery={searchQuery}
      searchResults={resolvedSearchResults}
      zoomPercent={props.zoomPercent}
    />
  );
}
