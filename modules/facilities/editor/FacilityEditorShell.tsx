"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Move, Plus, Save, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { deleteFacilityNodeAction, upsertFacilityNodeAction } from "@/modules/facilities/actions";
import type { Facility, FacilityMapReadModel, FacilityNode } from "@/modules/facilities/types";
import { DEFAULT_NODE_LAYOUT, sortNodes } from "@/modules/facilities/utils";

type FacilityEditorShellProps = {
  orgSlug: string;
  facility: Facility;
  canWrite: boolean;
  initialReadModel: FacilityMapReadModel;
  onReadModelChange?: (next: FacilityMapReadModel) => void;
};

const CANVAS_WIDTH = 1400;
const CANVAS_HEIGHT = 900;
const GRID_SIZE = 24;
const MIN_NODE_SIZE = 48;
const ZOOM_MIN = 0.45;
const ZOOM_MAX = 2.1;
const ZOOM_STEP = 0.12;

type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type InteractionState = {
  nodeId: string;
  mode: "move" | "resize";
  handle?: ResizeHandle;
  startX: number;
  startY: number;
  originLayout: FacilityNode["layout"];
};

function sortFacilityNodes(readModel: FacilityMapReadModel, facilityId: string) {
  return sortNodes(readModel.nodes.filter((node) => node.facilityId === facilityId));
}

