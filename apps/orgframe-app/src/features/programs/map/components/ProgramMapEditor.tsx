"use client";

import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import { Plus, Users } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { Card } from "@orgframe/ui/primitives/card";
import { Chip, ChipButton } from "@orgframe/ui/primitives/chip";
import { cn } from "@orgframe/ui/primitives/utils";
import {
  CANVAS_GRID_SIZE,
  CANVAS_HEIGHT,
  CANVAS_WIDTH
} from "@/src/features/canvas/core/constants";
import { snapToGrid, sortNodesDeterministic } from "@/src/features/canvas/core/geometry";
import type { CanvasBounds } from "@/src/features/canvas/core/types";
import { EditorActionBar } from "@/src/features/canvas/components/EditorActionBar";
import { MapSearchBar } from "@/src/features/canvas/components/MapSearchBar";
import { usePanelOffset } from "@/src/features/canvas/core/usePanelOffset";
import { computeWheelZoom } from "@/src/features/canvas/core/zoom";
import {
  DIVISION_HEADER_HEIGHT,
  nestedTeamBounds
} from "@/src/features/programs/map/autoLayout";
import type { ProgramMapNode } from "@/src/features/programs/map/types";

const CANVAS_MIN_ZOOM = 0.1;
const CANVAS_MAX_ZOOM = 16;

type EditorMode = "structure" | "assignments";

type Pointer = { x: number; y: number };

type Interaction =
  | null
  | { mode: "move"; nodeId: string; pointerWorldStart: Pointer; originalBounds: CanvasBounds }
  | { mode: "resize"; nodeId: string; pointerWorldStart: Pointer; originalBounds: CanvasBounds }
  | { mode: "pan"; pointerClientStart: Pointer; viewStart: View };

type View = {
  centerX: number;
  centerY: number;
  zoom: number;
};

type ProgramMapEditorProps = {
  nodes: ProgramMapNode[];
  selectedNodeId: string | null;
  canWrite: boolean;
  mode: EditorMode;
  isSaving: boolean;
  isDirty?: boolean;
  /** Read-only preview surface — disables drag/resize, hides action buttons,
   *  and surfaces an "Edit" CTA on the action bar to open the popup. */
  readOnly?: boolean;
  onSelectNode: (nodeId: string | null) => void;
  onChangeBounds: (nodeId: string, bounds: CanvasBounds) => void;
  onBringToFront: (nodeId: string) => void;
  /** Optional handlers for the action bar — when omitted, the bar hides those buttons. */
  onSave?: () => void;
  /** Assignments panel state — drives the leading-slot toggle button. */
  assignmentsOpen?: boolean;
  onToggleAssignments?: () => void;
  /** Single Add button — opens the unified create wizard which then asks
   *  whether the user wants a Division or a Team. */
  onAdd?: () => void;
  /** Click on the in-canvas dashed "Add team" slot inside a division — opens
   *  the create wizard with kind=team and parent prefilled to that division. */
  onAddTeamUnder?: (divisionId: string) => void;
  /** Toggle a node's `published` flag from the inline status chip. */
  onTogglePublished?: (nodeId: string, next: boolean) => void;
  /** Opens the fullscreen editor (read-only preview only). */
  onEdit?: () => void;
};

const DEFAULT_VIEW: View = {
  centerX: CANVAS_WIDTH / 2,
  centerY: CANVAS_HEIGHT / 2,
  zoom: 0.6
};

function clientToWorld(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  view: View,
  /** Screen-px offset of the world's on-screen center from the rect's
   *  geometric center. Negative when a side panel pushes the visible
   *  center to the left. */
  viewportOffsetX = 0
): Pointer {
  const offsetX = clientX - rect.left - rect.width / 2 - viewportOffsetX;
  const offsetY = clientY - rect.top - rect.height / 2;
  return {
    x: view.centerX + offsetX / view.zoom,
    y: view.centerY + offsetY / view.zoom
  };
}

