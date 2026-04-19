export type CanvasShapeType = "rectangle" | "polygon";

export type CanvasPoint = {
  x: number;
  y: number;
};

export type CanvasBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CanvasNode = {
  id: string;
  entityId: string;
  parentEntityId: string | null;
  label: string;
  shapeType: CanvasShapeType;
  points: CanvasPoint[];
  bounds: CanvasBounds;
  zIndex: number;
  cornerRadius: number;
  status: "active" | "archived";
};

export type CanvasConnector = {
  id: string;
  from: CanvasPoint;
  to: CanvasPoint;
};
