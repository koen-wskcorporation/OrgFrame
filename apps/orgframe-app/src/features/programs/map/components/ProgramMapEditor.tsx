"use client";

import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import { CircleDot, Shield, Users } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { Card } from "@orgframe/ui/primitives/card";
import { Chip } from "@orgframe/ui/primitives/chip";
import { cn } from "@orgframe/ui/primitives/utils";
import { CANVAS_GRID_SIZE } from "@/src/features/canvas/core/constants";

/** Round a world-space x/y to the nearest grid line. Used by connector
 *  routing so the vertical stems sit ON the canvas grid even when the
 *  parent's center falls between grid lines (program width is 408 ⇒
 *  center at +204, which is 12px off a grid line). */
function snapToGrid(value: number): number {
  return Math.round(value / CANVAS_GRID_SIZE) * CANVAS_GRID_SIZE;
}
import type { CanvasBounds } from "@/src/features/canvas/core/types";
import { EditorActionBar } from "@/src/features/canvas/components/EditorActionBar";
import { MapSearchBar } from "@/src/features/canvas/components/MapSearchBar";
import { usePanelOffset } from "@/src/features/canvas/core/usePanelOffset";
import { computeWheelZoom } from "@/src/features/canvas/core/zoom";
import {
  PROGRAM_ROOT_ID,
  computeTreeLayout
} from "@/src/features/programs/map/treeLayout";
import type { ProgramMapNode } from "@/src/features/programs/map/types";
import type { ProgramMapNodeCounts } from "@/src/features/programs/map/queries";
import type { ProgramStatus } from "@/src/features/programs/types";

const CANVAS_MIN_ZOOM = 0.1;
const CANVAS_MAX_ZOOM = 16;

type EditorMode = "structure" | "assignments";

type Pointer = { x: number; y: number };

type Interaction = null | { mode: "pan"; pointerClientStart: Pointer; viewStart: View };

type View = {
  centerX: number;
  centerY: number;
  zoom: number;
};

type ProgramStatusPicker = {
  value: ProgramStatus;
  onChange: (next: ProgramStatus) => void;
  options: { value: string; label: string; color: string }[];
  disabled?: boolean;
};

type ProgramMapEditorProps = {
  nodes: ProgramMapNode[];
  selectedNodeId: string | null;
  canWrite: boolean;
  mode: EditorMode;
  /** Program-level info rendered in the central root node. */
  programName: string;
  programStatus: ProgramStatus;
  programStatusPicker?: ProgramStatusPicker;
  /** Per-node player / staff / assignment counts displayed on each card. */
  nodeCounts: ProgramMapNodeCounts;
  isSaving: boolean;
  /** Read-only preview surface — disables interactions, hides action buttons,
   *  and surfaces an "Edit" CTA on the action bar to open the popup. */
  readOnly?: boolean;
  onSelectNode: (nodeId: string | null) => void;
  /** Assignments panel state — drives the leading-slot toggle button. */
  assignmentsOpen?: boolean;
  onToggleAssignments?: () => void;
  /** Single Add button — opens the unified create wizard which then asks
   *  whether the user wants a Division or a Team. */
  onAdd?: () => void;
  /** Click on the dashed "Add team" slot inside a division — opens the
   *  create wizard with kind=team and parent prefilled to that division. */
  onAddTeamUnder?: (divisionId: string) => void;
  /** Toggle a node's `published` flag from the inline status chip. */
  onTogglePublished?: (nodeId: string, next: boolean) => void;
  /** Opens the fullscreen editor (read-only preview only). */
  onEdit?: () => void;
};

// The world's origin is at (0, 0) and the tree layout offsets from there.
// We default the view onto the upper-left region of the content extent —
// the first render's auto-fit effect will recenter onto the actual nodes.
const DEFAULT_VIEW: View = {
  centerX: 0,
  centerY: 0,
  zoom: 1
};

const NODE_STATUS_OPTIONS = [
  { value: "draft", label: "Draft", color: "amber" },
  { value: "published", label: "Published", color: "emerald" }
] as const;