function StatusChip({
  published,
  canWrite,
  onToggle
}: {
  published: boolean;
  canWrite: boolean;
  onToggle?: (next: boolean) => void;
}) {
  const label = published ? "Published" : "Draft";
  const variant = published ? "success" : "warning";
  if (!canWrite || !onToggle) {
    return <Chip label={label} size="sm" status={true} variant={variant} />;
  }
  return (
    <ChipButton
      aria-label={`Status: ${label}. Click to toggle.`}
      label={label}
      onClick={(event) => {
        // Don't bubble up to the surrounding card (which selects the node).
        event.stopPropagation();
        onToggle(!published);
      }}
      onPointerDown={(event) => event.stopPropagation()}
      size="sm"
      status={true}
      title={published ? "Click to unpublish" : "Click to publish"}
      variant={variant}
    />
  );
}

function DivisionCard({
  node,
  selected,
  canWrite,
  mode,
  onPointerDownMove,
  onClick,
  onTogglePublished
}: {
  node: ProgramMapNode;
  selected: boolean;
  canWrite: boolean;
  mode: EditorMode;
  onPointerDownMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onClick: () => void;
  onTogglePublished?: (nodeId: string, next: boolean) => void;
}) {
  return (
    <Card
      className={cn(
        "absolute overflow-hidden p-0 transition-[box-shadow,transform] duration-150 select-none",
        selected
          ? "ring-2 ring-primary ring-offset-1 ring-offset-canvas shadow-floating"
          : "hover:shadow-floating"
      )}
      style={{
        left: node.bounds.x,
        top: node.bounds.y,
        width: node.bounds.width,
        height: node.bounds.height,
        zIndex: node.zIndex,
        cursor: canWrite && mode === "structure" ? "grab" : "default"
      }}
      onPointerDown={canWrite && mode === "structure" ? onPointerDownMove : undefined}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {/* Header band — only the top is "draggable surface"; team children
          render as siblings absolutely-positioned within division bounds. */}
      <div
        className="flex items-center gap-2 border-b border-border bg-surface-muted/40 px-3"
        style={{ height: DIVISION_HEADER_HEIGHT }}
      >
        <span
          className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight text-text"
          title={node.name}
        >
          {node.name}
        </span>
        <span className="shrink-0">
          <StatusChip
            canWrite={canWrite}
            onToggle={onTogglePublished ? (next) => onTogglePublished(node.id, next) : undefined}
            published={node.isPublished}
          />
        </span>
      </div>
      {/* Body is intentionally empty — nested teams render as separate
          absolute boxes layered on top with higher z-index. */}
    </Card>
  );
}

function TeamCard({
  node,
  selected,
  canWrite,
  mode,
  onClick,
  onTogglePublished
}: {
  node: ProgramMapNode;
  selected: boolean;
  canWrite: boolean;
  mode: EditorMode;
  onClick: () => void;
  onTogglePublished?: (nodeId: string, next: boolean) => void;
}) {
  const droppable = useDroppable({
    id: `node:${node.id}`,
    disabled: mode !== "assignments",
    data: { nodeId: node.id, nodeKind: node.nodeKind }
  });

  // Teams nest flush inside the division. They drop their own border / radius
  // so the division card's edge reads as the only outer border, and use a
  // top divider to separate stacked teams.
  return (
    <div
      ref={droppable.setNodeRef}
      className={cn(
        "absolute select-none border-t border-border bg-surface transition-colors duration-150",
        selected
          ? "ring-2 ring-primary ring-offset-1 ring-offset-canvas shadow-floating"
          : droppable.isOver
            ? "ring-2 ring-success ring-offset-1 ring-offset-canvas"
            : "hover:bg-surface-muted/40"
      )}
      style={{
        left: node.bounds.x,
        top: node.bounds.y,
        width: node.bounds.width,
        height: node.bounds.height,
        zIndex: node.zIndex,
        cursor: canWrite && mode === "structure" ? "pointer" : "default"
      }}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <div className="flex h-full items-center gap-2 px-3">
        <span
          className="min-w-0 flex-1 truncate text-[13px] font-medium leading-tight text-text"
          title={node.name}
        >
          {node.name}
        </span>
        {node.capacity !== null ? (
          <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-text-muted">
            <Users aria-hidden className="h-3 w-3" />
            {node.capacity}
          </span>
        ) : null}
        <span className="shrink-0">
          <StatusChip
            canWrite={canWrite}
            onToggle={onTogglePublished ? (next) => onTogglePublished(node.id, next) : undefined}
            published={node.isPublished}
          />
        </span>
      </div>
    </div>
  );
}

