"use client";

import * as React from "react";
import { GoogleMapLayer } from "@orgframe/ui/primitives/google-map-layer";
import { StatusChip } from "@orgframe/ui/primitives/status-chip";
import { useToast } from "@orgframe/ui/primitives/toast";
import { CANVAS_GRID_SIZE } from "@/src/features/canvas/core/constants";
import { boundsFromPoints, snapPoint, snapToGrid } from "@/src/features/canvas/core/geometry";
import type { CanvasPoint } from "@/src/features/canvas/core/types";
import { getSpaceKindIcon } from "@/src/features/facilities/lib/spaceKindIcon";
import { FacilityMapToolbar } from "@/src/features/facilities/map/components/FacilityMapToolbar";
import type { FacilitySpace, FacilitySpaceStatus, FacilitySpaceStatusDef } from "@/src/features/facilities/types";
import type { FacilityMapNode } from "@/src/features/facilities/map/types";

// ---- Local zoom range ----
// Lost from canvas/core/constants when the editor's zoom expansion got
// reverted. Inlined here so this commit stays scoped to the GM editor.
const CANVAS_MIN_ZOOM = 0.1;
const CANVAS_MAX_ZOOM = 16;

// ---- Local geometry helpers ----
// `defaultPolygonAt` and `polygonCentroid` were added to canvas/core/geometry
// in the lost session. Inlined here for the same reason.
function defaultPolygonAt(center: CanvasPoint): CanvasPoint[] {
  const halfW = 60;
  const halfH = 40;
  return [
    { x: center.x - halfW, y: center.y - halfH },
    { x: center.x + halfW, y: center.y - halfH },
    { x: center.x + halfW, y: center.y + halfH },
    { x: center.x - halfW, y: center.y + halfH }
  ];
}
function polygonCentroid(points: CanvasPoint[]): CanvasPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  return { x: cx / points.length, y: cy / points.length };
}

type View = {
  centerX: number;
  centerY: number;
  zoom: number;
};

type Interaction =
  | null
  | {
      mode: "move";
      nodeId: string;
      pointerWorldStart: CanvasPoint;
      originalPoints: CanvasPoint[];
    }
  | {
      mode: "vertex";
      nodeId: string;
      pointIndices: number[];
      originalPoints: CanvasPoint[];
      pointerWorldStart: CanvasPoint;
    }
  | {
      mode: "pan";
      pointerClientStart: { x: number; y: number };
      viewStart: View;
      pixelSize: { width: number; height: number };
    }
  | {
      mode: "rotate";
      nodeId: string;
      center: CanvasPoint;
      originalPoints: CanvasPoint[];
      startAngle: number;
    };

type EdgeHover = {
  nodeId: string;
  edgeIndex: number;
  point: CanvasPoint;
};

type FacilityMapEditorProps = {
  nodes: FacilityMapNode[];
  selectedNodeId: string | null;
  canWrite: boolean;
  spaces: FacilitySpace[];
  spaceStatuses: FacilitySpaceStatusDef[];
  isSaving: boolean;
  orgId: string;
  geoAnchor: { lat: number; lng: number } | null;
  geoShowMap: boolean;
  /** Hides satellite + location toolbar buttons; forces grid-only rendering. */
  indoor?: boolean;
  onSelectNode: (nodeId: string | null) => void;
  onChangeNodes: (nodes: FacilityMapNode[]) => void;
  onDeleteNode: (nodeId: string) => void;
  onCreateSpace: () => FacilitySpace | null;
  onSave: () => void;
  onToggleGeoMap: () => void;
  onEditGeoLocation: () => void;
  /** Whether AI click-to-segment mode is active (toolbar Sparkles toggled on). */
  aiMode?: boolean;
  /** Toggle AI mode on/off; surfaced via the toolbar Sparkles button. */
  onToggleAiMode?: () => void;
  /** Fired when the user clicks anywhere on the canvas while AI mode is on. */
  onAiCanvasClick?: (canvasX: number, canvasY: number) => void;
  /** A SAM2 segmentation is currently in flight. */
  isAiBusy?: boolean;
  /** Pending suggestion polygons rendered as dashed ghosts on the canvas. */
  aiSuggestionPoints?: Array<{ id: string; points: CanvasPoint[]; label: string; accepted: boolean }>;
  /** Toggle a suggestion's accepted state when the user clicks its ghost. */
  onToggleAiSuggestion?: (index: number) => void;
  /**
   * Exposes the editor's view state so the workspace can build a static-maps
   * URL matching the canvas viewport before calling the AI vision endpoint.
   */
  onViewChange?: (view: { centerX: number; centerY: number; zoom: number; pixelWidth: number; pixelHeight: number }) => void;
  /** Preview mode — disables every editing interaction; shows minimal toolbar. */
  readOnly?: boolean;
  /** Read-only "Edit" button handler. Typically opens the full editor popup. */
  onEdit?: () => void;
  /**
   * Additional content rendered inside each node's title pill, keyed by space
   * id (= `node.entityId`). Use to inject availability badges or booking
   * indicators in read-only consumers like the booking fullscreen.
   */
  nodeBadgeBySpaceId?: Record<string, React.ReactNode>;
  /**
   * Visually highlight these node ids as "secondarily selected" alongside
   * (or instead of) the primary `selectedNodeId`. Booking flow uses this
   * for multi-select.
   */
  multiSelectedNodeIds?: ReadonlySet<string>;
  /**
   * For these space ids, suppress the existing facility StatusChip in the
   * title pill — assumes `nodeBadgeBySpaceId` is providing a replacement
   * status (e.g. the booking-availability pill).
   */
  replaceStatusChipBySpaceId?: ReadonlySet<string>;
};

// Mercator math: convert canvas world units (1 unit = 1 meter) relative to a
// geo anchor into lat/lng, and pick a Google Maps zoom that matches the
// canvas's px/meter so polygons align with imagery underneath.
const METERS_PER_DEGREE_LAT = 111320;
function metersToLatLng(anchor: { lat: number; lng: number }, dxMeters: number, dyMeters: number) {
  const lat = anchor.lat - dyMeters / METERS_PER_DEGREE_LAT;
  const lng = anchor.lng + dxMeters / (METERS_PER_DEGREE_LAT * Math.cos((anchor.lat * Math.PI) / 180));
  return { lat, lng };
}
function canvasZoomToMapZoom(canvasZoom: number, latitude: number) {
  // Google's pixels-per-meter at zoom Z, latitude φ:
  //   ppm = 2^Z / (156543.03392 * cos(φ))
  // We want ppm to equal canvasZoom (= screen pixels per canvas unit, where 1 unit = 1 m).
  const cos = Math.cos((latitude * Math.PI) / 180);
  const target = canvasZoom * 156543.03392 * cos;
  return Math.log2(Math.max(target, 1));
}

