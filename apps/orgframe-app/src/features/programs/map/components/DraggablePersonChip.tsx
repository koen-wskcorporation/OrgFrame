"use client";

import * as React from "react";
import { useDraggable } from "@dnd-kit/core";
import type { AssignmentCandidate } from "@/src/features/programs/map/types";

export function DraggablePersonChip({ item }: { item: AssignmentCandidate }) {
  const draggable = useDraggable({
    id: item.id,
    data: { kind: item.kind, item }
  });

  const style: React.CSSProperties = {
    transform: draggable.transform
      ? `translate3d(${draggable.transform.x}px, ${draggable.transform.y}px, 0)`
      : undefined,
    opacity: draggable.isDragging ? 0.6 : 1,
    cursor: "grab"
  };

  return (
    <div
      ref={draggable.setNodeRef}
      {...draggable.listeners}
      {...draggable.attributes}
      style={style}
      className="flex items-center gap-2 rounded-control border border-border bg-surface px-2 py-1.5 text-sm shadow-sm hover:border-primary"
    >
      <div className="h-6 w-6 rounded-full bg-surface-strong text-center text-xs leading-6 text-foreground-subtle">
        {item.label.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{item.label}</div>
        {item.subtitle && (
          <div className="truncate text-xs text-foreground-subtle">{item.subtitle}</div>
        )}
      </div>
    </div>
  );
}