function NodeStatusChip({
  published,
  canWrite,
  compact = false,
  onToggle
}: {
  published: boolean;
  canWrite: boolean;
  /** Hide the picker chevron so the chip footprint matches the static
   *  variant. Used in team rows where the card is narrow and the extra
   *  ~18px would push the team name into truncation. */
  compact?: boolean;
  onToggle?: (next: boolean) => void;
}) {
  const variant = published ? "success" : "warning";
  const chip = canWrite && onToggle ? (
    <Chip
      picker={{
        value: published ? "published" : "draft",
        options: [...NODE_STATUS_OPTIONS],
        onChange: (value) => onToggle(value === "published"),
        hideCaret: compact
      }}
      status
    />
  ) : (
    <Chip label={published ? "Published" : "Draft"} status variant={variant} />
  );
  // Inline-flex so the chip aligns to the flex row's middle instead of
  // sitting on the text baseline (which produces a phantom gap above it).
  // stopPropagation on the wrapper so clicking the dropdown doesn't
  // select the surrounding card.
  return (
    <span
      className="inline-flex shrink-0 items-center"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {chip}
    </span>
  );
}

function ProgramRootCard({
  bounds,
  programName,
  programStatus,
  picker,
  selected,
  onClick
}: {
  bounds: CanvasBounds;
  programName: string;
  programStatus: ProgramStatus;
  picker?: ProgramStatusPicker;
  selected: boolean;
  onClick: () => void;
}) {
  const fallbackVariant = programStatus === "published" ? "success" : programStatus === "archived" ? "destructive" : "warning";
  return (
    <Card
      className={cn(
        "absolute flex items-center justify-center gap-2 px-4 transition-shadow select-none",
        selected ? "ring-2 ring-accent ring-offset-1 ring-offset-canvas shadow-floating" : "hover:shadow-floating"
      )}
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        // Force height to match the layout's reserved bounds so the
        // connector line anchored at `bounds.y + bounds.height` lands
        // exactly at the card's bottom edge — no visible gap.
        height: bounds.height,
        cursor: "pointer"
      }}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      data-program-node-box="true"
    >
      <span
        className="min-w-0 truncate text-base font-semibold leading-tight text-text"
        title={programName}
      >
        {programName}
      </span>
      <span
        className="inline-flex shrink-0 items-center"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        {picker ? (
          <Chip
            picker={{
              value: picker.value,
              options: picker.options,
              onChange: (value) => picker.onChange(value as ProgramStatus),
              disabled: picker.disabled
            }}
            status
          />
        ) : (
          <Chip label={programStatus} status variant={fallbackVariant} />
        )}
      </span>
    </Card>
  );
}