function AddTeamSlot({
  bounds,
  zIndex,
  onClick
}: {
  bounds: CanvasBounds;
  zIndex: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="absolute flex select-none items-center justify-center gap-1.5 border-t border-dashed border-border-muted bg-transparent text-[12px] font-medium text-text-muted transition-colors duration-150 hover:bg-surface-muted/40 hover:text-text"
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
        zIndex
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <Plus aria-hidden className="h-3.5 w-3.5" />
      Add team
    </button>
  );
}

export function ProgramMapEditor({
  nodes,
  selectedNodeId,
  canWrite,
  mode,
  isSaving = false,
  isDirty = false,
  readOnly = false,
  onSelectNode,
  onChangeBounds,
  onBringToFront,
  onSave,
  assignmentsOpen = false,
  onToggleAssignments,
  onAdd,
  onAddTeamUnder,
  onEdit,
  onTogglePublished
}: ProgramMapEditorProps) {
  const effectiveCanWrite = canWrite && !readOnly;
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [view, setView] = React.useState<View>(DEFAULT_VIEW);
  const [interaction, setInteraction] = React.useState<Interaction>(null);
  // Smooth panel offset in screen pixels — drives the world-transform
  // centering, the grid background-position, the action-bar translate,
  // and the fit/cursor math. All four read this same value so they stay
  // perfectly aligned during the panel open/close animation. Read-only
  // previews don't make space for panels (they're not in the dock).
  const rawPanelOffset = usePanelOffset();
  const panelOffset = readOnly ? 0 : rawPanelOffset;
  // Track container pixel size so the transform's screen-center offset uses
  // the actual visible width/height. CSS `translate(50%, 50%)` would resolve
  // against the inner div's 3200x2000 box, which puts the "world center" at
  // a fixed (1600, 1000)px from the container's top-left — that's why
  // fit-to-content was placing nodes off-screen on narrower viewports.
  const [containerSize, setContainerSize] = React.useState<{ width: number; height: number }>({ width: 0, height: 0 });
  // Visible center on screen — half of the non-occluded canvas area.
  // The world's `view.centerX` renders here so a fit-to-content selection
  // sits centered in the part of the canvas the user can actually see.
  const visibleCenterX = (containerSize.width - panelOffset) / 2;
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize((prev) =>
        prev.width === rect.width && prev.height === rect.height ? prev : { width: rect.width, height: rect.height }
      );
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const sorted = React.useMemo(() => sortNodesDeterministic(nodes), [nodes]);

  const beginMove = (event: React.PointerEvent<HTMLDivElement>, nodeId: string) => {
    if (!effectiveCanWrite || mode !== "structure") return;
    event.stopPropagation();
    event.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pointer = clientToWorld(event.clientX, event.clientY, rect, view, -panelOffset / 2);
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    onBringToFront(nodeId);
    onSelectNode(nodeId);
    setInteraction({
      mode: "move",
      nodeId,
      pointerWorldStart: pointer,
      originalBounds: node.bounds
    });
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };

  const beginResize = (event: React.PointerEvent<HTMLDivElement>, nodeId: string) => {
    if (!effectiveCanWrite || mode !== "structure") return;
    event.stopPropagation();
    event.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pointer = clientToWorld(event.clientX, event.clientY, rect, view, -panelOffset / 2);
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    setInteraction({
      mode: "resize",
      nodeId,
      pointerWorldStart: pointer,
      originalBounds: node.bounds
    });
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };

  const beginPan = (event: React.PointerEvent<HTMLDivElement>) => {
    // Pan only when starting on empty canvas. Middle-click and shift+left also pan.
    if (event.button !== 0 && event.button !== 1) return;
    if ((event.target as HTMLElement).closest("[data-program-node-box='true']")) return;
    onSelectNode(null);
    setInteraction({
      mode: "pan",
      pointerClientStart: { x: event.clientX, y: event.clientY },
      viewStart: view
    });
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interaction) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (interaction.mode === "pan") {
      const dx = event.clientX - interaction.pointerClientStart.x;
      const dy = event.clientY - interaction.pointerClientStart.y;
      setView({
        ...interaction.viewStart,
        centerX: interaction.viewStart.centerX - dx / interaction.viewStart.zoom,
        centerY: interaction.viewStart.centerY - dy / interaction.viewStart.zoom
      });
      return;
    }

    const pointer = clientToWorld(event.clientX, event.clientY, rect, view, -panelOffset / 2);
    const dx = pointer.x - interaction.pointerWorldStart.x;
    const dy = pointer.y - interaction.pointerWorldStart.y;

    if (interaction.mode === "move") {
      onChangeBounds(interaction.nodeId, {
        x: snapToGrid(interaction.originalBounds.x + dx),
        y: snapToGrid(interaction.originalBounds.y + dy),
        width: interaction.originalBounds.width,
        height: interaction.originalBounds.height
      });
    } else if (interaction.mode === "resize") {
      onChangeBounds(interaction.nodeId, {
        x: interaction.originalBounds.x,
        y: interaction.originalBounds.y,
        width: snapToGrid(Math.max(96, interaction.originalBounds.width + dx)),
        height: snapToGrid(Math.max(48, interaction.originalBounds.height + dy))
      });
    }
  };

  const endInteraction = () => setInteraction(null);

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    // In read-only / preview mode let the page scroll through. Wheel-zoom
    // only fires in the active editor.
    if (readOnly) return;
    event.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = computeWheelZoom(view, event, rect, {
      minZoom: CANVAS_MIN_ZOOM,
      maxZoom: CANVAS_MAX_ZOOM,
      viewportOffsetX: -panelOffset / 2
    });
    if (next) setView(next);
  };

  // Pixel-based screen-center translate so world (centerX, centerY) lands
  // at the *visible* center — accounts for the side panel pushing the
  // visible center to the left of the geometric container center.
  const childTransform = `translate(${visibleCenterX}px, ${containerSize.height / 2}px) scale(${view.zoom}) translate(${-view.centerX}px, ${-view.centerY}px)`;

  // Infinite grid: rendered on the outer (untransformed) container so it
  // covers the full viewport regardless of pan. We tile a unit grid at the
  // current zoom and place world origin at `visibleCenterX` on screen — the
  // same anchor `childTransform` uses — so node corners stay on grid lines
  // as the panel opens / closes.
  const gridCellPx = CANVAS_GRID_SIZE * view.zoom;
  const gridOriginX = visibleCenterX - view.centerX * view.zoom;
  const gridOriginY = containerSize.height / 2 - view.centerY * view.zoom;

  const zoomBy = (factor: number) => {
    const nextZoom = Math.max(CANVAS_MIN_ZOOM, Math.min(CANVAS_MAX_ZOOM, view.zoom * factor));
    setView((current) => ({ ...current, zoom: nextZoom }));
  };

  const fitToContent = React.useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || nodes.length === 0) {
      setView(DEFAULT_VIEW);
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of nodes) {
      minX = Math.min(minX, node.bounds.x);
      minY = Math.min(minY, node.bounds.y);
      maxX = Math.max(maxX, node.bounds.x + node.bounds.width);
      maxY = Math.max(maxY, node.bounds.y + node.bounds.height);
    }
    const pad = 64;
    const w = Math.max(1, maxX - minX + pad * 2);
    const h = Math.max(1, maxY - minY + pad * 2);
    const visibleWidth = Math.max(1, rect.width - panelOffset);
    const zoom = Math.max(
      CANVAS_MIN_ZOOM,
      Math.min(CANVAS_MAX_ZOOM, Math.min(visibleWidth / w, rect.height / h))
    );
    setView({ centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2, zoom });
  }, [nodes, panelOffset]);

  // Zoom to a specific node's bounds with a comfortable surrounding pad.
  // Used by the search bar to pop the user over to the matched item.
  const focusNode = React.useCallback(
    (nodeId: string) => {
      const node = nodes.find((candidate) => candidate.id === nodeId);
      if (!node) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pad = 96;
      const w = Math.max(1, node.bounds.width + pad * 2);
      const h = Math.max(1, node.bounds.height + pad * 2);
      const visibleWidth = Math.max(1, rect.width - panelOffset);
      // Cap the zoom-in so a tiny node doesn't blow up to maximum zoom.
      const zoom = Math.max(
        CANVAS_MIN_ZOOM,
        Math.min(CANVAS_MAX_ZOOM, 1.4, Math.min(visibleWidth / w, rect.height / h))
      );
      setView({
        centerX: node.bounds.x + node.bounds.width / 2,
        centerY: node.bounds.y + node.bounds.height / 2,
        zoom
      });
    },
    [nodes, panelOffset]
  );

  const handleSearchPick = React.useCallback(
    (nodeId: string) => {
      focusNode(nodeId);
      onSelectNode(nodeId);
    },
    [focusNode, onSelectNode]
  );

  const searchItems = React.useMemo(
    () =>
      nodes.map((node) => ({
        id: node.id,
        label: node.name,
        sublabel: node.nodeKind === "division" ? "Division" : "Team"
      })),
    [nodes]
  );

  // First-paint fit + refit-on-grow: pull the view to enclose all current
  // nodes whenever the count changes (e.g. a new division was just created)
  // OR the container has just been measured (size goes from 0 → real). The
  // initial fit MUST wait for measurement, otherwise the transform centers
  // against width=0 and nodes render up in the corner. Tracked by a ref so
  // we only refit on these specific transitions — pan/zoom/move actions
  // don't fight the user.
  const lastFitCountRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (nodes.length === 0) return;
    if (containerSize.width === 0 || containerSize.height === 0) return;
    if (nodes.length === lastFitCountRef.current) return;
    lastFitCountRef.current = nodes.length;
    fitToContent();
  }, [fitToContent, nodes.length, containerSize.width, containerSize.height]);

  // Group teams by parent so we can position the per-division "Add team"
  // dashed slot at the next free row inside each division.
  const teamsByParent = React.useMemo(() => {
    const map = new Map<string, ProgramMapNode[]>();
    for (const node of nodes) {
      if (node.nodeKind === "team" && node.parentId) {
        const list = map.get(node.parentId) ?? [];
        list.push(node);
        map.set(node.parentId, list);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  }, [nodes]);

  // Z-order: divisions sit at their stored zIndex; teams render with a
  // higher z so they layer cleanly on top of their parent's body. Within
  // a division, later siblings stack above earlier ones — matters when a
  // user drags one to reorder.
  const zByNode = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const node of nodes) {
      if (node.nodeKind === "division") {
        map.set(node.id, node.zIndex);
      }
    }
    const teamsByParent = new Map<string, ProgramMapNode[]>();
    for (const node of nodes) {
      if (node.nodeKind === "team" && node.parentId) {
        const list = teamsByParent.get(node.parentId) ?? [];
        list.push(node);
        teamsByParent.set(node.parentId, list);
      }
    }
    teamsByParent.forEach((siblings, parentId) => {
      const parentZ = map.get(parentId) ?? 0;
      siblings
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((team, index) => {
          map.set(team.id, parentZ + 1 + index);
        });
    });
    // Orphan teams (no parent in the set) keep their stored z.
    for (const node of nodes) {
      if (node.nodeKind === "team" && !map.has(node.id)) {
        map.set(node.id, node.zIndex);
      }
    }
    return map;
  }, [nodes]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full select-none"
      style={{ touchAction: "none" }}
      onPointerDown={beginPan}
      onPointerMove={onPointerMove}
      onPointerUp={endInteraction}
      onPointerCancel={endInteraction}
      onWheel={onWheel}
    >
      {/* Infinite grid layer. Fills the whole canvas (no squeeze) so the
          grid runs edge-to-edge under any floating side panel. The bg
          origin uses `gridOriginX/Y` — the same values `childTransform`
          uses to position world (0,0) — so node corners always land on
          grid lines, including mid-animation when `usePanelOffset` is
          interpolating during a panel open/close. */}
      <div
        className="pointer-events-none absolute inset-0 bg-canvas"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(148, 163, 184, 0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(148, 163, 184, 0.18) 1px, transparent 1px)",
          backgroundSize: `${gridCellPx}px ${gridCellPx}px`,
          backgroundPosition: `${gridOriginX}px ${gridOriginY}px`
        }}
      />
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ visibility: containerSize.width === 0 ? "hidden" : undefined }}
      >
      <div
        className="absolute left-0 top-0"
        style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          transformOrigin: "0 0",
          transform: childTransform
        }}
      >
        {sorted.map((node) => {
          const z = zByNode.get(node.id) ?? node.zIndex;
          const layered: ProgramMapNode = node.zIndex === z ? node : { ...node, zIndex: z };
          if (node.nodeKind === "division") {
            const childCount = teamsByParent.get(node.id)?.length ?? 0;
            const showAddSlot = effectiveCanWrite && mode === "structure" && !!onAddTeamUnder;
            return (
              <React.Fragment key={node.id}>
                <div data-program-node-box="true">
                  <DivisionCard
                    node={layered}
                    selected={selectedNodeId === node.id}
                    canWrite={effectiveCanWrite}
                    mode={mode}
                    onPointerDownMove={(event) => beginMove(event, node.id)}
                    onClick={() => onSelectNode(node.id)}
                    onTogglePublished={onTogglePublished}
                  />
                </div>
                {showAddSlot ? (
                  <div data-program-node-box="true">
                    <AddTeamSlot
                      bounds={nestedTeamBounds(node.bounds, childCount)}
                      zIndex={z + childCount + 1}
                      onClick={() => onAddTeamUnder(node.id)}
                    />
                  </div>
                ) : null}
              </React.Fragment>
            );
          }
          return (
            <div key={node.id} data-program-node-box="true">
              <TeamCard
                node={layered}
                selected={selectedNodeId === node.id}
                canWrite={effectiveCanWrite}
                mode={mode}
                onClick={() => onSelectNode(node.id)}
                onTogglePublished={onTogglePublished}
              />
            </div>
          );
        })}
      </div>
      </div>

      {!readOnly ? (
        <MapSearchBar
          items={searchItems}
          onPickItem={handleSearchPick}
          placeholder="Search divisions & teams"
        />
      ) : null}

      {/* Floating action bar — translated left by half the (smoothly
          interpolated) panel offset so its centered pill sits in the
          visible canvas, not behind the panel. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ transform: `translateX(${-panelOffset / 2}px)` }}
      >
      <EditorActionBar
        readOnly={readOnly}
        onEdit={onEdit}
        canWrite={effectiveCanWrite}
        isSaving={isSaving}
        onSave={effectiveCanWrite && onSave ? onSave : undefined}
        saveDisabled={!isDirty}
        zoom={view.zoom}
        onZoomIn={() => zoomBy(1.2)}
        onZoomOut={() => zoomBy(1 / 1.2)}
        onFit={fitToContent}
        leadingSlot={
          !readOnly && onToggleAssignments ? (
            <Button
              variant={assignmentsOpen ? "primary" : "ghost"}
              size="sm"
              onClick={onToggleAssignments}
            >
              <Users />
              Assignments
            </Button>
          ) : undefined
        }
        trailingSlot={
          !readOnly && effectiveCanWrite && onAdd ? (
            <Button onClick={onAdd} size="sm" variant="ghost">
              <Plus />
              Add
            </Button>
          ) : undefined
        }
      />
      </div>
    </div>
  );
}
