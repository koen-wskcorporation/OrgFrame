"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@orgframe/ui/primitives/button";
import { CANVAS_CORNER_RADIUS, CANVAS_GRID_SIZE } from "@/src/features/canvas/core/constants";
import { boundsFromPoints, normalizeNodeGeometry, rectPoints, snapToGrid } from "@/src/features/canvas/core/geometry";
import { normalizeLayout } from "@/src/features/canvas/core/layout";
import type { CanvasNode, CanvasPoint } from "@/src/features/canvas/core/types";
import { GridCanvasShell } from "@/src/features/canvas/components/GridCanvasShell";
import type { FacilityMapNode } from "@/src/features/facilities/map/types";

type InteractionState =
  | {
      mode: "move";
      nodeId: string;
      startPointer: CanvasPoint;
      startBounds: { x: number; y: number };
    }
  | {
      mode: "resize";
      nodeId: string;
      startPointer: CanvasPoint;
      startBounds: { x: number; y: number; width: number; height: number };
    }
  | {
      mode: "point";
      nodeId: string;
      pointIndex: number;
    }
  | null;

type FacilityMapEditorProps = {
  nodes: FacilityMapNode[];
  selectedNodeId: string | null;
  canWrite: boolean;
  onSelectNode: (nodeId: string | null) => void;
  onChangeNodes: (nodes: FacilityMapNode[]) => void;
};