function TeamCard({
  node,
  counts,
  selected,
  canWrite,
  mode,
  onClick,
  onTogglePublished
}: {
  node: ProgramMapNode;
  counts: { memberCount: number; staffCount: number } | undefined;
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

  return (
    <Card
      ref={droppable.setNodeRef as unknown as React.Ref<HTMLDivElement>}
      className={cn(
        "flex items-center gap-2 px-3 py-2 transition-colors duration-150 select-none",
        selected
          ? "ring-2 ring-accent ring-offset-1 ring-offset-canvas"
          : droppable.isOver
            ? "ring-2 ring-success ring-offset-1 ring-offset-canvas"
            : "hover:bg-surface-muted/40"
      )}
      style={{ cursor: "pointer" }}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      data-program-node-box="true"
    >
      <span
        className="min-w-0 truncate text-sm font-medium leading-tight text-text"
        title={node.name}
      >
        {node.name}
      </span>
      <NodeStatusChip
        canWrite={canWrite}
        onToggle={onTogglePublished ? (next) => onTogglePublished(node.id, next) : undefined}
        published={node.isPublished}
      />
      <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-medium text-text-muted" title="Players">
        <Users aria-hidden className="h-3.5 w-3.5" />
        {counts?.memberCount ?? 0}
        {node.capacity !== null ? `/${node.capacity}` : ""}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-text-muted" title="Staff">
        <Shield aria-hidden className="h-3.5 w-3.5" />
        {counts?.staffCount ?? 0}
      </span>
    </Card>
  );
}

function AddTeamContainer({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex justify-start">
      <Button
        intent="add"
        object="team"
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        size="sm"
        variant="ghost"
      />
    </div>
  );
}

function DivisionCard({
  node,
  bounds,
  counts,
  teams,
  teamCountsById,
  selectedNodeId,
  canWrite,
  mode,
  onClick,
  onSelectNode,
  onTogglePublished,
  onAddTeamUnder
}: {
  node: ProgramMapNode;
  bounds: CanvasBounds;
  counts: { assignedCount: number; unassignedCount: number } | undefined;
  teams: ProgramMapNode[];
  teamCountsById: ProgramMapNodeCounts["teams"];
  selectedNodeId: string | null;
  canWrite: boolean;
  mode: EditorMode;
  onClick: () => void;
  onSelectNode: (nodeId: string) => void;
  onTogglePublished?: (nodeId: string, next: boolean) => void;
  onAddTeamUnder?: (divisionId: string) => void;
}) {
  const selected = selectedNodeId === node.id;
  return (
    <Card
      className={cn(
        "absolute flex flex-col gap-2 p-3 transition-shadow select-none",
        selected ? "ring-2 ring-accent ring-offset-1 ring-offset-canvas shadow-floating" : "hover:shadow-floating"
      )}
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        cursor: "pointer"
      }}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      data-program-node-box="true"
    >
      <div className="flex items-center gap-3">
        <span
          className="min-w-0 truncate text-base font-semibold leading-tight text-text"
          title={node.name}
        >
          {node.name}
        </span>
        <NodeStatusChip
          canWrite={canWrite}
          onToggle={onTogglePublished ? (next) => onTogglePublished(node.id, next) : undefined}
          published={node.isPublished}
        />
      </div>
      <div className="flex items-center gap-4 text-xs font-medium text-text-muted">
        <span className="inline-flex items-center gap-1" title="Assigned players">
          <Users aria-hidden className="h-3.5 w-3.5" />
          {counts?.assignedCount ?? 0} assigned
        </span>
        <span className="inline-flex items-center gap-1" title="Unassigned registrants">
          <CircleDot aria-hidden className="h-3.5 w-3.5" />
          {counts?.unassignedCount ?? 0} unassigned
        </span>
      </div>

      {teams.map((team) => (
        <TeamCard
          key={team.id}
          node={team}
          counts={teamCountsById[team.id]}
          selected={selectedNodeId === team.id}
          canWrite={canWrite}
          mode={mode}
          onClick={() => onSelectNode(team.id)}
          onTogglePublished={onTogglePublished}
        />
      ))}

      {canWrite && onAddTeamUnder ? <AddTeamContainer onClick={() => onAddTeamUnder(node.id)} /> : null}
    </Card>
  );
}