const DEFAULT_VIEW: View = { centerX: 480, centerY: 320, zoom: 1 };
const CORNER_RADIUS_WORLD = 4;
const VERTEX_CLICK_DRAG_THRESHOLD = 3;
const EDGE_HOVER_THRESHOLD_PX = 14;
const VERTEX_PROXIMITY_PX = 9;
// Subtle magnetic pull toward axis-aligned edges with adjacent vertices when
// dragging on the satellite map (no grid snap). Small enough to feel like a
// suggestion the user can drag past.
const SOFT_ALIGN_RADIUS_PX = 6;

/**
 * Google Maps tops out around zoom 21 for satellite imagery. Beyond that
 * the imagery layer can't keep up with the SVG, and polygons appear to
 * "unpin" from the ground because the SVG keeps zooming while the map
 * doesn't. Clamping the canvas zoom in satellite mode keeps the requested
 * Google zoom inside its supported range.
 *
 * Solving `2^21 = canvasZoom * 156543 * cos(lat)` for canvasZoom — we use
 * the equator (cos=1) as the conservative worst case so the cap holds at
 * any latitude.
 */
const SATELLITE_MAX_GOOGLE_ZOOM = 20.5;
const SATELLITE_MAX_CANVAS_ZOOM = Math.pow(2, SATELLITE_MAX_GOOGLE_ZOOM) / 156543.03392;
function clampZoomForMode(z: number, mapEnabled: boolean) {
  const ceiling = mapEnabled ? Math.min(CANVAS_MAX_ZOOM, SATELLITE_MAX_CANVAS_ZOOM) : CANVAS_MAX_ZOOM;
  return Math.max(CANVAS_MIN_ZOOM, Math.min(ceiling, z));
}

function makeNodeId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const random = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${random()}${random()}-${random()}-4${random().slice(1)}-8${random().slice(1)}-${random()}${random()}${random()}`;
}

function fillForStatus(status: FacilitySpaceStatus | undefined, isHovered: boolean, isSelected: boolean) {
  if (status === "archived") {
    return "url(#facility-map-archived-stripes)";
  }
  if (status === "closed") {
    return "hsl(var(--surface-muted))";
  }
  if (isHovered && !isSelected) {
    return "hsl(var(--surface-muted))";
  }
  return "hsl(var(--surface))";
}

function strokeForState(opts: { selected: boolean; hovered: boolean }) {
  if (opts.selected) return "hsl(var(--accent))";
  if (opts.hovered) return "hsl(var(--accent) / 0.55)";
  return "hsl(var(--border))";
}

function closestPointOnSegment(a: CanvasPoint, b: CanvasPoint, p: CanvasPoint): { point: CanvasPoint; distance: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const lenSq = abx * abx + aby * aby;
  let t = lenSq > 0 ? (apx * abx + apy * aby) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + abx * t, y: a.y + aby * t };
  const distance = Math.hypot(point.x - p.x, point.y - p.y);
  return { point, distance };
}

type Corner = {
  smooth: boolean;
  vertex: CanvasPoint;
  enter: CanvasPoint;
  exit: CanvasPoint;
  handleIn: CanvasPoint;
  handleOut: CanvasPoint;
};

function buildCorners(points: CanvasPoint[], radius: number): Corner[] {
  const n = points.length;
  return points.map((p, i) => {
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    const lenPrev = Math.hypot(prev.x - p.x, prev.y - p.y) || 1;
    const lenNext = Math.hypot(next.x - p.x, next.y - p.y) || 1;

    if (p.smooth) {
      const tx = next.x - prev.x;
      const ty = next.y - prev.y;
      const tLen = Math.hypot(tx, ty) || 1;
      const ux = tx / tLen;
      const uy = ty / tLen;
      const d = Math.min(lenPrev, lenNext) / 3;
      return {
        smooth: true,
        vertex: { x: p.x, y: p.y },
        enter: { x: p.x, y: p.y },
        exit: { x: p.x, y: p.y },
        handleIn: { x: p.x - ux * d, y: p.y - uy * d },
        handleOut: { x: p.x + ux * d, y: p.y + uy * d }
      };
    }

    const r = Math.max(0, Math.min(radius, lenPrev / 2, lenNext / 2));
    const enter = { x: p.x + ((prev.x - p.x) / lenPrev) * r, y: p.y + ((prev.y - p.y) / lenPrev) * r };
    const exit = { x: p.x + ((next.x - p.x) / lenNext) * r, y: p.y + ((next.y - p.y) / lenNext) * r };
    return {
      smooth: false,
      vertex: { x: p.x, y: p.y },
      enter,
      exit,
      handleIn: enter,
      handleOut: exit
    };
  });
}

function polygonPath(points: CanvasPoint[], radius: number): string {
  if (points.length < 3) return "";
  const n = points.length;
  const corners = buildCorners(points, radius);

  let d = `M ${corners[0].exit.x} ${corners[0].exit.y}`;
  for (let i = 0; i < n; i++) {
    const from = corners[i];
    const to = corners[(i + 1) % n];

    if (from.smooth || to.smooth) {
      const c1 = from.smooth ? from.handleOut : from.exit;
      const c2 = to.smooth ? to.handleIn : to.enter;
      d += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.enter.x} ${to.enter.y}`;
    } else {
      d += ` L ${to.enter.x} ${to.enter.y}`;
    }

    if (!to.smooth) {
      d += ` Q ${to.vertex.x} ${to.vertex.y} ${to.exit.x} ${to.exit.y}`;
    }
  }
  d += " Z";
  return d;
}