function toCanvasPoint(svg: SVGSVGElement, event: React.MouseEvent<SVGElement>): CanvasPoint {
  const rect = svg.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

export function FacilityMapEditor({ nodes, selectedNodeId, canWrite, onSelectNode, onChangeNodes }: FacilityMapEditorProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [interaction, setInteraction] = useState<InteractionState>(null);

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const selected = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null;

  const connectors = useMemo(() => {
    const items: Array<{ id: string; from: CanvasPoint; to: CanvasPoint }> = [];
    for (const node of nodes) {
      if (!node.parentEntityId) {
        continue;
      }
      const parent = nodes.find((candidate) => candidate.entityId === node.parentEntityId);
      if (!parent) {
        continue;
      }
      items.push({
        id: `${parent.id}-${node.id}`,
        from: {
          x: parent.bounds.x + parent.bounds.width / 2,
          y: parent.bounds.y + parent.bounds.height
        },
        to: {
          x: node.bounds.x + node.bounds.width / 2,
          y: node.bounds.y
        }
      });
    }
    return items;
  }, [nodes]);

  function applyNodeUpdate(nodeId: string, updater: (current: FacilityMapNode) => FacilityMapNode) {
    const current = nodeById.get(nodeId);
    if (!current) {
      return;
    }
    const nextNode = normalizeNodeGeometry(updater(current));
    const others = nodes.filter((node) => node.id !== nodeId);
    const normalized = normalizeLayout([...others, nextNode]) as FacilityMapNode[];
    onChangeNodes(normalized);
  }

  function handleMouseMove(event: React.MouseEvent<SVGSVGElement>) {
    if (!canWrite || !interaction || !svgRef.current) {
      return;
    }

    const pointer = toCanvasPoint(svgRef.current, event);
    if (interaction.mode === "move") {
      const deltaX = snapToGrid(pointer.x - interaction.startPointer.x);
      const deltaY = snapToGrid(pointer.y - interaction.startPointer.y);
      applyNodeUpdate(interaction.nodeId, (current) => ({
        ...current,
        bounds: {
          ...current.bounds,
          x: interaction.startBounds.x + deltaX,
          y: interaction.startBounds.y + deltaY
        }
      }));
      return;
    }

    if (interaction.mode === "resize") {
      const deltaX = snapToGrid(pointer.x - interaction.startPointer.x);
      const deltaY = snapToGrid(pointer.y - interaction.startPointer.y);
      applyNodeUpdate(interaction.nodeId, (current) => ({
        ...current,
        shapeType: "rectangle",
        bounds: {
          ...current.bounds,
          x: interaction.startBounds.x,
          y: interaction.startBounds.y,
          width: interaction.startBounds.width + deltaX,
          height: interaction.startBounds.height + deltaY
        }
      }));
      return;
    }

    if (interaction.mode === "point") {
      applyNodeUpdate(interaction.nodeId, (current) => {
        if (current.shapeType !== "polygon") {
          return current;
        }
        const points = current.points.map((point, index) =>
          index === interaction.pointIndex
            ? {
                x: snapToGrid(pointer.x),
                y: snapToGrid(pointer.y)
              }
            : point
        );
        const bounds = boundsFromPoints(points);
        return {
          ...current,
          points,
          bounds
        };
      });
    }
  }

  function switchShape(shapeType: "rectangle" | "polygon") {
    if (!canWrite || !selected) {
      return;
    }
    if (shapeType === "rectangle") {
      applyNodeUpdate(selected.id, (current) => ({
        ...current,
        shapeType,
        points: rectPoints(current.bounds)
      }));
      return;
    }

    applyNodeUpdate(selected.id, (current) => {
      const polygonPoints = [
        { x: current.bounds.x, y: current.bounds.y + current.bounds.height / 2 },
        { x: current.bounds.x + current.bounds.width / 2, y: current.bounds.y },
        { x: current.bounds.x + current.bounds.width, y: current.bounds.y + current.bounds.height / 2 },
        { x: current.bounds.x + current.bounds.width / 2, y: current.bounds.y + current.bounds.height }
      ].map((point) => ({
        x: snapToGrid(point.x),
        y: snapToGrid(point.y)
      }));
      return {
        ...current,
        shapeType,
        points: polygonPoints
      };
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!canWrite || !selected} onClick={() => switchShape("rectangle")} size="sm" type="button" variant="secondary">
          Rectangle
        </Button>
        <Button disabled={!canWrite || !selected} onClick={() => switchShape("polygon")} size="sm" type="button" variant="secondary">
          Polygon
        </Button>
      </div>

      <GridCanvasShell>
        <svg
          className="h-full w-full"
          onMouseLeave={() => setInteraction(null)}
          onMouseMove={handleMouseMove}
          onMouseUp={() => setInteraction(null)}
          ref={svgRef}
        >
          {connectors.map((connector) => (
            <path
              d={`M ${connector.from.x} ${connector.from.y} C ${connector.from.x} ${(connector.from.y + connector.to.y) / 2}, ${connector.to.x} ${(connector.from.y + connector.to.y) / 2}, ${connector.to.x} ${connector.to.y}`}
              fill="none"
              key={connector.id}
              stroke="rgba(100, 116, 139, 0.65)"
              strokeDasharray="6 6"
              strokeWidth={2}
            />
          ))}

          {nodes.map((node) => {
            const isSelected = node.id === selectedNodeId;
            return (
              <g key={node.id}>
                {node.shapeType === "rectangle" ? (
                  <rect
                    fill={isSelected ? "rgba(37, 99, 235, 0.16)" : "rgba(15, 23, 42, 0.07)"}
                    height={node.bounds.height}
                    onMouseDown={(event) => {
                      event.stopPropagation();
                      onSelectNode(node.id);
                      if (!canWrite || !svgRef.current) {
                        return;
                      }
                      const pointer = toCanvasPoint(svgRef.current, event);
                      setInteraction({
                        mode: "move",
                        nodeId: node.id,
                        startPointer: pointer,
                        startBounds: { x: node.bounds.x, y: node.bounds.y }
                      });
                    }}
                    rx={CANVAS_CORNER_RADIUS}
                    ry={CANVAS_CORNER_RADIUS}
                    stroke={isSelected ? "#2563eb" : "rgba(30, 41, 59, 0.5)"}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    width={node.bounds.width}
                    x={node.bounds.x}
                    y={node.bounds.y}
                  />
                ) : (
                  <polygon
                    fill={isSelected ? "rgba(37, 99, 235, 0.16)" : "rgba(15, 23, 42, 0.07)"}
                    onMouseDown={(event) => {
                      event.stopPropagation();
                      onSelectNode(node.id);
                      if (!canWrite || !svgRef.current) {
                        return;
                      }
                      const pointer = toCanvasPoint(svgRef.current, event);
                      setInteraction({
                        mode: "move",
                        nodeId: node.id,
                        startPointer: pointer,
                        startBounds: { x: node.bounds.x, y: node.bounds.y }
                      });
                    }}
                    points={node.points.map((point) => `${point.x},${point.y}`).join(" ")}
                    stroke={isSelected ? "#2563eb" : "rgba(30, 41, 59, 0.5)"}
                    strokeLinejoin="round"
                    strokeWidth={isSelected ? 2.5 : 1.5}
                  />
                )}

                <text
                  fill="rgba(15, 23, 42, 0.95)"
                  fontSize={14}
                  fontWeight={600}
                  pointerEvents="none"
                  textAnchor="middle"
                  x={node.bounds.x + node.bounds.width / 2}
                  y={node.bounds.y + node.bounds.height / 2}
                >
                  {node.label}
                </text>

                {isSelected && canWrite && node.shapeType === "rectangle" ? (
                  <rect
                    fill="#2563eb"
                    height={12}
                    onMouseDown={(event) => {
                      event.stopPropagation();
                      if (!svgRef.current) {
                        return;
                      }
                      const pointer = toCanvasPoint(svgRef.current, event);
                      setInteraction({
                        mode: "resize",
                        nodeId: node.id,
                        startPointer: pointer,
                        startBounds: node.bounds
                      });
                    }}
                    width={12}
                    x={node.bounds.x + node.bounds.width - 6}
                    y={node.bounds.y + node.bounds.height - 6}
                  />
                ) : null}

                {isSelected && canWrite && node.shapeType === "polygon"
                  ? node.points.map((point, index) => (
                      <circle
                        cx={point.x}
                        cy={point.y}
                        fill="#2563eb"
                        key={`${node.id}-point-${index}`}
                        onMouseDown={(event) => {
                          event.stopPropagation();
                          setInteraction({
                            mode: "point",
                            nodeId: node.id,
                            pointIndex: index
                          });
                        }}
                        r={6}
                      />
                    ))
                  : null}
              </g>
            );
          })}
        </svg>
      </GridCanvasShell>
    </div>
  );
}
