"use client";

import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import { ChevronDown, FolderPlus, Plus, Users } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { PickerMenu } from "@orgframe/ui/primitives/picker-menu";
import {
  CANVAS_GRID_SIZE,
  CANVAS_HEIGHT,
  CANVAS_WIDTH
} from "@/src/features/canvas/core/constants";
import { connectorAnchorBottom, connectorAnchorTop, snapToGrid } from "@/src/features/canvas/core/geometry";
import type { CanvasBounds } from "@/src/features/canvas/core/types";
import { sortNodesDeterministic } from "@/src/features/canvas/core/geometry";
import { EditorActionBar } from "@/src/features/canvas/components/EditorActionBar";
import type { ProgramMapNode } from "@/src/features/programs/map/types";

const CANVAS_MIN_ZOOM = 0.25;
const CANVAS_MAX_ZOOM = 4;

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
  onAddDivision?: () => void;
  onAddTeam?: () => void;
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
  view: View
): Pointer {
  const offsetX = clientX - rect.left - rect.width / 2;
  const offsetY = clientY - rect.top - rect.height / 2;
  return {
    x: view.centerX + offsetX / view.zoom,
    y: view.centerY + offsetY / view.zoom
  };
}

function NodeBox({
  node,
  selected,
  canWrite,
  mode,
  onPointerDownMove,
  onPointerDownResize,
  onClick
}: {
  node: ProgramMapNode;
  selected: boolean;
  canWrite: boolean;
  mode: EditorMode;
  onPointerDownMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerDownResize: (event: React.PointerEvent<HTMLDivElement>) => void;
  onClick: () => void;
}) {
  const isTeam = node.nodeKind === "team";
  const droppable = useDroppable({
    id: `node:${node.id}`,
    disabled: mode !== "assignments" || !isTeam,
    data: { nodeId: node.id, nodeKind: node.nodeKind }
  });

  const baseClasses = isTeam
    ? "bg-surface border-border"
    : "bg-surface-strong border-border-strong";

  const ringClass = selected
    ? "ring-2 ring-primary"
    : droppable.isOver
      ? "ring-2 ring-success"
      : "";

  return (
    <div
      ref={droppable.setNodeRef}
      className={`absolute rounded-control border ${baseClasses} ${ringClass} shadow-sm transition-shadow`}
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
      <div className="flex h-full flex-col px-3 py-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
          {node.nodeKind}
        </div>
        <div className="mt-0.5 line-clamp-2 text-sm font-semibold text-foreground">
          {node.name}
        </div>
        {node.capacity !== null && (
          <div className="mt-auto text-xs text-foreground-subtle">cap {node.capacity}</div>
        )}
      </div>
      {canWrite && mode === "structure" && (
        <div
          className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize bg-primary opacity-0 hover:opacity-100"
          style={{ borderTopLeftRadius: 4 }}
          onPointerDown={onPointerDownResize}
        />
      )}
    </div>
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
  onAddDivision,
  onAddTeam,
  onEdit
}: ProgramMapEditorProps) {
  const effectiveCanWrite = canWrite && !readOnly;
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [view, setView] = React.useState<View>(DEFAULT_VIEW);
  const [interaction, setInteraction] = React.useState<Interaction>(null);

  const sorted = React.useMemo(() => sortNodesDeterministic(nodes), [nodes]);

  const beginMove = (event: React.PointerEvent<HTMLDivElement>, nodeId: string) => {
    if (!effectiveCanWrite || mode !== "structure") return;
    event.stopPropagation();
    event.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pointer = clientToWorld(event.clientX, event.clientY, rect, view);
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
    const pointer = clientToWorld(event.clientX, event.clientY, rect, view);
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

    const pointer = clientToWorld(event.clientX, event.clientY, rect, view);
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
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    const nextZoom = Math.max(CANVAS_MIN_ZOOM, Math.min(CANVAS_MAX_ZOOM, view.zoom * factor));
    if (nextZoom === view.zoom) return;
    const cursorWorld = clientToWorld(event.clientX, event.clientY, rect, view);
    setView({
      zoom: nextZoom,
      centerX: cursorWorld.x - (cursorWorld.x - view.centerX) * (view.zoom / nextZoom),
      centerY: cursorWorld.y - (cursorWorld.y - view.centerY) * (view.zoom / nextZoom)
    });
  };

  const childTransform = `translate(50%, 50%) scale(${view.zoom}) translate(${-view.centerX}px, ${-view.centerY}px)`;

  // Infinite grid: rendered on the outer (untransformed) container so it
  // covers the full viewport regardless of pan. We tile a unit grid at the
  // current zoom and offset by the world origin's screen position so the
  // lines visually move with the world.
  const gridCellPx = CANVAS_GRID_SIZE * view.zoom;
  const gridOffsetX = -view.centerX * view.zoom;
  const gridOffsetY = -view.centerY * view.zoom;

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
    const zoom = Math.max(
      CANVAS_MIN_ZOOM,
      Math.min(CANVAS_MAX_ZOOM, Math.min(rect.width / w, rect.height / h))
    );
    setView({ centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2, zoom });
  }, [nodes]);

  // First-paint fit: when the editor mounts (or remounts via popupSession), pull
  // the view to enclose all current nodes. Behind a ref so it only fires once
  // per mount, not on every nodes change (which would fight active panning).
  const didFitRef = React.useRef(false);
  React.useEffect(() => {
    if (didFitRef.current) return;
    if (nodes.length === 0) return;
    didFitRef.current = true;
    fitToContent();
  }, [fitToContent, nodes.length]);

  // Build connector segments (parent → child line) using shared geometry helpers.
  const connectors = React.useMemo(() => {
    const byId = new Map(nodes.map((node) => [node.id, node] as const));
    return nodes
      .filter((node) => node.parentId && byId.has(node.parentId))
      .map((node) => {
        const parent = byId.get(node.parentId as string)!;
        const from = connectorAnchorBottom(parent.bounds);
        const to = connectorAnchorTop(node.bounds);
        return { id: `${parent.id}->${node.id}`, from, to };
      });
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
      {/* Infinite grid layer. Extends past the popup body's panel-padding
          so the grid runs behind the side panels — panels are opaque
          (`bg-surface`) and sit on top, so the grid simply continues under
          them. backgroundPosition compensates by `panel-width/2` so the
          grid origin stays anchored to the visible (un-padded) area's
          center as `--panel-active-width` animates. */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 bg-surface-subtle"
        style={{
          right: "calc(0px - var(--panel-active-width, 0px))",
          backgroundImage:
            "linear-gradient(to right, rgba(148, 163, 184, 0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(148, 163, 184, 0.18) 1px, transparent 1px)",
          backgroundSize: `${gridCellPx}px ${gridCellPx}px`,
          backgroundPosition: `calc(50% - var(--panel-active-width, 0px) / 2 + ${gridOffsetX}px) calc(50% + ${gridOffsetY}px)`,
          transition:
            "right 220ms cubic-bezier(0.22, 1, 0.36, 1), background-position 220ms cubic-bezier(0.22, 1, 0.36, 1)"
        }}
      />
      <div className="absolute inset-0 overflow-hidden">
      <div
        className="absolute left-0 top-0"
        style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          transformOrigin: "0 0",
          transform: childTransform
        }}
      >
        <svg
          className="pointer-events-none absolute left-0 top-0"
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
        >
          {connectors.map((connector) => {
            const midY = (connector.from.y + connector.to.y) / 2;
            const path = `M ${connector.from.x} ${connector.from.y} C ${connector.from.x} ${midY}, ${connector.to.x} ${midY}, ${connector.to.x} ${connector.to.y}`;
            return (
              <path
                key={connector.id}
                d={path}
                fill="none"
                stroke="rgb(100, 116, 139)"
                strokeWidth={2}
              />
            );
          })}
        </svg>

        {sorted.map((node) => (
          <div key={node.id} data-program-node-box="true">
            <NodeBox
              node={node}
              selected={selectedNodeId === node.id}
              canWrite={effectiveCanWrite}
              mode={mode}
              onPointerDownMove={(event) => beginMove(event, node.id)}
              onPointerDownResize={(event) => beginResize(event, node.id)}
              onClick={() => onSelectNode(node.id)}
            />
          </div>
        ))}
      </div>
      </div>

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
          !readOnly && effectiveCanWrite && (onAddDivision || onAddTeam) ? (
            <PickerMenu
              ariaLabel="Add to map"
              placement="top-end"
              widthClassName="w-[12rem]"
              renderTrigger={({ ref, onClick, open }) => (
                <Button
                  aria-expanded={open}
                  aria-haspopup="menu"
                  onClick={onClick}
                  ref={ref}
                  size="sm"
                  variant="ghost"
                >
                  <Plus />
                  Add
                  <ChevronDown
                    className={`ml-0.5 h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </Button>
              )}
              items={[
                ...(onAddDivision
                  ? [
                      {
                        key: "division",
                        label: "Division",
                        description: "Top-level group",
                        icon: <FolderPlus className="h-4 w-4" />,
                        onSelect: onAddDivision
                      }
                    ]
                  : []),
                ...(onAddTeam
                  ? [
                      {
                        key: "team",
                        label: "Team",
                        description: "Lives inside a division",
                        icon: <Plus className="h-4 w-4" />,
                        onSelect: onAddTeam
                      }
                    ]
                  : [])
              ]}
            />
          ) : undefined
        }
      />
    </div>
  );
}
