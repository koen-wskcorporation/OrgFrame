import type { CanvasNode, CanvasShapeType } from "@/src/features/canvas/core/types";

export type FacilityMapNode = CanvasNode & {
  spaceId: string;
  orgId: string;
  parentSpaceId: string | null;
  shapeType: CanvasShapeType;
};

export type FacilityMapNodeInput = {
  id?: string;
  spaceId: string;
  parentSpaceId: string | null;
  shapeType: CanvasShapeType;
  points: Array<{ x: number; y: number }>;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
};
