"use client";

import * as React from "react";
import { Button } from "@orgframe/ui/primitives/button";
import { Panel } from "@orgframe/ui/primitives/panel";
import { DraggablePersonChip } from "@/src/features/programs/map/components/DraggablePersonChip";
import type { AssignmentCandidate } from "@/src/features/programs/map/types";

type ProgramAssignmentsPanelProps = {
  open: boolean;
  onClose: () => void;
  players: AssignmentCandidate[];
  coaches: AssignmentCandidate[];
};

type Tab = "players" | "coaches";

/**
 * Assignments dock as a Panel — auto-portals into the global PanelContainer
 * when open. Draggable chips are dropped onto team nodes in the canvas; the
 * parent workspace's DndContext routes the drop to the correct mutation.
 */
export function ProgramAssignmentsPanel({
  open,
  onClose,
  players,
  coaches
}: ProgramAssignmentsPanelProps) {
  const [tab, setTab] = React.useState<Tab>("players");
  const items = tab === "players" ? players : coaches;

  return (
    <Panel
      open={open}
      onClose={onClose}
      panelKey="program-map-assignments"
      title="Assignments"
      subtitle="Drag onto a team to assign."
    >
      <div className="flex h-full flex-col gap-3">
        <div className="flex items-center gap-1">
          <Button variant={tab === "players" ? "primary" : "secondary"} size="sm" onClick={() => setTab("players")}>
            Players ({players.length})
          </Button>
          <Button variant={tab === "coaches" ? "primary" : "secondary"} size="sm" onClick={() => setTab("coaches")}>
            Coaches ({coaches.length})
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto">
          {items.length === 0 ? (
            <div className="rounded-control border border-dashed border-border p-3 text-center text-xs text-foreground-subtle">
              {tab === "players"
                ? "Everyone registered for this program is already on a team."
                : "No coach registrations yet."}
            </div>
          ) : null}
          {items.map((item) => (
            <DraggablePersonChip key={item.id} item={item} />
          ))}
        </div>
      </div>
    </Panel>
  );
}