export function ProgramMapEditor({
  nodes,
  selectedNodeId,
  canWrite,
  mode,
  programName,
  programStatus,
  programStatusPicker,
  nodeCounts,
  isSaving = false,
  readOnly = false,
  onSelectNode,
  onAdd,
  onAddTeamUnder,
  onEdit,
  assignmentsOpen = false,
  onToggleAssignments,
  onTogglePublished
}: ProgramMapEditorProps) {
  const effectiveCanWrite = canWrite && !readOnly;
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [view, setView] = React.useState<View>(DEFAULT_VIEW);
  const [interaction, setInteraction] = React.useState<Interaction>(null);
  const rawPanelOffset = usePanelOffset();
  const panelOffset = readOnly ? 0 : rawPanelOffset;
  const [containerSize, setContainerSize] = React.useState<{ width: number; height: number }>({ width: 0, height: 0 });
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

  // Compute deterministic positions from the tree of nodes — overrides any
  // stored map_* geometry. The map is now a layout, not a free canvas.
  const layout = React.useMemo(
    () =>
      computeTreeLayout(
        nodes.map((node) => ({
          id: node.id,
          programId: node.programId,
          parentId: node.parentId,
          name: node.name,
          slug: node.slug,
          nodeKind: node.nodeKind,
          sortIndex: 0,
          capacity: node.capacity,
          waitlistEnabled: false,
          settingsJson: { published: node.isPublished },
          mapBounds: null,
          mapZIndex: 0,
          createdAt: "",
          updatedAt: ""
        }))
      ),
    [nodes]
  );

  const beginPan = (event: React.PointerEvent<HTMLDivElement>) => {
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
    if (interaction.mode === "pan") {
      const dx = event.clientX - interaction.pointerClientStart.x;
      const dy = event.clientY - interaction.pointerClientStart.y;
      setView({
        ...interaction.viewStart,
        centerX: interaction.viewStart.centerX - dx / interaction.viewStart.zoom,
        centerY: interaction.viewStart.centerY - dy / interaction.viewStart.zoom
      });
    }
  };

  const endInteraction = () => setInteraction(null);

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
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

  // Cards live in world space and ride a single transform that pans and
  // zooms the whole tree as one unit. The current "regular sizing" in
  // treeLayout.ts is the zoom=1 baseline — at zoom 2 the cards (and their
  // text, padding, strokes) appear twice as big, just like the old grid
  // approach but anchored against the new layout dimensions.
  const visibleCenterY = containerSize.height / 2;
  const worldTransform = `translate(${visibleCenterX - view.centerX * view.zoom}px, ${visibleCenterY - view.centerY * view.zoom}px) scale(${view.zoom})`;

  const gridCellPx = CANVAS_GRID_SIZE * view.zoom;
  const gridOriginX = visibleCenterX - view.centerX * view.zoom;
  const gridOriginY = visibleCenterY - view.centerY * view.zoom;

  const zoomBy = (factor: number) => {
    const nextZoom = Math.max(CANVAS_MIN_ZOOM, Math.min(CANVAS_MAX_ZOOM, view.zoom * factor));
    setView((current) => ({ ...current, zoom: nextZoom }));
  };

  const fitToContent = React.useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      setView(DEFAULT_VIEW);
      return;
    }
    const c = layout.contentBounds;
    if (c.width === 0 || c.height === 0) {
      setView(DEFAULT_VIEW);
      return;
    }
    const pad = 96;
    const w = c.width + pad * 2;
    const h = c.height + pad * 2;
    const visibleWidth = Math.max(1, rect.width - panelOffset);
    const zoom = Math.max(
      CANVAS_MIN_ZOOM,
      Math.min(CANVAS_MAX_ZOOM, Math.min(visibleWidth / w, rect.height / h))
    );
    setView({ centerX: c.x + c.width / 2, centerY: c.y + c.height / 2, zoom });
  }, [layout.contentBounds, panelOffset]);

  const focusNode = React.useCallback(
    (nodeId: string) => {
      const bounds = layout.nodeBounds.get(nodeId);
      if (!bounds) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pad = 96;
      const w = bounds.width + pad * 2;
      const h = bounds.height + pad * 2;
      const visibleWidth = Math.max(1, rect.width - panelOffset);
      const zoom = Math.max(
        CANVAS_MIN_ZOOM,
        Math.min(CANVAS_MAX_ZOOM, 1.4, Math.min(visibleWidth / w, rect.height / h))
      );
      setView({
        centerX: bounds.x + bounds.width / 2,
        centerY: bounds.y + bounds.height / 2,
        zoom
      });
    },
    [layout.nodeBounds, panelOffset]
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

  // Auto-fit when content changes (e.g. division added) or the container
  // settles at a noticeably different size. Re-fitting on size change is
  // important inside the fullscreen Popup: the editor mounts while the
  // popup is mid-animation, so the first measurement is an intermediate
  // (smaller) rect. Without re-fitting, auto-fit picks a zoom calibrated
  // for that mid-animation size and the cards end up smaller than they
  // should be. The preview doesn't have this problem because it lives in
  // a fixed-height (480px) card from mount.
  const lastFitKeyRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (containerSize.width === 0 || containerSize.height === 0) return;
    // Round to 32px buckets so small layout reflows (scrollbars, focus
    // rings, etc.) don't keep resetting the user's pan/zoom.
    const w = Math.round(containerSize.width / 32);
    const h = Math.round(containerSize.height / 32);
    const key = `${w}x${h}:${nodes.length}`;
    if (key === lastFitKeyRef.current) return;
    lastFitKeyRef.current = key;
    fitToContent();
  }, [fitToContent, nodes.length, containerSize.width, containerSize.height]);

  // SVG connector paths in WORLD coordinates. The SVG itself lives inside
  // the transformed wrapper, so the transform handles pan/zoom for us —
  // endpoints anchor at the world position of each card's bottom-center
  // and top-center. Stroke scales with the transform too, which is what
  // we want now that everything resizes together.
  const edgePaths = React.useMemo(() => {
    const boundsOf = (id: string): CanvasBounds | null => {
      if (id === PROGRAM_ROOT_ID) return layout.programBounds;
      return layout.nodeBounds.get(id) ?? null;
    };
    return layout.edges
      .map((edge) => {
        const from = boundsOf(edge.from);
        const to = boundsOf(edge.to);
        if (!from || !to) return null;
        const cx1 = from.x + from.width / 2;
        const cx2 = to.x + to.width / 2;
        const y1 = from.y + from.height;
        const y2 = to.y;
        // Snap the vertical stems to the nearest grid line. When the
        // parent or child center isn't grid-aligned (e.g. a 408-wide
        // program card has its center 12px off the grid), the stem
        // would otherwise drift off-grid. A tiny horizontal jog at the
        // parent's bottom and child's top keeps the line anchored to
        // the cards' centers while the long stems ride a grid line.
        const stemX1 = snapToGrid(cx1);
        const stemX2 = snapToGrid(cx2);
        const midY = (y1 + y2) / 2;
        const path = `M ${cx1} ${y1} H ${stemX1} V ${midY} H ${stemX2} V ${y2} H ${cx2}`;
        return { key: `${edge.from}->${edge.to}`, path };
      })
      .filter((entry): entry is { key: string; path: string } => entry !== null);
  }, [layout]);

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
        {/* World layer — a single transform handles pan + zoom for every
            card and connector. Cards live in world coordinates; the layout
            constants in treeLayout.ts are the zoom=1 pixel sizes, and
            zooming scales everything (text, padding, strokes) together. */}
        <div
          className="absolute left-0 top-0"
          style={{ transformOrigin: "0 0", transform: worldTransform }}
        >
          {/* Connector lines — paths in world coordinates, rendered behind
              the cards so card borders read as the dominant edge. */}
          <svg
            className="pointer-events-none absolute left-0 top-0"
            style={{ width: 1, height: 1, overflow: "visible" }}
          >
            <g fill="none" stroke="currentColor" strokeWidth={2} className="text-border-strong/60">
              {edgePaths.map((edge) => (
                <path key={edge.key} d={edge.path} />
              ))}
            </g>
          </svg>

          <ProgramRootCard
            bounds={layout.programBounds}
            programName={programName}
            programStatus={programStatus}
            picker={programStatusPicker}
            selected={selectedNodeId === PROGRAM_ROOT_ID}
            onClick={() => onSelectNode(PROGRAM_ROOT_ID)}
          />

          {nodes
            .filter((node) => node.nodeKind === "division")
            .map((division) => {
              const bounds = layout.nodeBounds.get(division.id);
              if (!bounds) return null;
              const teams = nodes.filter(
                (n) => n.nodeKind === "team" && n.parentId === division.id
              );
              return (
              <DivisionCard
                key={division.id}
                node={division}
                bounds={bounds}
                counts={nodeCounts.divisions[division.id]}
                teams={teams}
                teamCountsById={nodeCounts.teams}
                selectedNodeId={selectedNodeId}
                canWrite={effectiveCanWrite}
                mode={mode}
                onClick={() => onSelectNode(division.id)}
                onSelectNode={onSelectNode}
                onTogglePublished={onTogglePublished}
                onAddTeamUnder={onAddTeamUnder}
              />
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

      <div
        className="pointer-events-none absolute inset-0"
        style={{ transform: `translateX(${-panelOffset / 2}px)` }}
      >
        <EditorActionBar
          readOnly={readOnly}
          onEdit={onEdit}
          canWrite={effectiveCanWrite}
          isSaving={isSaving}
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
              <Button intent="add" onClick={onAdd} size="sm" variant="ghost">Add</Button>
            ) : undefined
          }
        />
      </div>
    </div>
  );
}
