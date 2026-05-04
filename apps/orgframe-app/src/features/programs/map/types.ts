import type { CanvasBounds } from "@/src/features/canvas/core/types";
import type { ProgramNode, ProgramNodeKind } from "@/src/features/programs/types";

export type ProgramMapNode = {
  id: string;
  programId: string;
  parentId: string | null;
  name: string;
  slug: string;
  nodeKind: ProgramNodeKind;
  bounds: CanvasBounds;
  zIndex: number;
  capacity: number | null;
  /** Indicates a node placed by the auto-layout fallback because the DB had no map_* columns yet. */
  placedByFallback: boolean;
};

export type ProgramMapDraftSnapshot = {
  nodes: ProgramMapNode[];
};

export type ProgramMapSavePayload = {
  updates: {
    nodeId: string;
    mapX: number;
    mapY: number;
    mapWidth: number;
    mapHeight: number;
    mapZIndex: number;
  }[];
};

/** A draggable assignment candidate — a player or coach not yet placed on a
 *  team. The Assignments panel keeps players and coaches in two symmetric
 *  tabs; the discriminator drives which assignment server action runs. */
export type AssignmentCandidate =
  | {
      kind: "player";
      id: string;
      label: string;
      subtitle: string | null;
      playerId: string;
      registrationId: string | null;
    }
  | {
      kind: "coach";
      id: string;
      label: string;
      subtitle: string | null;
      userId: string;
      coachRegistrationId: string | null;
    };

export type { ProgramNode };