export function FacilityMapEditor({
  nodes,
  selectedNodeId,
  canWrite: canWriteProp,
  spaces,
  spaceStatuses,
  isSaving,
  orgId,
  geoAnchor,
  geoShowMap,
  indoor = false,
  onSelectNode,
  onChangeNodes,
  onDeleteNode,
  onCreateSpace,
  onSave,
  onToggleGeoMap,
  onEditGeoLocation,
  aiMode = false,
  onToggleAiMode,
  onAiCanvasClick,
  isAiBusy = false,
  aiSuggestionPoints,
  onToggleAiSuggestion,
  onViewChange,
  readOnly = false,
  onEdit,
  nodeBadgeBySpaceId,
  multiSelectedNodeIds,
  replaceStatusChipBySpaceId
}: FacilityMapEditorProps) {
  // Read-only mode is just "force canWrite false" plus toolbar/auto-fit
  // tweaks below; every mutating handler already short-circuits on
  // !canWrite, so this single override is enough to lock the canvas down.
  const canWrite = canWriteProp && !readOnly;
  const mapEnabled = geoShowMap && geoAnchor !== null;
  const snapEnabled = !mapEnabled;
  const snapMaybe = React.useCallback(
    (n: number) => (snapEnabled ? snapToGrid(n) : n),
    [snapEnabled]
  );
  const snapPointMaybe = React.useCallback(
    (p: CanvasPoint): CanvasPoint => (snapEnabled ? snapPoint(p) : p),
    [snapEnabled]
  );
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const [pixelSize, setPixelSize] = React.useState<{ width: number; height: number }>({ width: 1, height: 1 });
  const [view, setView] = React.useState<View>(DEFAULT_VIEW);

  // Forward viewport state to the parent (workspace) so it can build the
  // exact center/zoom/size the AI vision endpoint needs to convert pixel
  // suggestions back into canvas coordinates.
  React.useEffect(() => {
    if (!onViewChange) return;
    onViewChange({
      centerX: view.centerX,
      centerY: view.centerY,
      zoom: view.zoom,
      pixelWidth: pixelSize.width,
      pixelHeight: pixelSize.height
    });
  }, [view.centerX, view.centerY, view.zoom, pixelSize.width, pixelSize.height, onViewChange]);
  const [interaction, setInteraction] = React.useState<Interaction>(null);
  const interactionRef = React.useRef<Interaction>(null);
  interactionRef.current = interaction;
  const [hoveredNodeId, setHoveredNodeId] = React.useState<string | null>(null);
  const [topNodeId, setTopNodeId] = React.useState<string | null>(null);
  const [selectedVertexIndices, setSelectedVertexIndices] = React.useState<number[]>([]);
  // Mirror in a ref so the keyboard handler always sees the latest selection
  // without depending on the effect's deps closure (which had a stale-read
  // window where Delete after a vertex click could miss the new indices).
  const selectedVertexIndicesRef = React.useRef<number[]>([]);
  selectedVertexIndicesRef.current = selectedVertexIndices;
  const selectedNodeIdRef = React.useRef<string | null>(null);
  selectedNodeIdRef.current = selectedNodeId;
  const { toast } = useToast();
  const [edgeHover, setEdgeHover] = React.useState<EdgeHover | null>(null);
  const vertexClickRef = React.useRef<{
    nodeId: string;
    pointIndex: number;
    startClientX: number;
    startClientY: number;
    hasMoved: boolean;
  } | null>(null);

  React.useEffect(() => {
    setSelectedVertexIndices([]);
  }, [selectedNodeId]);

  // Local clipboard for copy/paste/duplicate keyboard actions. Stores polygon
  // geometry only — pasting always creates a fresh space record on the server
  // via onCreateSpace, so the new node is independent.
  const clipboardRef = React.useRef<{ points: CanvasPoint[] } | null>(null);

  const spaceById = React.useMemo(() => new Map(spaces.map((space) => [space.id, space])), [spaces]);
  const statusById = React.useMemo(() => new Map(spaceStatuses.map((status) => [status.id, status])), [spaceStatuses]);

  // useLayoutEffect for the initial measurement so the first painted frame
  // already has a correct viewBox. With a useEffect there was a one-frame
  // window where the SVG was mounted at full size in the DOM but pixelSize
  // was still the default {1, 1}, producing a 1×1 viewBox that clipped
  // every polygon and read as "just a line" in screenshots.
  React.useLayoutEffect(() => {
    if (!svgRef.current) return;
    const element = svgRef.current;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setPixelSize({ width, height });
      }
    });
    observer.observe(element);
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setPixelSize({ width: rect.width, height: rect.height });
    }
    return () => observer.disconnect();
  }, []);

  const viewBoxWidth = pixelSize.width / view.zoom;
  const viewBoxHeight = pixelSize.height / view.zoom;
  const viewBoxX = view.centerX - viewBoxWidth / 2;
  const viewBoxY = view.centerY - viewBoxHeight / 2;
  const viewBox = `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`;

  const nodeById = React.useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const sortedNodes = React.useMemo(
    () =>
      [...nodes].sort((a, b) => {
        if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex;
        return a.id.localeCompare(b.id);
      }),
    [nodes]
  );

  function clientToWorld(clientX: number, clientY: number): CanvasPoint {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      return { x: 0, y: 0 };
    }
    return {
      x: viewBoxX + ((clientX - rect.left) / rect.width) * viewBoxWidth,
      y: viewBoxY + ((clientY - rect.top) / rect.height) * viewBoxHeight
    };
  }

  function applyNodeUpdate(nodeId: string, updater: (current: FacilityMapNode) => FacilityMapNode) {
    const current = nodeById.get(nodeId);
    if (!current) return;
    // Recompute bounds from the new points but DON'T run through
    // `normalizeNodeGeometry` — that snaps every polygon vertex to the
    // 24px grid, which destroys precise satellite-positioned vertices.
    // Per-drag grid snapping happens earlier in the move/vertex handlers
    // via `snapMaybe`, gated on `snapEnabled` (i.e. grid mode only).
    const updated = updater(current);
    const next: FacilityMapNode = {
      ...updated,
      bounds: updated.points.length >= 3 ? boundsFromPoints(updated.points) : updated.bounds
    };
    onChangeNodes(nodes.map((node) => (node.id === nodeId ? next : node)));
  }

  function deleteNode(nodeId: string) {
    onDeleteNode(nodeId);
    if (selectedNodeId === nodeId) {
      onSelectNode(null);
    }
  }

  function insertVertex(nodeId: string, edgeIndex: number, point: CanvasPoint) {
    applyNodeUpdate(nodeId, (node) => {
      const points = [...node.points];
      points.splice(edgeIndex + 1, 0, snapPointMaybe(point));
      return { ...node, points };
    });
    setEdgeHover(null);
  }

  function toggleVertexSmooth(nodeId: string, pointIndex: number) {
    applyNodeUpdate(nodeId, (node) => {
      const points = node.points.map((p, i) => {
        if (i !== pointIndex) return p;
        const wasSmooth = Boolean(p.smooth);
        const next: CanvasPoint = { x: p.x, y: p.y };
        if (!wasSmooth) next.smooth = true;
        return next;
      });
      return { ...node, points };
    });
  }

  function handleWheel(event: React.WheelEvent<SVGSVGElement>) {
    // In read-only preview mode the canvas should let the page scroll
    // through; wheel-zoom only makes sense when the user is actively
    // editing. Toolbar zoom buttons remain available.
    if (readOnly) return;
    event.preventDefault();
    // Slightly punchier wheel sensitivity since the zoom range is now 0.1x–16x.
    const factor = Math.exp(-event.deltaY * 0.0025);
    const nextZoom = clampZoomForMode(view.zoom * factor, mapEnabled);
    if (nextZoom === view.zoom) return;
    const cursor = clientToWorld(event.clientX, event.clientY);
    const nextWidth = pixelSize.width / nextZoom;
    const nextHeight = pixelSize.height / nextZoom;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cursorOffsetX = (event.clientX - rect.left) / rect.width;
    const cursorOffsetY = (event.clientY - rect.top) / rect.height;
    const nextCenterX = cursor.x - (cursorOffsetX - 0.5) * nextWidth;
    const nextCenterY = cursor.y - (cursorOffsetY - 0.5) * nextHeight;
    setView({ centerX: nextCenterX, centerY: nextCenterY, zoom: nextZoom });
    setEdgeHover(null);
  }

  function handleZoom(direction: 1 | -1) {
    // Toolbar +/- traverses the wider zoom range in a reasonable number of clicks.
    const factor = direction === 1 ? 1.3 : 1 / 1.3;
    setView((current) => ({ ...current, zoom: clampZoomForMode(current.zoom * factor, mapEnabled) }));
  }

  function handleFit() {
    if (nodes.length === 0) {
      setView(DEFAULT_VIEW);
      return;
    }
    const allPoints = nodes.flatMap((node) => node.points);
    const bounds = boundsFromPoints(allPoints);
    const margin = 80;
    const targetWidth = bounds.width + margin * 2;
    const targetHeight = bounds.height + margin * 2;
    const zoomX = pixelSize.width / targetWidth;
    const zoomY = pixelSize.height / targetHeight;
    // Auto-fit caps at 4x even though manual zoom goes to 16x — fitting a
    // single tiny space at 16x looks absurd, but the user can still zoom
    // closer by hand.
    const FIT_MAX_ZOOM = 4;
    const nextZoom = clampZoomForMode(Math.min(zoomX, zoomY, FIT_MAX_ZOOM), mapEnabled);
    setView({
      centerX: bounds.x + bounds.width / 2,
      centerY: bounds.y + bounds.height / 2,
      zoom: nextZoom
    });
  }

  // Auto-fit on initial mount in BOTH editor and read-only preview modes.
  // Fires once when pixelSize first becomes "useful" (>32px each), so the
  // first paint the user sees is fitted-to-content. After that the effect
  // does nothing — the user's manual zoom/pan stays put. Reopening a popup
  // editor remounts the component (the parent gates rendering on `open`),
  // which gives us a fresh fit each time.
  const didInitialFitRef = React.useRef(false);
  React.useEffect(() => {
    if (didInitialFitRef.current) return;
    if (pixelSize.width < 32 || pixelSize.height < 32) return;
    didInitialFitRef.current = true;
    handleFit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixelSize.width, pixelSize.height]);

  function addSpaceWithPoints(points: CanvasPoint[]) {
    if (!canWrite) return;
    const space = onCreateSpace();
    if (!space) return;
    const bounds = boundsFromPoints(points);
    const maxZ = nodes.reduce((acc, node) => Math.max(acc, node.zIndex), 0);
    const newNode: FacilityMapNode = {
      id: makeNodeId(),
      entityId: space.id,
      parentEntityId: space.parentSpaceId,
      label: space.name,
      points,
      bounds,
      zIndex: maxZ + 1,
      cornerRadius: 0,
      status: "active",
      spaceId: space.id,
      orgId,
      parentSpaceId: space.parentSpaceId
    };
    onChangeNodes([...nodes, newNode]);
    onSelectNode(newNode.id);
  }

  function handleAddSpace() {
    if (!canWrite) return;
    const center = { x: view.centerX, y: view.centerY };
    const points = defaultPolygonAt(center).map(snapPointMaybe);
    addSpaceWithPoints(points);
  }

  function duplicateFromPoints(sourcePoints: CanvasPoint[]) {
    if (!canWrite) return;
    // Offset the duplicate so it's visually distinct from the source.
    // Snap the offset to the grid step in grid mode so duplicates stay aligned.
    const offset = snapEnabled ? CANVAS_GRID_SIZE : 16;
    const points = sourcePoints.map((p) => ({
      ...p,
      x: p.x + offset,
      y: p.y + offset
    }));
    addSpaceWithPoints(points);
  }

  function startMove(node: FacilityMapNode, event: React.MouseEvent<Element>) {
    event.stopPropagation();
    onSelectNode(node.id);
    if (!canWrite) return;
    const pointerWorldStart = clientToWorld(event.clientX, event.clientY);
    setInteraction({
      mode: "move",
      nodeId: node.id,
      pointerWorldStart,
      originalPoints: node.points.map((point) => ({ ...point }))
    });
  }

  function startVertexInteraction(nodeId: string, pointIndex: number, event: React.MouseEvent<SVGElement>) {
    event.stopPropagation();
    if (!canWrite) return;
    const node = nodeById.get(nodeId);
    if (!node) return;
    const shift = event.shiftKey;
    let nextSelection: number[];
    if (shift) {
      nextSelection = selectedVertexIndices.includes(pointIndex)
        ? selectedVertexIndices.filter((i) => i !== pointIndex)
        : [...selectedVertexIndices, pointIndex];
    } else if (selectedVertexIndices.includes(pointIndex)) {
      nextSelection = selectedVertexIndices;
    } else {
      nextSelection = [pointIndex];
    }
    setSelectedVertexIndices(nextSelection);

    if (nextSelection.length === 0 || shift) {
      vertexClickRef.current = null;
      return;
    }

    vertexClickRef.current = {
      nodeId,
      pointIndex,
      startClientX: event.clientX,
      startClientY: event.clientY,
      hasMoved: false
    };
    setInteraction({
      mode: "vertex",
      nodeId,
      pointIndices: nextSelection,
      originalPoints: node.points.map((point) => ({ ...point })),
      pointerWorldStart: clientToWorld(event.clientX, event.clientY)
    });
  }

  function startPan(event: React.MouseEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    // AI segment mode: left-click is a SAM2 prompt, not a pan. Translate to
    // canvas coords and hand off; the workspace runs the segmentation and
    // appends a ghost polygon. Pan is disabled while busy to avoid stacking
    // requests on the same click.
    if (aiMode && onAiCanvasClick) {
      if (isAiBusy) return;
      const world = clientToWorld(event.clientX, event.clientY);
      onAiCanvasClick(world.x, world.y);
      return;
    }
    setInteraction({
      mode: "pan",
      pointerClientStart: { x: event.clientX, y: event.clientY },
      viewStart: view,
      pixelSize
    });
    onSelectNode(null);
  }

  function handleVertexDoubleClick(event: React.MouseEvent<SVGElement>, nodeId: string, pointIndex: number) {
    event.stopPropagation();
    toggleVertexSmooth(nodeId, pointIndex);
  }

  function startRotate(nodeId: string, event: React.MouseEvent<SVGElement>) {
    event.stopPropagation();
    if (!canWrite) return;
    const node = nodeById.get(nodeId);
    if (!node || node.points.length < 3) return;
    onSelectNode(nodeId);
    const center = polygonCentroid(node.points);
    const pointer = clientToWorld(event.clientX, event.clientY);
    const startAngle = Math.atan2(pointer.y - center.y, pointer.x - center.x);
    setInteraction({
      mode: "rotate",
      nodeId,
      center,
      originalPoints: node.points.map((p) => ({ ...p })),
      startAngle
    });
  }

  function deleteSelectedVertices() {
    if (!canWrite || !selectedNodeId || selectedVertexIndices.length === 0) return;
    const node = nodeById.get(selectedNodeId);
    if (!node) return;
    const remainingCount = node.points.length - selectedVertexIndices.length;
    if (remainingCount < 3) {
      toast({
        title: "A shape needs at least 3 points",
        description: "Remove fewer points, or delete the whole shape from the side panel.",
        variant: "destructive"
      });
      return;
    }
    const indexSet = new Set(selectedVertexIndices);
    applyNodeUpdate(node.id, (current) => ({
      ...current,
      points: current.points.filter((_, index) => !indexSet.has(index))
    }));
    setSelectedVertexIndices([]);
  }

  // Keyboard shortcuts: copy/paste/duplicate, delete (vertices or node),
  // and `G` to snap the selected polygon to the grid (useful after coming
  // back from satellite mode).
  React.useEffect(() => {
    if (!canWrite) return;
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      const meta = event.metaKey || event.ctrlKey;

      if (event.key === "Delete" || event.key === "Backspace") {
        // Vertex selection takes priority over node deletion. Read from refs
        // so a Delete press right after a vertex click can't miss a fresh
        // selectedVertexIndices update due to effect-rebind timing.
        const vertexSelection = selectedVertexIndicesRef.current;
        const nodeSelection = selectedNodeIdRef.current;
        if (vertexSelection.length > 0 && nodeSelection) {
          event.preventDefault();
          deleteSelectedVertices();
          return;
        }
        // Fallback: if the user just clicked a vertex (mousedown captured
        // it in vertexClickRef) but state hasn't synced yet, delete that
        // single vertex.
        const justClicked = vertexClickRef.current;
        if (justClicked && nodeSelection === justClicked.nodeId) {
          event.preventDefault();
          const idx = justClicked.pointIndex;
          const node = nodeById.get(justClicked.nodeId);
          if (node && node.points.length > 3) {
            applyNodeUpdate(node.id, (current) => ({
              ...current,
              points: current.points.filter((_, i) => i !== idx)
            }));
            setSelectedVertexIndices([]);
          }
          return;
        }
        if (nodeSelection) {
          event.preventDefault();
          deleteNode(nodeSelection);
        }
        return;
      }

      if (meta && (event.key === "c" || event.key === "C") && selectedNodeId) {
        const node = nodeById.get(selectedNodeId);
        if (node) {
          clipboardRef.current = { points: node.points.map((p) => ({ ...p })) };
          event.preventDefault();
        }
        return;
      }

      if (meta && (event.key === "v" || event.key === "V")) {
        if (clipboardRef.current?.points && clipboardRef.current.points.length >= 3) {
          event.preventDefault();
          duplicateFromPoints(clipboardRef.current.points);
        }
        return;
      }

      if (meta && (event.key === "d" || event.key === "D") && selectedNodeId) {
        const node = nodeById.get(selectedNodeId);
        if (node) {
          event.preventDefault();
          duplicateFromPoints(node.points);
        }
        return;
      }

      if (!meta && (event.key === "g" || event.key === "G") && snapEnabled && selectedNodeId) {
        event.preventDefault();
        applyNodeUpdate(selectedNodeId, (current) => ({
          ...current,
          points: current.points.map(snapPoint)
        }));
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canWrite, selectedNodeId, selectedVertexIndices, snapEnabled, nodeById]);

  function handleMouseMove(event: React.MouseEvent<SVGSVGElement>) {
    const current = interactionRef.current;

    if (current?.mode === "pan") {
      const dx = event.clientX - current.pointerClientStart.x;
      const dy = event.clientY - current.pointerClientStart.y;
      const worldDx = (dx / current.pixelSize.width) * (current.pixelSize.width / current.viewStart.zoom);
      const worldDy = (dy / current.pixelSize.height) * (current.pixelSize.height / current.viewStart.zoom);
      setView({
        centerX: current.viewStart.centerX - worldDx,
        centerY: current.viewStart.centerY - worldDy,
        zoom: current.viewStart.zoom
      });
      return;
    }

    if (current?.mode === "rotate") {
      const pointer = clientToWorld(event.clientX, event.clientY);
      let delta = Math.atan2(pointer.y - current.center.y, pointer.x - current.center.x) - current.startAngle;
      // Hold Shift to snap rotation to 15° increments.
      if (event.shiftKey) {
        const step = (15 * Math.PI) / 180;
        delta = Math.round(delta / step) * step;
      }
      const cos = Math.cos(delta);
      const sin = Math.sin(delta);
      applyNodeUpdate(current.nodeId, (node) => ({
        ...node,
        points: current.originalPoints.map((p) => {
          const dx = p.x - current.center.x;
          const dy = p.y - current.center.y;
          return {
            x: current.center.x + dx * cos - dy * sin,
            y: current.center.y + dx * sin + dy * cos,
            smooth: p.smooth
          };
        })
      }));
      return;
    }

    if (current?.mode === "move") {
      const pointer = clientToWorld(event.clientX, event.clientY);
      let deltaX = snapMaybe(pointer.x - current.pointerWorldStart.x);
      let deltaY = snapMaybe(pointer.y - current.pointerWorldStart.y);
      // Soft alignment for full-node moves: gently pull the node's bbox
      // edges toward other nodes' bbox edges. Same radius as vertex drags.
      // Important: read the source bounds from the interaction's snapshot
      // (`current.originalPoints`) — NOT from the live node, which is
      // mutating each mousemove and would otherwise cause the snap target
      // to drift, producing visible shake.
      if (!snapEnabled) {
        const radius = SOFT_ALIGN_RADIUS_PX / view.zoom;
        const origXs = current.originalPoints.map((p) => p.x);
        const origYs = current.originalPoints.map((p) => p.y);
        const origMinX = Math.min(...origXs);
        const origMaxX = Math.max(...origXs);
        const origMinY = Math.min(...origYs);
        const origMaxY = Math.max(...origYs);
        const movingX = [origMinX, origMaxX];
        const movingY = [origMinY, origMaxY];
        const targetXs: number[] = [];
        const targetYs: number[] = [];
        for (const other of nodes) {
          if (other.id === current.nodeId) continue;
          targetXs.push(other.bounds.x, other.bounds.x + other.bounds.width);
          targetYs.push(other.bounds.y, other.bounds.y + other.bounds.height);
        }
        let bestDx: number | null = null;
        let bestDxDist = radius;
        for (const mx of movingX) {
          for (const tx of targetXs) {
            const adjust = tx - (mx + deltaX);
            const dist = Math.abs(adjust);
            if (dist < bestDxDist) {
              bestDxDist = dist;
              bestDx = adjust;
            }
          }
        }
        let bestDy: number | null = null;
        let bestDyDist = radius;
        for (const my of movingY) {
          for (const ty of targetYs) {
            const adjust = ty - (my + deltaY);
            const dist = Math.abs(adjust);
            if (dist < bestDyDist) {
              bestDyDist = dist;
              bestDy = adjust;
            }
          }
        }
        if (bestDx !== null) deltaX += bestDx;
        if (bestDy !== null) deltaY += bestDy;
      }
      applyNodeUpdate(current.nodeId, (node) => ({
        ...node,
        points: current.originalPoints.map((point) => ({ x: point.x + deltaX, y: point.y + deltaY, smooth: point.smooth }))
      }));
      return;
    }

    if (current?.mode === "vertex") {
      const click = vertexClickRef.current;
      if (click) {
        const moved = Math.hypot(event.clientX - click.startClientX, event.clientY - click.startClientY);
        if (!click.hasMoved && moved > VERTEX_CLICK_DRAG_THRESHOLD) {
          click.hasMoved = true;
        }
        if (!click.hasMoved) return;
      }
      const pointer = clientToWorld(event.clientX, event.clientY);
      const deltaX = snapMaybe(pointer.x - current.pointerWorldStart.x);
      const deltaY = snapMaybe(pointer.y - current.pointerWorldStart.y);
      const moveSet = new Set(current.pointIndices);
      applyNodeUpdate(current.nodeId, (node) => {
        const points = node.points.map((point, index) => {
          if (!moveSet.has(index)) return point;
          const original = current.originalPoints[index] ?? point;
          let nx = original.x + deltaX;
          let ny = original.y + deltaY;
          // Soft alignment: in non-grid (map) mode, gently pull a single
          // dragged vertex toward axis-alignment with its immediate neighbors
          // AND with vertices of every other node in the scene. The pull
          // radius is small (~6 screen px) so the user can drag past it.
          if (!snapEnabled && moveSet.size === 1) {
            const radius = SOFT_ALIGN_RADIUS_PX / view.zoom;
            const n = node.points.length;
            const xCandidates: number[] = [
              node.points[(index - 1 + n) % n]!.x,
              node.points[(index + 1) % n]!.x
            ];
            const yCandidates: number[] = [
              node.points[(index - 1 + n) % n]!.y,
              node.points[(index + 1) % n]!.y
            ];
            for (const other of nodes) {
              if (other.id === node.id) continue;
              for (const p of other.points) {
                xCandidates.push(p.x);
                yCandidates.push(p.y);
              }
            }
            const closer = (target: number, candidates: number[]): number | null => {
              let best: number | null = null;
              let bestDist = radius;
              for (const c of candidates) {
                const d = Math.abs(target - c);
                if (d < bestDist) {
                  bestDist = d;
                  best = c;
                }
              }
              return best;
            };
            const sx = closer(nx, xCandidates);
            const sy = closer(ny, yCandidates);
            if (sx !== null) nx = sx;
            if (sy !== null) ny = sy;
          }
          return { x: nx, y: ny, smooth: original.smooth };
        });
        return { ...node, points };
      });
      return;
    }

    if (selectedNodeId) {
      const selected = nodeById.get(selectedNodeId);
      if (!selected || selected.points.length < 2) {
        setEdgeHover(null);
        return;
      }
      const pointer = clientToWorld(event.clientX, event.clientY);
      const edgeThreshold = EDGE_HOVER_THRESHOLD_PX / view.zoom;
      const vertexThreshold = VERTEX_PROXIMITY_PX / view.zoom;

      const tooCloseToVertex = selected.points.some((p) => Math.hypot(p.x - pointer.x, p.y - pointer.y) < vertexThreshold);
      if (tooCloseToVertex) {
        setEdgeHover(null);
        return;
      }

      let best: { edgeIndex: number; point: CanvasPoint; distance: number } | null = null;
      for (let i = 0; i < selected.points.length; i++) {
        const a = selected.points[i];
        const b = selected.points[(i + 1) % selected.points.length];
        const result = closestPointOnSegment(a, b, pointer);
        if (best === null || result.distance < best.distance) {
          best = { edgeIndex: i, point: result.point, distance: result.distance };
        }
      }

      if (best && best.distance < edgeThreshold) {
        setEdgeHover({ nodeId: selected.id, edgeIndex: best.edgeIndex, point: best.point });
      } else {
        setEdgeHover(null);
      }
    }
  }

  function handleMouseUp() {
    vertexClickRef.current = null;
    setInteraction(null);
  }

  function handleMouseLeave() {
    vertexClickRef.current = null;
    setInteraction(null);
    setEdgeHover(null);
    setHoveredNodeId(null);
  }

  const inversePixel = 1 / view.zoom;
  const baseStrokeWidth = 1.5 * inversePixel;
  const selectedStrokeWidth = 2 * inversePixel;
  const handleRadius = 5 * inversePixel;
  const handleStrokeWidth = 1.5 * inversePixel;
  const edgePlusRadius = 9 * inversePixel;
  const edgePlusStrokeWidth = 1.5 * inversePixel;
  const edgePlusGlyphWidth = 1.6 * inversePixel;
  const edgePlusGlyphLength = 4.5 * inversePixel;
  const gridStrokeWidth = 1 * inversePixel;
  const stripeStrokeWidth = 1.5 * inversePixel;

  const mapCenter = mapEnabled && geoAnchor
    ? metersToLatLng(geoAnchor, view.centerX, view.centerY)
    : null;
  const mapZoom = mapEnabled && geoAnchor ? canvasZoomToMapZoom(view.zoom, geoAnchor.lat) : 1;

  return (
    <div className="relative h-full w-full overflow-hidden bg-surface">
      {mapEnabled && mapCenter ? (
        <div className="pointer-events-none absolute inset-0">
          <GoogleMapLayer center={mapCenter} mapTypeId="satellite" passive zoom={mapZoom} />
        </div>
      ) : null}
      <svg
        className="absolute inset-0 h-full w-full select-none"
        onMouseDown={startPan}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        ref={svgRef}
        style={{
          cursor: aiMode ? (isAiBusy ? "wait" : "crosshair") : interaction?.mode === "pan" ? "grabbing" : "default",
          touchAction: "none",
          background: mapEnabled ? "transparent" : "hsl(var(--canvas))"
        }}
        viewBox={viewBox}
      >
        <defs>
          <pattern id="facility-map-grid" x="0" y="0" width={CANVAS_GRID_SIZE} height={CANVAS_GRID_SIZE} patternUnits="userSpaceOnUse">
            <path
              d={`M ${CANVAS_GRID_SIZE} 0 L 0 0 0 ${CANVAS_GRID_SIZE}`}
              fill="none"
              stroke="hsl(var(--border) / 0.5)"
              strokeWidth={gridStrokeWidth}
            />
          </pattern>
          {/* White-ish grid for satellite mode where the dark border lines would wash out. */}
          <pattern id="facility-map-grid-on-map" x="0" y="0" width={CANVAS_GRID_SIZE} height={CANVAS_GRID_SIZE} patternUnits="userSpaceOnUse">
            <path
              d={`M ${CANVAS_GRID_SIZE} 0 L 0 0 0 ${CANVAS_GRID_SIZE}`}
              fill="none"
              stroke="rgba(255, 255, 255, 0.35)"
              strokeWidth={gridStrokeWidth}
            />
          </pattern>
          <pattern
            id="facility-map-archived-stripes"
            x="0"
            y="0"
            width={CANVAS_GRID_SIZE / 2}
            height={CANVAS_GRID_SIZE / 2}
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2={CANVAS_GRID_SIZE / 2}
              stroke="hsl(var(--text-muted) / 0.18)"
              strokeWidth={stripeStrokeWidth}
            />
          </pattern>
          <filter id="facility-map-handle-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy={1 * inversePixel} stdDeviation={1.5 * inversePixel} floodColor="hsl(var(--text))" floodOpacity="0.18" />
          </filter>
        </defs>

        {/* Always render the grid as a visual reference; over satellite it's white + faint so it doesn't dominate. */}
        <rect
          fill={mapEnabled ? "url(#facility-map-grid-on-map)" : "url(#facility-map-grid)"}
          height={viewBoxHeight}
          width={viewBoxWidth}
          x={viewBoxX}
          y={viewBoxY}
        />

        {sortedNodes.map((node) => {
          const isSelected = node.id === selectedNodeId;
          const isMultiSelected = Boolean(multiSelectedNodeIds?.has(node.id));
          const isHovered = node.id === hoveredNodeId && !isSelected;
          const space = spaceById.get(node.entityId);
          const fill = fillForStatus(space?.status, isHovered, isSelected);
          const stroke = isMultiSelected ? "hsl(var(--accent))" : strokeForState({ selected: isSelected, hovered: isHovered });
          const path = polygonPath(node.points, CORNER_RADIUS_WORLD);

          return (
            <path
              d={path}
              fill={fill}
              fillOpacity={mapEnabled ? 0.55 : 1}
              key={node.id}
              onMouseDown={(event) => startMove(node, event)}
              onMouseEnter={() => {
                setHoveredNodeId(node.id);
                setTopNodeId(node.id);
              }}
              onMouseLeave={() => setHoveredNodeId((current) => (current === node.id ? null : current))}
              stroke={stroke}
              strokeLinejoin="round"
              strokeWidth={isSelected || isMultiSelected ? selectedStrokeWidth : baseStrokeWidth}
              style={{ cursor: canWrite ? "move" : "default" }}
            />
          );
        })}

        {/* AI suggestion ghosts — dashed accent overlays. Click toggles accept;
            accepted ghosts are solid-accent, rejected ones fade and use the
            muted stroke. */}
        {aiSuggestionPoints && aiSuggestionPoints.length > 0
          ? aiSuggestionPoints.map((suggestion, index) => {
              const path = polygonPath(suggestion.points, 0);
              const center = polygonCentroid(suggestion.points);
              const accepted = suggestion.accepted;
              const strokeColor = accepted ? "hsl(var(--accent))" : "hsl(var(--text-muted))";
              const dashLen = 6 * inversePixel;
              const handleClick = (event: React.MouseEvent) => {
                event.stopPropagation();
                onToggleAiSuggestion?.(index);
              };
              return (
                <g
                  key={`ai-suggestion-${suggestion.id}`}
                  onClick={handleClick}
                  onMouseDown={(event) => event.stopPropagation()}
                  style={{ cursor: onToggleAiSuggestion ? "pointer" : "default" }}
                >
                  <path
                    d={path}
                    fill={accepted ? "hsl(var(--accent) / 0.22)" : "hsl(var(--text-muted) / 0.08)"}
                    fillOpacity={accepted ? 1 : 0.5}
                    stroke={strokeColor}
                    strokeDasharray={`${dashLen} ${dashLen}`}
                    strokeLinejoin="round"
                    strokeOpacity={accepted ? 1 : 0.6}
                    strokeWidth={selectedStrokeWidth}
                  />
                  <g
                    pointerEvents="none"
                    transform={`translate(${center.x} ${center.y}) scale(${inversePixel})`}
                  >
                    <foreignObject height={36} style={{ overflow: "visible", pointerEvents: "none" }} width={180} x={-90} y={-18}>
                      <div className="flex h-full w-full items-center justify-center">
                        <div
                          className={
                            accepted
                              ? "inline-flex items-center gap-1.5 rounded-full border border-accent/45 bg-surface px-2.5 py-1 text-[11px] font-semibold text-text shadow-sm"
                              : "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/80 px-2.5 py-1 text-[11px] font-semibold text-text-muted shadow-sm line-through"
                          }
                        >
                          <span
                            className={
                              accepted
                                ? "inline-flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground"
                                : "inline-flex h-4 w-4 items-center justify-center rounded-full bg-surface-muted text-[10px] font-bold text-text-muted"
                            }
                          >
                            {index + 1}
                          </span>
                          <span className="max-w-[140px] truncate">{suggestion.label}</span>
                        </div>
                      </div>
                    </foreignObject>
                  </g>
                </g>
              );
            })
          : null}

        {(() => {
          const ordered =
            topNodeId && sortedNodes.some((node) => node.id === topNodeId)
              ? [...sortedNodes.filter((node) => node.id !== topNodeId), sortedNodes.find((node) => node.id === topNodeId)!]
              : sortedNodes;

          return ordered.map((node) => {
            const space = spaceById.get(node.entityId);
            const statusDef = space?.statusId ? statusById.get(space.statusId) ?? null : null;
            const center = polygonCentroid(node.points);
            const archived = space?.status === "archived";

            return (
              <g key={`label-${node.id}`} transform={`translate(${center.x} ${center.y}) scale(${inversePixel})`}>
                <foreignObject
                  height={120}
                  width={520}
                  x={-260}
                  y={-60}
                  // `pointerEvents: none` on the foreignObject is critical:
                  // the element's bbox covers a 520×120 area centered on
                  // each polygon, so without it every click on the canvas
                  // BENEATH a label gets eaten by the foreignObject (which
                  // has no handler) and bubbles up to the SVG's pan handler
                  // instead of reaching the polygon's `startMove`. The pill
                  // child below opts back IN with `pointer-events-auto`.
                  style={{ overflow: "visible", pointerEvents: "none" }}
                >
                  <div className="pointer-events-none flex h-full w-full items-center justify-center">
                    <div
                      className={
                        "pointer-events-auto inline-flex max-w-[360px] items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors " +
                        (archived
                          ? "bg-surface-muted text-text-muted hover:bg-surface-muted"
                          : "bg-surface text-text hover:bg-surface-muted")
                      }
                      onMouseDown={(event) => startMove(node, event)}
                      onMouseEnter={() => setTopNodeId(node.id)}
                      style={{ cursor: canWrite ? "move" : "default" }}
                    >
                      {(() => {
                        const KindIcon = space ? getSpaceKindIcon(space.spaceKind) : null;
                        return KindIcon ? <KindIcon className="h-3.5 w-3.5 shrink-0 text-text-muted" /> : null;
                      })()}
                      <span className="min-w-0 truncate">{node.label}</span>
                      {statusDef && !replaceStatusChipBySpaceId?.has(node.entityId) ? (
                        <StatusChip color={statusDef.color} label={statusDef.label} size="sm" />
                      ) : null}
                      {nodeBadgeBySpaceId?.[node.entityId] ?? null}
                    </div>
                  </div>
                </foreignObject>
              </g>
            );
          });
        })()}

        {selectedNodeId && canWrite && edgeHover && edgeHover.nodeId === selectedNodeId ? (
          <g
            onMouseDown={(event) => {
              event.stopPropagation();
              insertVertex(edgeHover.nodeId, edgeHover.edgeIndex, edgeHover.point);
            }}
            style={{ cursor: "default" }}
            transform={`translate(${edgeHover.point.x} ${edgeHover.point.y})`}
          >
            <circle
              fill="hsl(var(--accent))"
              filter="url(#facility-map-handle-shadow)"
              r={edgePlusRadius}
              stroke="hsl(var(--surface))"
              strokeWidth={edgePlusStrokeWidth}
            />
            <line
              stroke="hsl(var(--accent-foreground))"
              strokeLinecap="round"
              strokeWidth={edgePlusGlyphWidth}
              x1={-edgePlusGlyphLength}
              x2={edgePlusGlyphLength}
              y1="0"
              y2="0"
            />
            <line
              stroke="hsl(var(--accent-foreground))"
              strokeLinecap="round"
              strokeWidth={edgePlusGlyphWidth}
              x1="0"
              x2="0"
              y1={-edgePlusGlyphLength}
              y2={edgePlusGlyphLength}
            />
          </g>
        ) : null}

        {/* Rotation handle. Sits centered above the bbox with a connector
            line to the polygon's centroid. Drag = continuous rotation;
            Shift while dragging snaps to 15° increments. Available in both
            grid and satellite modes. */}
        {selectedNodeId && canWrite
          ? (() => {
              const node = nodeById.get(selectedNodeId);
              if (!node || node.points.length < 3) return null;
              const center = polygonCentroid(node.points);
              const handleOffsetPx = 28;
              const handleRadiusPx = 8;
              const handleOffset = handleOffsetPx * inversePixel;
              const handleR = handleRadiusPx * inversePixel;
              const handleX = center.x;
              const handleY = node.bounds.y - handleOffset;
              const isRotating = interaction?.mode === "rotate" && interaction.nodeId === node.id;
              return (
                <g key={`rotate-${node.id}`}>
                  <line
                    stroke="hsl(var(--accent))"
                    strokeDasharray={`${4 * inversePixel} ${3 * inversePixel}`}
                    strokeWidth={1 * inversePixel}
                    x1={handleX}
                    x2={handleX}
                    y1={node.bounds.y}
                    y2={handleY}
                  />
                  <circle
                    cx={handleX}
                    cy={handleY}
                    fill="hsl(var(--accent))"
                    filter="url(#facility-map-handle-shadow)"
                    onMouseDown={(event) => startRotate(node.id, event)}
                    r={handleR}
                    stroke="hsl(var(--surface))"
                    strokeWidth={1.5 * inversePixel}
                    style={{ cursor: isRotating ? "grabbing" : "grab" }}
                  />
                </g>
              );
            })()
          : null}

        {/* Vertex handles render in BOTH grid and satellite mode — without
            them the user has no way to reshape a polygon, which is the
            whole point of the editor. The earlier gate that hid them in
            satellite mode was a mistake. */}
        {selectedNodeId && canWrite
          ? (() => {
              const node = nodeById.get(selectedNodeId);
              if (!node) return null;
              return (
                <g key={`handles-${node.id}`}>
                  {node.points.map((point, index) => {
                    const isSelectedVertex = selectedVertexIndices.includes(index);
                    const radius = isSelectedVertex ? handleRadius * 1.4 : handleRadius;
                    return (
                      <circle
                        cx={point.x}
                        cy={point.y}
                        fill={point.smooth ? "hsl(var(--accent))" : isSelectedVertex ? "hsl(var(--accent))" : "hsl(var(--surface))"}
                        filter="url(#facility-map-handle-shadow)"
                        key={`${node.id}-handle-${index}`}
                        onDoubleClick={(event) => handleVertexDoubleClick(event, node.id, index)}
                        onMouseDown={(event) => startVertexInteraction(node.id, index, event)}
                        r={radius}
                        stroke={point.smooth || isSelectedVertex ? "hsl(var(--surface))" : "hsl(var(--accent))"}
                        strokeWidth={handleStrokeWidth}
                        style={{ cursor: "grab" }}
                      />
                    );
                  })}
                </g>
              );
            })()
          : null}
      </svg>

      <FacilityMapToolbar
        aiMode={aiMode}
        canWrite={canWrite}
        geoHasAnchor={geoAnchor !== null}
        geoShowMap={geoShowMap}
        indoor={indoor}
        isAdding={false}
        isAiBusy={isAiBusy}
        isSaving={isSaving}
        onAddSpace={handleAddSpace}
        onEdit={onEdit}
        onEditGeoLocation={onEditGeoLocation}
        onFit={handleFit}
        onSave={onSave}
        onToggleAiMode={onToggleAiMode}
        onToggleGeoMap={onToggleGeoMap}
        onZoomIn={() => handleZoom(1)}
        onZoomOut={() => handleZoom(-1)}
        readOnly={readOnly}
        zoom={view.zoom}
      />
    </div>
  );
}
