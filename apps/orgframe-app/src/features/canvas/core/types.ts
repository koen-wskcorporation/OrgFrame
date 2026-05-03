export type CanvasPoint = {
  x: number;
  y: number;
  /**
   * When true, the polygon corner at this vertex is rendered as a smooth
   * cubic curve through the point instead of a sharp corner. Used by the
   * facility map editor's vertex double-click toggle.
   */
  smooth?: boolean;
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
