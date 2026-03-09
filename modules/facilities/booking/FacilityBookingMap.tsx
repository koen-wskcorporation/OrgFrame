"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { FacilityNode, FacilityNodeAvailabilityState } from "@/modules/facilities/types";
import { sortNodes } from "@/modules/facilities/utils";

type FacilityBookingMapProps = {
  nodes: FacilityNode[];
  selectedNodeIds: string[];
  unavailableNodeIds: string[];
  onToggleNode?: (nodeId: string) => void;
  className?: string;
};

const CANVAS_WIDTH = 1400;
const CANVAS_HEIGHT = 900;

function resolveState(node: FacilityNode, selectedSet: Set<string>, unavailableSet: Set<string>): FacilityNodeAvailabilityState {
  if (!node.isBookable || node.status !== "open") {
    return "non_bookable";
  }

  if (selectedSet.has(node.id)) {
    return "selected";
  }

  if (unavailableSet.has(node.id)) {
    return "unavailable";
  }

  return "available";
}

function stateClassName(state: FacilityNodeAvailabilityState) {
  if (state === "selected") {
    return "border-accent bg-accent/20";
  }

  if (state === "available") {
    return "border-emerald-500/50 bg-emerald-500/10";
  }

  if (state === "unavailable") {
    return "border-danger/50 bg-danger/10";
  }

  return "border-border bg-surface-muted";
}

function stateLabel(state: FacilityNodeAvailabilityState) {
  if (state === "selected") {
    return "Selected";
  }
  if (state === "available") {
    return "Available";
  }
  if (state === "unavailable") {
    return "Unavailable";
  }
  return "Non-bookable";
}

export function FacilityBookingMap({ nodes, selectedNodeIds, unavailableNodeIds, onToggleNode, className }: FacilityBookingMapProps) {
  const selectedSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const unavailableSet = useMemo(() => new Set(unavailableNodeIds), [unavailableNodeIds]);
  const sorted = useMemo(() => sortNodes(nodes), [nodes]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        <span className="rounded-control border border-emerald-500/50 bg-emerald-500/10 px-2 py-1">Available</span>
        <span className="rounded-control border border-accent bg-accent/20 px-2 py-1">Selected</span>
        <span className="rounded-control border border-danger/50 bg-danger/10 px-2 py-1">Unavailable</span>
        <span className="rounded-control border border-border bg-surface-muted px-2 py-1">Non-bookable</span>
      </div>

      <div className="overflow-auto rounded-control border bg-surface">
        <div
          className="relative bg-[radial-gradient(circle_at_1px_1px,_hsl(var(--border))_1px,_transparent_0)]"
          style={{
            width: `${CANVAS_WIDTH}px`,
            height: `${CANVAS_HEIGHT}px`,
            backgroundSize: "24px 24px"
          }}
        >
          {sorted.map((node) => {
            const state = resolveState(node, selectedSet, unavailableSet);
            const disabled = state === "unavailable" || state === "non_bookable" || !onToggleNode;

            return (
              <button
                className={cn(
                  "absolute overflow-hidden rounded-control border px-2 py-2 text-left shadow-sm transition",
                  stateClassName(state),
                  disabled ? "cursor-not-allowed opacity-70" : "hover:scale-[1.01]"
                )}
                disabled={disabled}
                key={node.id}
                onClick={() => onToggleNode?.(node.id)}
                style={{
                  left: `${node.layout.x}px`,
                  top: `${node.layout.y}px`,
                  width: `${node.layout.w}px`,
                  height: `${node.layout.h}px`,
                  zIndex: node.layout.z
                }}
                type="button"
              >
                <p className="truncate text-sm font-semibold text-text">{node.name}</p>
                <p className="truncate text-xs text-text-muted">{node.nodeKind}</p>
                <p className="mt-2 text-[11px] text-text-muted">{stateLabel(state)}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