function snapToGrid(value: number) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function clampToCanvas(value: number, max: number) {
  return Math.max(0, Math.min(max, snapToGrid(value)));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeResizedLayout(left: number, top: number, right: number, bottom: number, originLayout: FacilityNode["layout"]) {
  const clampedLeft = clamp(left, 0, CANVAS_WIDTH - MIN_NODE_SIZE);
  const clampedTop = clamp(top, 0, CANVAS_HEIGHT - MIN_NODE_SIZE);
  const clampedRight = clamp(right, clampedLeft + MIN_NODE_SIZE, CANVAS_WIDTH);
  const clampedBottom = clamp(bottom, clampedTop + MIN_NODE_SIZE, CANVAS_HEIGHT);

  const snappedLeft = clampToCanvas(clampedLeft, CANVAS_WIDTH - MIN_NODE_SIZE);
  const snappedTop = clampToCanvas(clampedTop, CANVAS_HEIGHT - MIN_NODE_SIZE);
  const snappedRight = clampToCanvas(clampedRight, CANVAS_WIDTH);
  const snappedBottom = clampToCanvas(clampedBottom, CANVAS_HEIGHT);

  const width = Math.max(MIN_NODE_SIZE, snappedRight - snappedLeft);
  const height = Math.max(MIN_NODE_SIZE, snappedBottom - snappedTop);

  const x = clamp(snappedLeft, 0, CANVAS_WIDTH - width);
  const y = clamp(snappedTop, 0, CANVAS_HEIGHT - height);

  return {
    ...originLayout,
    x,
    y,
    w: width,
    h: height
  };
}

function snapLayoutToGrid(layout: FacilityNode["layout"]) {
  return {
    ...layout,
    x: snapToGrid(layout.x),
    y: snapToGrid(layout.y)
  };
}

export function FacilityEditorShell({ orgSlug, facility, canWrite, initialReadModel, onReadModelChange }: FacilityEditorShellProps) {
  const { toast } = useToast();
  const [readModel, setReadModel] = useState(initialReadModel);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [interactionState, setInteractionState] = useState<InteractionState | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [pan, setPan] = useState({ x: 120, y: 90 });
  const [zoom, setZoom] = useState(1);
  const [isSaving, startSaving] = useTransition();

  const nodes = useMemo(() => sortFacilityNodes(readModel, facility.id), [facility.id, readModel]);
  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);

  useEffect(() => {
    if (selectedNodeId && !nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [nodes, selectedNodeId]);

  useEffect(() => {
    if (!interactionState) {
      return;
    }

    const handleMove = (event: PointerEvent) => {
      setReadModel((current) => ({
        ...current,
        nodes: current.nodes.map((node) => {
          if (node.id !== interactionState.nodeId) {
            return node;
          }

          const deltaX = event.clientX - interactionState.startX;
          const deltaY = event.clientY - interactionState.startY;

          if (interactionState.mode === "move") {
            const nextX = clampToCanvas(interactionState.originLayout.x + deltaX / zoom, CANVAS_WIDTH - node.layout.w);
            const nextY = clampToCanvas(interactionState.originLayout.y + deltaY / zoom, CANVAS_HEIGHT - node.layout.h);

            return {
              ...node,
              layout: {
                ...node.layout,
                x: nextX,
                y: nextY
              }
            };
          }

          const handle = interactionState.handle;
          if (!handle) {
            return node;
          }

          let left = interactionState.originLayout.x;
          let top = interactionState.originLayout.y;
          let right = interactionState.originLayout.x + interactionState.originLayout.w;
          let bottom = interactionState.originLayout.y + interactionState.originLayout.h;

          if (handle.includes("w")) {
            left += deltaX / zoom;
          }
          if (handle.includes("e")) {
            right += deltaX / zoom;
          }
          if (handle.includes("n")) {
            top += deltaY / zoom;
          }
          if (handle.includes("s")) {
            bottom += deltaY / zoom;
          }

          const nextLayout = normalizeResizedLayout(left, top, right, bottom, node.layout);

          return {
            ...node,
            layout: nextLayout
          };
        })
      }));
    };

    const handleUp = () => {
      const movedNode = readModel.nodes.find((node) => node.id === interactionState.nodeId);
      setInteractionState(null);
      if (!movedNode || !canWrite) {
        return;
      }
      void saveNode(movedNode);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [canWrite, interactionState, readModel.nodes, zoom]);

  function applyReadModel(next: FacilityMapReadModel) {
    setReadModel(next);
    onReadModelChange?.(next);
  }

  async function saveNode(node: FacilityNode) {
    const result = await upsertFacilityNodeAction({
      orgSlug,
      nodeId: node.id,
      facilityId: node.facilityId,
      parentNodeId: node.parentNodeId,
      name: node.name,
      nodeKind: node.nodeKind,
      status: node.status,
      isBookable: node.isBookable,
      capacity: node.capacity,
      sortIndex: node.sortIndex,
      layout: node.layout,
      metadataJson: node.metadataJson
    });

    if (!result.ok) {
      toast({
        title: "Unable to save node",
        description: result.error,
        variant: "destructive"
      });
      return;
    }

    applyReadModel(result.data.readModel);
  }

  function mutateNode(nodeId: string, updater: (node: FacilityNode) => FacilityNode) {
    setReadModel((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === nodeId ? updater(node) : node))
    }));
  }

  function createNode(parentNodeId: string | null) {
    if (!canWrite) {
      return;
    }

    startSaving(async () => {
      const nextSort = nodes.filter((node) => node.parentNodeId === parentNodeId).length;
      const result = await upsertFacilityNodeAction({
        orgSlug,
        facilityId: facility.id,
        parentNodeId,
        name: "New space",
        nodeKind: "custom",
        status: "open",
        isBookable: true,
        layout: snapLayoutToGrid(DEFAULT_NODE_LAYOUT),
        sortIndex: nextSort
      });

      if (!result.ok) {
        toast({
          title: "Unable to create node",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      applyReadModel(result.data.readModel);
      setSelectedNodeId(result.data.nodeId);
      toast({ title: "Node created", variant: "success" });
    });
  }

  function deleteNode(nodeId: string) {
    if (!canWrite) {
      return;
    }

    startSaving(async () => {
      const result = await deleteFacilityNodeAction({
        orgSlug,
        nodeId
      });

      if (!result.ok) {
        toast({
          title: "Unable to delete node",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      applyReadModel(result.data.readModel);
      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null);
      }
      toast({ title: "Node deleted", variant: "success" });
    });
  }

  function saveSelectedNode() {
    if (!selectedNode || !canWrite) {
      return;
    }

    startSaving(async () => {
      await saveNode(selectedNode);
      toast({ title: "Node saved", variant: "success" });
    });
  }

  function startMoveInteraction(node: FacilityNode, event: React.PointerEvent) {
    if (!canWrite) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setSelectedNodeId(node.id);
    setInteractionState({
      nodeId: node.id,
      mode: "move",
      startX: event.clientX,
      startY: event.clientY,
      originLayout: node.layout
    });
  }

  function startResizeInteraction(node: FacilityNode, handle: ResizeHandle, event: React.PointerEvent) {
    if (!canWrite) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setSelectedNodeId(node.id);
    setInteractionState({
      nodeId: node.id,
      mode: "resize",
      handle,
      startX: event.clientX,
      startY: event.clientY,
      originLayout: node.layout
    });
  }

  const parentNameById = useMemo(() => new Map(nodes.map((node) => [node.id, node.name])), [nodes]);

  const parentGroups = useMemo(() => {
    const byParent = new Map<string | null, FacilityNode[]>();
    for (const node of nodes) {
      const current = byParent.get(node.parentNodeId) ?? [];
      current.push(node);
      byParent.set(node.parentNodeId, current);
    }

    return Array.from(byParent.entries()).map(([parentNodeId, groupNodes]) => {
      const left = Math.min(...groupNodes.map((node) => node.layout.x));
      const top = Math.min(...groupNodes.map((node) => node.layout.y));
      const right = Math.max(...groupNodes.map((node) => node.layout.x + node.layout.w));
      const bottom = Math.max(...groupNodes.map((node) => node.layout.y + node.layout.h));
      const padding = 20;
      return {
        parentNodeId,
        label: parentNodeId ? `Parent: ${parentNameById.get(parentNodeId) ?? "Unknown"}` : "Parent: Root",
        x: Math.max(0, left - padding),
        y: Math.max(0, top - padding),
        w: Math.min(CANVAS_WIDTH, right + padding) - Math.max(0, left - padding),
        h: Math.min(CANVAS_HEIGHT, bottom + padding) - Math.max(0, top - padding)
      };
    });
  }, [nodes, parentNameById]);

  function updateZoom(nextZoom: number) {
    setZoom(clamp(nextZoom, ZOOM_MIN, ZOOM_MAX));
  }

  function handleCanvasWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    updateZoom(zoom + direction * ZOOM_STEP);
  }

  function handleViewportPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("[data-pan-block='true']")) {
      return;
    }

    setIsPanning(true);
    const originX = pan.x;
    const originY = pan.y;
    const startX = event.clientX;
    const startY = event.clientY;

    const handleMove = (moveEvent: PointerEvent) => {
      setPan({
        x: originX + (moveEvent.clientX - startX),
        y: originY + (moveEvent.clientY - startY)
      });
    };

    const handleUp = () => {
      setIsPanning(false);
      window.removeEventListener("pointermove", handleMove);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  }

  const selectedPanelStyle = useMemo(() => {
    if (!selectedNode) {
      return null;
    }

    const idealLeft = selectedNode.layout.x + selectedNode.layout.w + 20;
    const maxLeft = CANVAS_WIDTH - 360;
    const left = Math.max(12, Math.min(maxLeft, idealLeft));
    const idealTop = selectedNode.layout.y;
    const maxTop = CANVAS_HEIGHT - 520;
    const top = Math.max(12, Math.min(maxTop, idealTop));

    return {
      left: `${left}px`,
      top: `${top}px`
    };
  }, [selectedNode]);

  return (
    <div className="relative h-full min-h-0">
      {isSaving ? (
        <div className="absolute inset-x-0 top-0 z-30 px-4 pt-2">
          <Alert variant="info">Saving map changes...</Alert>
        </div>
      ) : null}
      <div
        className={isPanning ? "relative h-full min-h-0 overflow-hidden rounded-control border bg-surface cursor-grabbing" : "relative h-full min-h-0 overflow-hidden rounded-control border bg-surface cursor-grab"}
        onPointerDown={handleViewportPointerDown}
        onWheel={handleCanvasWheel}
      >
        <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-4" data-pan-block="true">
          <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-full border border-border/80 bg-surface/95 px-2 py-2 shadow-[0_12px_30px_hsl(220_35%_12%/0.14)] backdrop-blur">
            <Button disabled={!canWrite} onClick={() => createNode(null)} size="sm" type="button" variant="secondary">
              <Plus className="h-4 w-4" />
              Root
            </Button>
            <Button
              disabled={!canWrite || !selectedNode}
              onClick={() => createNode(selectedNode?.id ?? null)}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Plus className="h-4 w-4" />
              Child
            </Button>
            <Button
              disabled={!canWrite || !selectedNode}
              onClick={() => createNode(selectedNode?.parentNodeId ?? null)}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Plus className="h-4 w-4" />
              Sibling
            </Button>
            <Button
              className="text-danger"
              disabled={!canWrite || !selectedNode}
              onClick={() => {
                if (selectedNode) {
                  deleteNode(selectedNode.id);
                }
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
            <Button disabled={!canWrite || !selectedNode} onClick={saveSelectedNode} size="sm" type="button">
              <Save className="h-4 w-4" />
              Save
            </Button>
            <Button onClick={() => setSelectedNodeId(null)} size="sm" type="button" variant="ghost">
              Clear
            </Button>
            <Button onClick={() => updateZoom(zoom + ZOOM_STEP)} size="sm" type="button" variant="secondary">
              Zoom in
            </Button>
            <Button onClick={() => updateZoom(zoom - ZOOM_STEP)} size="sm" type="button" variant="secondary">
              Zoom out
            </Button>
          </div>
        </div>

        <div
          className="absolute left-0 top-0"
          style={{
            width: `${CANVAS_WIDTH}px`,
            height: `${CANVAS_HEIGHT}px`,
            backgroundColor: "hsl(var(--surface))",
            backgroundImage:
              "linear-gradient(hsl(var(--border)/0.55) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)/0.55) 1px, transparent 1px)",
            backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "top left"
          }}
        >
          {parentGroups.map((group) => (
            <div
              className="pointer-events-none absolute rounded-control border-2 border-dashed border-accent/45 bg-accent/5"
              key={group.parentNodeId ?? "root"}
              style={{
                left: `${group.x}px`,
                top: `${group.y}px`,
                width: `${group.w}px`,
                height: `${group.h}px`
              }}
            >
              <span className="absolute -top-6 left-0 rounded-full border border-accent/35 bg-surface px-2 py-0.5 text-[11px] font-semibold text-text-muted">
                {group.label}
              </span>
            </div>
          ))}

          {nodes.map((node) => (
            <div
              className={
                node.id === selectedNodeId
                  ? "absolute rounded-control border border-accent bg-accent/20 px-2 py-2 text-left shadow-sm"
                  : "absolute rounded-control border border-border bg-surface px-2 py-2 text-left shadow-sm"
              }
              data-pan-block="true"
              key={node.id}
              onClick={() => setSelectedNodeId(node.id)}
              style={{
                left: `${node.layout.x}px`,
                top: `${node.layout.y}px`,
                width: `${node.layout.w}px`,
                height: `${node.layout.h}px`,
                zIndex: node.layout.z
              }}
            >
              <p className="truncate text-sm font-semibold text-text">{node.name}</p>
              <p className="truncate text-xs text-text-muted">{node.nodeKind}</p>

              {node.id === selectedNodeId ? (
                <>
                  <button
                    aria-label="Move node"
                    className="absolute left-1/2 top-[-12px] z-10 inline-flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-surface text-text-muted shadow-sm hover:text-text"
                    onPointerDown={(event) => startMoveInteraction(node, event)}
                    type="button"
                  >
                    <Move className="h-3.5 w-3.5" />
                  </button>

                  <button
                    aria-label="Resize north"
                    className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 cursor-ns-resize rounded-full border border-border bg-surface shadow-sm"
                    onPointerDown={(event) => startResizeInteraction(node, "n", event)}
                    type="button"
                  />
                  <button
                    aria-label="Resize south"
                    className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 cursor-ns-resize rounded-full border border-border bg-surface shadow-sm"
                    onPointerDown={(event) => startResizeInteraction(node, "s", event)}
                    type="button"
                  />
                  <button
                    aria-label="Resize east"
                    className="absolute right-[-8px] top-1/2 h-4 w-4 -translate-y-1/2 cursor-ew-resize rounded-full border border-border bg-surface shadow-sm"
                    onPointerDown={(event) => startResizeInteraction(node, "e", event)}
                    type="button"
                  />
                  <button
                    aria-label="Resize west"
                    className="absolute left-[-8px] top-1/2 h-4 w-4 -translate-y-1/2 cursor-ew-resize rounded-full border border-border bg-surface shadow-sm"
                    onPointerDown={(event) => startResizeInteraction(node, "w", event)}
                    type="button"
                  />
                  <button
                    aria-label="Resize north-west"
                    className="absolute -left-2 -top-2 h-4 w-4 cursor-nwse-resize rounded-full border border-border bg-surface shadow-sm"
                    onPointerDown={(event) => startResizeInteraction(node, "nw", event)}
                    type="button"
                  />
                  <button
                    aria-label="Resize north-east"
                    className="absolute -right-2 -top-2 h-4 w-4 cursor-nesw-resize rounded-full border border-border bg-surface shadow-sm"
                    onPointerDown={(event) => startResizeInteraction(node, "ne", event)}
                    type="button"
                  />
                  <button
                    aria-label="Resize south-west"
                    className="absolute -bottom-2 -left-2 h-4 w-4 cursor-nesw-resize rounded-full border border-border bg-surface shadow-sm"
                    onPointerDown={(event) => startResizeInteraction(node, "sw", event)}
                    type="button"
                  />
                  <button
                    aria-label="Resize south-east"
                    className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-full border border-border bg-surface shadow-sm"
                    onPointerDown={(event) => startResizeInteraction(node, "se", event)}
                    type="button"
                  />
                </>
              ) : null}
            </div>
          ))}

          {!selectedNode ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
              <div className="rounded-full border border-border/70 bg-surface/95 px-4 py-2 text-xs text-text-muted shadow-sm backdrop-blur">
                Click a node to edit it. Drag to reposition on the grid.
              </div>
            </div>
          ) : null}

          {selectedNode && selectedPanelStyle ? (
            <div className="absolute z-30 w-[340px]" data-pan-block="true" style={selectedPanelStyle}>
              <div className="rounded-card border border-border/85 bg-surface/98 p-3 shadow-[0_18px_40px_hsl(220_35%_12%/0.2)] backdrop-blur">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-text">Edit node</p>
                  <Button onClick={() => setSelectedNodeId(null)} size="sm" type="button" variant="ghost">
                    Done
                  </Button>
                </div>

                <div className="space-y-3">
                  <FormField label="Name">
                    <Input
                      disabled={!canWrite}
                      onChange={(event) => mutateNode(selectedNode.id, (node) => ({ ...node, name: event.target.value }))}
                      value={selectedNode.name}
                    />
                  </FormField>

                  <FormField label="Parent node">
                    <Select
                      disabled={!canWrite}
                      onChange={(event) =>
                        mutateNode(selectedNode.id, (node) => ({
                          ...node,
                          parentNodeId: event.target.value || null
                        }))
                      }
                      options={[
                        { value: "", label: "No parent" },
                        ...nodes
                          .filter((node) => node.id !== selectedNode.id)
                          .map((node) => ({
                            value: node.id,
                            label: node.name
                          }))
                      ]}
                      value={selectedNode.parentNodeId ?? ""}
                    />
                  </FormField>

                  <FormField label="Node kind">
                    <Select
                      disabled={!canWrite}
                      onChange={(event) =>
                        mutateNode(selectedNode.id, (node) => ({
                          ...node,
                          nodeKind: event.target.value as FacilityNode["nodeKind"]
                        }))
                      }
                      options={[
                        { value: "facility", label: "Facility" },
                        { value: "zone", label: "Zone" },
                        { value: "building", label: "Building" },
                        { value: "section", label: "Section" },
                        { value: "field", label: "Field" },
                        { value: "court", label: "Court" },
                        { value: "diamond", label: "Diamond" },
                        { value: "rink", label: "Rink" },
                        { value: "room", label: "Room" },
                        { value: "amenity", label: "Amenity" },
                        { value: "parking", label: "Parking" },
                        { value: "support_area", label: "Support area" },
                        { value: "custom", label: "Custom" }
                      ]}
                      value={selectedNode.nodeKind}
                    />
                  </FormField>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="Width">
                      <Input
                        disabled={!canWrite}
                        min={MIN_NODE_SIZE}
                        onChange={(event) =>
                          mutateNode(selectedNode.id, (node) => ({
                            ...node,
                            layout: {
                              ...node.layout,
                              w: Number.parseInt(event.target.value || "0", 10) || MIN_NODE_SIZE
                            }
                          }))
                        }
                        type="number"
                        value={String(selectedNode.layout.w)}
                      />
                    </FormField>
                    <FormField label="Height">
                      <Input
                        disabled={!canWrite}
                        min={MIN_NODE_SIZE}
                        onChange={(event) =>
                          mutateNode(selectedNode.id, (node) => ({
                            ...node,
                            layout: {
                              ...node.layout,
                              h: Number.parseInt(event.target.value || "0", 10) || MIN_NODE_SIZE
                            }
                          }))
                        }
                        type="number"
                        value={String(selectedNode.layout.h)}
                      />
                    </FormField>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="Status">
                      <Select
                        disabled={!canWrite}
                        onChange={(event) =>
                          mutateNode(selectedNode.id, (node) => ({
                            ...node,
                            status: event.target.value as FacilityNode["status"]
                          }))
                        }
                        options={[
                          { value: "open", label: "Open" },
                          { value: "closed", label: "Closed" },
                          { value: "archived", label: "Archived" }
                        ]}
                        value={selectedNode.status}
                      />
                    </FormField>
                    <FormField label="Capacity">
                      <Input
                        disabled={!canWrite}
                        min={0}
                        onChange={(event) =>
                          mutateNode(selectedNode.id, (node) => ({
                            ...node,
                            capacity: event.target.value.trim().length > 0 ? Number.parseInt(event.target.value, 10) : null
                          }))
                        }
                        type="number"
                        value={selectedNode.capacity?.toString() ?? ""}
                      />
                    </FormField>
                  </div>

                  <label className="ui-inline-toggle">
                    <Checkbox
                      checked={selectedNode.isBookable}
                      disabled={!canWrite}
                      onChange={(event) => mutateNode(selectedNode.id, (node) => ({ ...node, isBookable: event.target.checked }))}
                    />
                    Bookable
                  </label>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
