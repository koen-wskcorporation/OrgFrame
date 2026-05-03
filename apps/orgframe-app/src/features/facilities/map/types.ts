import type { CanvasNode } from "@/src/features/canvas/core/types";

export type FacilityMapNode = CanvasNode & {
  spaceId: string;
  orgId: string;
  parentSpaceId: string | null;
};

export type FacilityMapNodeInput = {
  id?: string;
  spaceId: string;
  parentSpaceId: string | null;
  points: Array<{ x: number; y: number }>;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
};
