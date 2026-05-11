"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Columns2, Rows2 } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { SurfaceBody, SurfaceCloseButton, SurfaceFooter, SurfaceHeader } from "@orgframe/ui/primitives/surface";
import { cn } from "./utils";

// -----------------------------------------------------------------------------
// Architecture
//
// There is exactly one PanelContainer mounted in the app shell. It is the only
// element with a fixed width — all panels are flex children inside it. Resizing
// the container's left edge widens or narrows the "unit" width that each panel
// gets. Toggling layout flips the container between flex-row (side-by-side)
// and flex-col (stacked). Panels themselves do no positioning or registry —
// they simply portal an <aside> into the container's dock.
//
// Popup-context panels (rendered inside Popup editors) keep the previous
// behavior: they portal into popup-panel-dock with their own positioning, since
// they aren't part of the global panel stack.
// -----------------------------------------------------------------------------

const UNIT_PANEL_WIDTH = 325;
const UNIT_PANEL_MIN_WIDTH = 280;
const UNIT_PANEL_MAX_WIDTH = 900;
const UNIT_WIDTH_STORAGE_KEY = "orgframe:panel-unit-width-px";
const LAYOUT_MODE_STORAGE_KEY = "orgframe:panel-layout-mode";

const PANEL_DOCK_ID = "panel-dock";
const PRIMARY_HEADER_ID = "app-primary-header";

/**
 * Resolve `--layout-gap` to a pixel value.
 *
 * The CSS variable is declared in `rem` (e.g. `--layout-gap: 1rem`), and
 * `getPropertyValue` returns the raw string — `parseFloat("1rem")` yields
 * `1`, not `16`. Scale by the root font size so callers get the rendered px.
 * Handles `rem`, `em`, `px`, and unitless values.
 */
function readLayoutGapPx(): number {
  if (typeof window === "undefined") return 0;
  const rootStyles = window.getComputedStyle(document.documentElement);
  const raw = rootStyles.getPropertyValue("--layout-gap").trim();
  if (!raw) return 0;
  const numeric = Number.parseFloat(raw);
  if (!Number.isFinite(numeric)) return 0;
  if (raw.endsWith("rem") || raw.endsWith("em")) {
    const rootFontSize = Number.parseFloat(rootStyles.fontSize) || 16;
    return numeric * rootFontSize;
  }
  return numeric;
}

export type PanelLayoutMode = "side-by-side" | "stacked";

// -----------------------------------------------------------------------------
// Module-level container state — accessible to Panel children for the toggle
// button shortcut and for hydration. The PanelContainer is the source of truth.
// -----------------------------------------------------------------------------

type ContainerState = {
  unitWidth: number;
  layoutMode: PanelLayoutMode;
};
const containerListeners = new Set<(state: ContainerState) => void>();
let containerState: ContainerState = { unitWidth: UNIT_PANEL_WIDTH, layoutMode: "side-by-side" };
let containerHydrated = false;
function hydrateContainerState() {
  if (containerHydrated || typeof window === "undefined") return;
  containerHydrated = true;
  try {
    const widthRaw = window.localStorage.getItem(UNIT_WIDTH_STORAGE_KEY);
    const widthParsed = widthRaw ? Number(widthRaw) : NaN;
    if (Number.isFinite(widthParsed) && widthParsed >= UNIT_PANEL_MIN_WIDTH && widthParsed <= UNIT_PANEL_MAX_WIDTH) {
      containerState = { ...containerState, unitWidth: widthParsed };
    }
    const modeRaw = window.localStorage.getItem(LAYOUT_MODE_STORAGE_KEY);
    if (modeRaw === "stacked" || modeRaw === "side-by-side") {
      containerState = { ...containerState, layoutMode: modeRaw };
    }
  } catch {
    /* ignore */
  }
}
function setContainerState(next: Partial<ContainerState>) {
  containerState = { ...containerState, ...next };
  containerListeners.forEach((fn) => fn(containerState));
}
function subscribeContainerState(fn: (state: ContainerState) => void): () => void {
  containerListeners.add(fn);
  return () => {
    containerListeners.delete(fn);
  };
}

// -----------------------------------------------------------------------------
// Panel order — drag-to-swap state. Each dock panel registers under a stable
// key (caller-supplied `panelKey` or auto-generated React id). The order array
// is the source of truth; panels read their index out of it and apply it as a
// CSS `order` so the dock's flex layout reflects the desired arrangement.
//
// Swap (vs. insert) keeps the implementation simple: dragging panel A onto
// panel B trades their two slots and leaves all other panels' positions
// untouched. No drop-zone preview chrome is needed.
//
// Popup-context and `globalPanel` panels do NOT register — they aren't part
// of the dock's flex row/column and have nothing to reorder.
// -----------------------------------------------------------------------------

const orderListeners = new Set<() => void>();
let orderState: string[] = [];

function registerPanelOrder(key: string) {
  if (orderState.includes(key)) return;
  orderState = [...orderState, key];
  notifyOrder();
}

function unregisterPanelOrder(key: string) {
  if (!orderState.includes(key)) return;
  orderState = orderState.filter((k) => k !== key);
  notifyOrder();
}

function swapPanelOrder(sourceKey: string, targetKey: string) {
  const sourceIdx = orderState.indexOf(sourceKey);
  const targetIdx = orderState.indexOf(targetKey);
  if (sourceIdx === -1 || targetIdx === -1 || sourceIdx === targetIdx) return;
  const next = [...orderState];
  next[sourceIdx] = targetKey;
  next[targetIdx] = sourceKey;
  orderState = next;
  notifyOrder();
}

function getPanelOrderIndex(key: string): number {
  const idx = orderState.indexOf(key);
  return idx === -1 ? orderState.length : idx;
}

function notifyOrder() {
  orderListeners.forEach((fn) => fn());
}

function subscribeOrder(fn: () => void): () => void {
  orderListeners.add(fn);
  return () => {
    orderListeners.delete(fn);
  };
}

const PANEL_DRAG_MIME = "application/x-orgframe-panel-key";

// -----------------------------------------------------------------------------
// Per-gap orientations.
//
// Each gap between two adjacent panels (in the flat order array) carries its
// own `horizontal` / `vertical` orientation. Flipping gap N only affects the
// boundary between panel N and panel N+1, which lets a 3- or 4-panel layout
// mix orientations: e.g. one full-height column next to a stack of two.
//
// The flat array of orientations is parsed into a tree (`buildLayoutTree`)
// that the container renders as nested flex containers. Same-orientation
// adjacent gaps merge into one N-ary split so equal-orientation panels keep
// equal sizes (a row of 3 horizontal panels is one 3-way row, not a skewed
// binary nest).
// -----------------------------------------------------------------------------

type GapOrientation = "horizontal" | "vertical";

let gapOrientations: GapOrientation[] = [];
const gapOrientationListeners = new Set<() => void>();

function syncGapOrientations(panelCount: number) {
  const targetLen = Math.max(0, panelCount - 1);
  if (gapOrientations.length === targetLen) return;
  if (gapOrientations.length < targetLen) {
    const additions: GapOrientation[] = [];
    for (let i = gapOrientations.length; i < targetLen; i++) additions.push("horizontal");
    gapOrientations = [...gapOrientations, ...additions];
  } else {
    gapOrientations = gapOrientations.slice(0, targetLen);
  }
  notifyGapOrientations();
}

function setGapOrientation(idx: number, orientation: GapOrientation) {
  if (idx < 0 || idx >= gapOrientations.length) return;
  if (gapOrientations[idx] === orientation) return;
  gapOrientations = [...gapOrientations];
  gapOrientations[idx] = orientation;
  notifyGapOrientations();
}

function notifyGapOrientations() {
  gapOrientationListeners.forEach((fn) => fn());
}

function subscribeGapOrientations(fn: () => void): () => void {
  gapOrientationListeners.add(fn);
  return () => {
    gapOrientationListeners.delete(fn);
  };
}

type LayoutTree =
  | { kind: "leaf"; panelKey: string }
  | { kind: "split"; orientation: GapOrientation; children: LayoutTree[] };

function buildLayoutTree(panels: string[], gaps: GapOrientation[]): LayoutTree | null {
  if (panels.length === 0) return null;
  if (panels.length === 1) return { kind: "leaf", panelKey: panels[0] };
  // Find the longest prefix of consecutive same-orientation gaps. Those panels
  // share one N-ary split with that orientation; the rest is recursed on.
  const firstOrient = gaps[0];
  let prefixGaps = 1;
  while (prefixGaps < gaps.length && gaps[prefixGaps] === firstOrient) prefixGaps++;
  if (prefixGaps === gaps.length) {
    return {
      kind: "split",
      orientation: firstOrient,
      children: panels.map((p) => ({ kind: "leaf", panelKey: p }))
    };
  }
  const leftPanels = panels.slice(0, prefixGaps + 1);
  const leftGroup: LayoutTree =
    leftPanels.length === 1
      ? { kind: "leaf", panelKey: leftPanels[0] }
      : {
          kind: "split",
          orientation: firstOrient,
          children: leftPanels.map((p) => ({ kind: "leaf", panelKey: p }))
        };
  const rest = buildLayoutTree(panels.slice(prefixGaps + 1), gaps.slice(prefixGaps + 1));
  if (!rest) return leftGroup;
  const combiningOrient = gaps[prefixGaps];
  // Merge with `rest` if it's already a split of the same orientation — keeps
  // a sequence like horiz/vert/vert as a 3-way vertical instead of nested.
  if (rest.kind === "split" && rest.orientation === combiningOrient) {
    return {
      kind: "split",
      orientation: combiningOrient,
      children: [leftGroup, ...rest.children]
    };
  }
  return {
    kind: "split",
    orientation: combiningOrient,
    children: [leftGroup, rest]
  };
}

function countLayoutLeaves(node: LayoutTree): number {
  if (node.kind === "leaf") return 1;
  return node.children.reduce((sum, child) => sum + countLayoutLeaves(child), 0);
}

function computeHorizontalUnits(node: LayoutTree): number {
  if (node.kind === "leaf") return 1;
  if (node.orientation === "horizontal") {
    return node.children.reduce((sum, c) => sum + computeHorizontalUnits(c), 0);
  }
  return Math.max(...node.children.map(computeHorizontalUnits));
}

// -----------------------------------------------------------------------------
// Cell registry — `LayoutNode` leaves push their DOM node into this map
// synchronously in `useLayoutEffect`, panels subscribe and re-resolve their
// portal target the instant a cell appears or moves. This replaces the
// fragile `getElementById` race the previous version had: with 3+ panels
// the cell could be in the DOM but the panel's resolve pass had already
// run and fallen back to the root dock, and there was no signal to retry.
// -----------------------------------------------------------------------------

const cellNodes = new Map<string, HTMLDivElement>();
const cellListeners = new Set<() => void>();

function registerCellNode(panelKey: string, node: HTMLDivElement | null) {
  const existing = cellNodes.get(panelKey);
  if (node === existing) return;
  if (node) cellNodes.set(panelKey, node);
  else cellNodes.delete(panelKey);
  cellListeners.forEach((fn) => fn());
}

function getCellNode(panelKey: string): HTMLDivElement | undefined {
  return cellNodes.get(panelKey);
}

function subscribeCellNodes(fn: () => void): () => void {
  cellListeners.add(fn);
  return () => {
    cellListeners.delete(fn);
  };
}

// -----------------------------------------------------------------------------
// PanelContainer — the single fixed-positioned chrome that holds all panels.
// Mounts once in the app shell. Everything layout-related lives here.
// -----------------------------------------------------------------------------

export function PanelContainer() {
  const [unitWidth, setUnitWidth] = React.useState<number>(UNIT_PANEL_WIDTH);
  const [panelKeys, setPanelKeys] = React.useState<string[]>([]);
  const [gapOrients, setGapOrients] = React.useState<GapOrientation[]>([]);
  const [panelTop, setPanelTop] = React.useState(0);
  const dockRef = React.useRef<HTMLDivElement | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const unitWidthRef = React.useRef(unitWidth);
  unitWidthRef.current = unitWidth;

  // Hydrate state from localStorage on mount and stay subscribed to module updates.
  React.useEffect(() => {
    hydrateContainerState();
    setUnitWidth(containerState.unitWidth);
    return subscribeContainerState((state) => {
      setUnitWidth(state.unitWidth);
    });
  }, []);

  // Mirror the module-level order + gap arrays into local state so the
  // container re-renders when panels open/close or gaps flip. Also keeps
  // `gapOrientations` length in sync with the panel count.
  React.useEffect(() => {
    const sync = () => {
      const nextKeys = [...orderState];
      syncGapOrientations(nextKeys.length);
      setPanelKeys(nextKeys);
      setGapOrients([...gapOrientations]);
    };
    sync();
    const unsubOrder = subscribeOrder(sync);
    const unsubGaps = subscribeGapOrientations(() => setGapOrients([...gapOrientations]));
    return () => {
      unsubOrder();
      unsubGaps();
    };
  }, []);

  // Track panel-top — align to the top of `.app__content` (the row where page
  // content sits). When there is no AppShell on the page (e.g. auth routes),
  // fall back to "below the primary header by one layout-gap". Panels render
  // BEHIND popups (lower z-index), so we never need to dodge popup headers.
  React.useEffect(() => {
    const measure = () => {
      const layoutGap = readLayoutGapPx();

      // Floor the panel at "one layout-gap below the sticky topbar" so it
      // can never rise above the pinned topbar on scroll. When there is
      // no topbar (--app-topbar-height is unset / 0), the floor is 0 and
      // the primary-header fallback below applies.
      const topbarHeight = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--app-topbar-height")
      ) || 0;
      const stickyFloor = topbarHeight > 0 ? layoutGap + topbarHeight + layoutGap : 0;

      const body = document.querySelector(".app__content") as HTMLElement | null;
      let next: number;
      if (body) {
        next = Math.max(stickyFloor, Math.round(body.getBoundingClientRect().top));
      } else {
        const header = document.getElementById(PRIMARY_HEADER_ID);
        const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
        next = Math.max(0, Math.round(headerBottom + layoutGap));
      }
      setPanelTop((current) => (current === next ? current : next));
    };
    measure();
    const header = document.getElementById(PRIMARY_HEADER_ID);
    const body = document.querySelector(".app__content") as HTMLElement | null;
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      if (header) observer.observe(header);
      if (body) observer.observe(body);
    }
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, []);

  // Compute container's total width in CSS px. Width tracks the maximum
  // horizontal-unit count anywhere in the layout tree — a row of 3 panels
  // is 3 units wide, a 2x2 grid is 2 units wide, a single column of 3
  // stacked panels is 1 unit wide.
  const layoutGapPx = React.useMemo(() => {
    if (typeof window === "undefined") return 16;
    return readLayoutGapPx() || 16;
    // panelKeys/panelTop in deps so this re-runs when layout changes (e.g.
    // viewport crosses the 768px breakpoint where --layout-gap shifts).
  }, [panelKeys.length, panelTop]);

  const tree = React.useMemo(() => buildLayoutTree(panelKeys, gapOrients), [panelKeys, gapOrients]);
  const horizontalUnits = tree ? computeHorizontalUnits(tree) : 0;
  const horizontalUnitsRef = React.useRef(horizontalUnits);
  horizontalUnitsRef.current = horizontalUnits;
  const visiblePanels = panelKeys.length;
  const containerTotalWidth =
    horizontalUnits === 0
      ? 0
      : horizontalUnits * unitWidth + Math.max(0, horizontalUnits - 1) * layoutGapPx;

  // Update body var + class to push page content over.
  React.useEffect(() => {
    if (visiblePanels === 0) {
      document.body.classList.remove("panel-open-content");
      document.body.style.removeProperty("--panel-active-width");
      return;
    }
    document.body.classList.add("panel-open-content");
    document.body.style.setProperty("--panel-active-width", `${containerTotalWidth}px`);
  }, [containerTotalWidth, visiblePanels]);

  // Resize handle — drag the container's left edge to change unitWidth. Imperative DOM update
  // during drag for frame-perfect feedback, then commit to React state on release.
  const handleResizeStart = React.useCallback((event: React.MouseEvent | React.TouchEvent) => {
    const containerNode = containerRef.current;
    if (!containerNode) return;
    const startX = "touches" in event ? event.touches[0].clientX : event.clientX;
    const startUnitWidth = unitWidthRef.current;
    event.preventDefault();
    document.body.classList.add("panel-resizing");

    let latestUnitWidth = startUnitWidth;
    let rafId: number | null = null;

    const apply = (nextUnit: number) => {
      // Width is `units * unit + (units-1) * gap`, where `units` is the
      // horizontal-unit count of the active layout tree (1 for an all-vertical
      // stack, N for a row of N, etc).
      const units = horizontalUnitsRef.current;
      const rootStyles = window.getComputedStyle(document.documentElement);
      const gap = Number.parseFloat(rootStyles.getPropertyValue("--layout-gap")) || 0;
      const total = units === 0 ? 0 : units * nextUnit + Math.max(0, units - 1) * gap;
      containerNode.style.width = `${total}px`;
      document.body.style.setProperty("--panel-active-width", `${total}px`);
    };

    const onMove = (clientX: number) => {
      const delta = startX - clientX;
      const viewportAllowance = Math.max(0, window.innerWidth - 32);
      const units = horizontalUnitsRef.current;
      const rootStyles = window.getComputedStyle(document.documentElement);
      const gap = Number.parseFloat(rootStyles.getPropertyValue("--layout-gap")) || 0;
      // The user drags the container's outer edge; translate the cursor delta
      // into a per-unit delta so each horizontal unit shares the change equally.
      const perUnitFactor = Math.max(1, units);
      const unitDelta = delta / perUnitFactor;
      const totalGap = Math.max(0, units - 1) * gap;
      const maxUnitFromViewport = Math.max(UNIT_PANEL_MIN_WIDTH, (viewportAllowance - totalGap) / perUnitFactor);
      const nextUnit = Math.max(
        UNIT_PANEL_MIN_WIDTH,
        Math.min(UNIT_PANEL_MAX_WIDTH, Math.min(maxUnitFromViewport, startUnitWidth + unitDelta))
      );
      latestUnitWidth = nextUnit;
      if (rafId === null) {
        rafId = window.requestAnimationFrame(() => {
          rafId = null;
          apply(latestUnitWidth);
        });
      }
    };

    const handleMouseMove = (e: MouseEvent) => onMove(e.clientX);
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) onMove(e.touches[0].clientX);
    };

    const cleanup = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleMouseUp);
      document.body.classList.remove("panel-resizing");
      const finalUnitWidth = Math.round(latestUnitWidth);
      // Commit to module + React state. Module update fires subscribers (this component), which
      // re-renders with the React-driven inline style — replacing the imperative inline width.
      try {
        window.localStorage.setItem(UNIT_WIDTH_STORAGE_KEY, String(finalUnitWidth));
      } catch {
        /* ignore */
      }
      try {
        void fetch("/api/preferences/panel-width", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ widthPx: finalUnitWidth, panelKey: "__container__" }),
          keepalive: true
        });
      } catch {
        /* ignore */
      }
      setContainerState({ unitWidth: finalUnitWidth });
    };
    const handleMouseUp = () => cleanup();

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleMouseUp);
  }, []);

  const showResizeHandle = visiblePanels > 0;

  return (
    <div
      aria-hidden={visiblePanels === 0}
      className={cn(
        "panel-container pointer-events-none fixed",
        visiblePanels === 0 && "invisible"
      )}
      ref={containerRef}
      style={{
        right: "var(--layout-gap)",
        top: panelTop ? `${panelTop}px` : "var(--layout-gap)",
        bottom: "var(--layout-gap)",
        width: `${containerTotalWidth}px`,
        // Panels live BELOW Popup (z-1200/1201). Opening a popup covers
        // panels with the popup backdrop — clear modal precedence and no
        // height reflow.
        zIndex: 1100
      }}
    >
      {showResizeHandle ? (
        <div
          aria-hidden
          className="panel-resize-handle pointer-events-auto"
          onMouseDown={handleResizeStart}
          onTouchStart={handleResizeStart}
          role="separator"
        />
      ) : null}
      <div
        className="flex h-full w-full min-h-0 min-w-0"
        id={PANEL_DOCK_ID}
        ref={dockRef}
      >
        {tree ? <LayoutNode node={tree} /> : null}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// LayoutNode — recursive renderer for the panel layout tree. Leaves emit a
// `<div id="panel-cell-{key}">` that the matching Panel portals into. Splits
// emit a relative-positioned flex container with N children + (N-1) gap-toggle
// buttons absolutely positioned at the boundary between each adjacent pair.
// -----------------------------------------------------------------------------

function LayoutNode({ node }: { node: LayoutTree }) {
  if (node.kind === "leaf") {
    return <LayoutCell panelKey={node.panelKey} />;
  }
  const isHorizontal = node.orientation === "horizontal";
  const N = node.children.length;
  // For each adjacent child pair, compute the index in the flat
  // `gapOrientations` array — equal to the position of the last leaf in
  // the preceding child (since the flat panel order matches DFS order).
  const gapInfos: { gapIdx: number; childIdx: number }[] = [];
  let cumLeaves = 0;
  for (let i = 0; i < N - 1; i++) {
    cumLeaves += countLayoutLeaves(node.children[i]);
    gapInfos.push({ gapIdx: cumLeaves - 1, childIdx: i });
  }
  return (
    <div
      className="relative flex min-h-0 min-w-0"
      style={{
        flex: "1 1 0",
        flexDirection: isHorizontal ? "row" : "column",
        gap: "var(--layout-gap)"
      }}
    >
      {node.children.map((child, i) => (
        <LayoutNode key={leafKeyFor(child, i)} node={child} />
      ))}
      {gapInfos.map(({ gapIdx, childIdx }) => (
        <GapToggleButton
          childIdx={childIdx}
          gapIdx={gapIdx}
          isHorizontal={isHorizontal}
          key={`gap-${gapIdx}`}
          totalChildren={N}
        />
      ))}
    </div>
  );
}

function LayoutCell({ panelKey }: { panelKey: string }) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  // Register the cell node BEFORE paint so any panel subscribed to the
  // registry sees it on the same commit and immediately portals into it.
  // Stable callback ref pattern — the callback is itself stable across
  // renders, so React doesn't re-run it on every commit.
  const setRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      ref.current = node;
      registerCellNode(panelKey, node);
    },
    [panelKey]
  );
  return (
    <div
      className="flex min-h-0 min-w-0 flex-col"
      ref={setRef}
      style={{ flex: "1 1 0" }}
    />
  );
}

function leafKeyFor(node: LayoutTree, fallbackIndex: number): string {
  if (node.kind === "leaf") return node.panelKey;
  // Identify by the first leaf so React keeps subtree identity stable across
  // re-orderings of a parent split.
  const firstLeaf = findFirstLeaf(node);
  return firstLeaf ? `subtree-${firstLeaf}` : `subtree-${fallbackIndex}`;
}

function findFirstLeaf(node: LayoutTree): string | null {
  if (node.kind === "leaf") return node.panelKey;
  for (const child of node.children) {
    const f = findFirstLeaf(child);
    if (f) return f;
  }
  return null;
}

// `getElementById` accepts any string, but we still strip characters that
// confuse `querySelector` callers (the id contains React's `:r0:` colons).
function cssIdSafe(key: string): string {
  return key.replace(/:/g, "_");
}

function GapToggleButton({
  childIdx,
  gapIdx,
  isHorizontal,
  totalChildren
}: {
  childIdx: number;
  gapIdx: number;
  isHorizontal: boolean;
  totalChildren: number;
}) {
  // Center the button on the boundary between child `childIdx` and
  // child `childIdx + 1`. For N equal-flex children the boundary sits
  // approximately at `(childIdx + 1) / N` along the split axis — exact
  // for binary splits (50%) and within a few px for N > 2.
  const ratio = `${((childIdx + 1) / totalChildren) * 100}%`;
  const positionStyle: React.CSSProperties = isHorizontal
    ? { left: ratio, top: "50%", transform: "translate(-50%, -50%)" }
    : { top: ratio, left: "50%", transform: "translate(-50%, -50%)" };
  const onClick = () => setGapOrientation(gapIdx, isHorizontal ? "vertical" : "horizontal");
  return (
    <div
      aria-hidden
      className="pointer-events-auto absolute z-[150] rounded-full border bg-surface shadow-floating"
      style={positionStyle}
    >
      <Button
        aria-label={isHorizontal ? "Stack these two panels vertically" : "Place these two panels side-by-side"}
        iconOnly
        onClick={onClick}
        title={isHorizontal ? "Stack vertically" : "Side-by-side"}
      >
        {isHorizontal ? <Rows2 aria-hidden className="h-3.5 w-3.5" /> : <Columns2 aria-hidden className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Panel — thin wrapper that portals its content into the PanelContainer dock.
// All layout/positioning is handled by the container.
// -----------------------------------------------------------------------------

export type PanelProps = {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  headerShowAvatar?: boolean;
  headerAvatarUrl?: string | null;
  headerAvatarAlt?: string;
  headerAvatarSlot?: React.ReactNode;
  headerTopAction?: React.ReactNode;
  /**
   * Inline status accessory (typically a `<Chip>`) rendered next to the
   * title in the panel header. Use for wizards/settings panels that
   * control an entity with a status — see `packages/ui/CLAUDE.md`.
   */
  headerTitleAccessory?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /**
   * Left-aligned slot in the footer. Use for destructive entity actions
   * (e.g. an icon-only `<Button iconOnly>` with `Trash2`) so they sit
   * opposite the primary Save — never inline in the panel body. See
   * "Entity deletion in wizards/panels goes in the footer" in CLAUDE.md.
   */
  footerLeading?: React.ReactNode;
  panelClassName?: string;
  contentClassName?: string;
  panelStyle?: React.CSSProperties;
  /** @deprecated kept for API compatibility — pushMode is no longer per-panel. */
  pushMode?: "content" | "app";
  /** @deprecated legacy fixed-to-viewport positioning. Identical to default now. */
  globalPanel?: boolean;
  /**
   * Stable identity for the drag-to-swap order array. Optional — if
   * omitted, a per-mount React id is used. Pass an explicit key when
   * the panel can close and reopen and you want it to retake its
   * previous slot rather than landing at the end.
   */
  panelKey?: string;
};

export function Panel({
  open,
  onClose,
  title,
  subtitle,
  headerShowAvatar = false,
  headerAvatarUrl,
  headerAvatarAlt,
  headerAvatarSlot,
  headerTopAction,
  headerTitleAccessory,
  children,
  footer,
  footerLeading,
  panelClassName,
  contentClassName,
  panelStyle,
  globalPanel = false,
  panelKey
}: PanelProps) {
  const panelRef = React.useRef<HTMLElement | null>(null);
  const footerRef = React.useRef<HTMLDivElement | null>(null);
  const onCloseRef = React.useRef(onClose);
  const [mounted, setMounted] = React.useState(false);
  const [portalTarget, setPortalTarget] = React.useState<HTMLElement | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isDropTarget, setIsDropTarget] = React.useState(false);
  // Stable identity for the drag-swap order array. Caller can opt into an
  // explicit panelKey (useful if the panel can unmount/remount and we want
  // its slot to persist); otherwise we mint one from useId.
  const generatedKey = React.useId();
  const orderKey = React.useMemo(() => panelKey ?? generatedKey, [panelKey, generatedKey]);
  // Re-render this panel when the order array changes so `style.order` updates.
  const [, bumpOrder] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => subscribeOrder(bumpOrder), []);

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const resolvePortalTarget = React.useCallback((): HTMLElement | null => {
    if (typeof document === "undefined") return null;
    // Prefer this panel's registered cell node inside the layout tree. The
    // registry is updated synchronously by `LayoutCell` ref callbacks, so
    // as soon as PanelContainer renders the cell on a new commit, the
    // panel sees it on the same commit. Falls back to the root dock only
    // if the cell genuinely doesn't exist yet (e.g., before PanelContainer
    // has registered the panel into its order).
    const cell = getCellNode(orderKey);
    if (cell) return cell;
    return document.getElementById(PANEL_DOCK_ID) ?? document.body;
  }, [orderKey]);

  React.useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Re-resolve the portal target whenever the cell registry changes — that
  // covers initial cell render, drag-swaps that move the panel into a new
  // cell node, and gap-orientation flips that restructure the tree.
  React.useEffect(() => {
    if (!mounted) return;
    const apply = () => {
      const next = resolvePortalTarget();
      setPortalTarget((current) => (current === next ? current : next));
    };
    apply();
    return subscribeCellNodes(apply);
  }, [mounted, resolvePortalTarget]);

  // Only docked panels (not the legacy `globalPanel` viewport-pinned mode)
  // participate in the drag-swap order.
  const participatesInDockOrder = open && mounted && !globalPanel;

  React.useEffect(() => {
    if (!participatesInDockOrder) return;
    registerPanelOrder(orderKey);
    return () => unregisterPanelOrder(orderKey);
  }, [orderKey, participatesInDockOrder]);



  // Drag handlers — wired only when the panel is in the dock. The header is
  // the drag source; the whole aside is the drop target.
  const handleHeaderDragStart = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!participatesInDockOrder) return;
      event.dataTransfer.setData(PANEL_DRAG_MIME, orderKey);
      event.dataTransfer.effectAllowed = "move";
      setIsDragging(true);
    },
    [orderKey, participatesInDockOrder]
  );
  const handleHeaderDragEnd = React.useCallback(() => {
    setIsDragging(false);
    setIsDropTarget(false);
  }, []);
  const handlePanelDragOver = React.useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (!participatesInDockOrder) return;
      // Only accept drags carrying our private MIME — guards against
      // arbitrary text/file drops triggering reordering. We can't read
      // the source key during dragover (browsers hide the payload), but
      // we can inspect `types`.
      if (!event.dataTransfer.types.includes(PANEL_DRAG_MIME)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setIsDropTarget(true);
    },
    [participatesInDockOrder]
  );
  const handlePanelDragLeave = React.useCallback(() => {
    setIsDropTarget(false);
  }, []);
  const handlePanelDrop = React.useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (!participatesInDockOrder) return;
      const sourceKey = event.dataTransfer.getData(PANEL_DRAG_MIME);
      if (!sourceKey || sourceKey === orderKey) {
        setIsDropTarget(false);
        return;
      }
      event.preventDefault();
      swapPanelOrder(sourceKey, orderKey);
      setIsDropTarget(false);
    },
    [orderKey, participatesInDockOrder]
  );

  // Escape-to-close + Enter-submits-footer-primary keyboard handling.
  React.useLayoutEffect(() => {
    if (!open || !mounted || !portalTarget) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Enter" || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const panelNode = panelRef.current;
      if (!panelNode || !panelNode.contains(target)) return;
      if (target.closest("textarea, [contenteditable='true']")) return;
      if (target.closest("button, a")) return;
      const footerNode = footerRef.current;
      if (!footerNode) return;
      const submitButton = footerNode.querySelector<HTMLButtonElement>("button[type='submit']:not([disabled])");
      const fallbackButtons = Array.from(footerNode.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
      const primaryButton = submitButton ?? fallbackButtons[fallbackButtons.length - 1];
      if (!primaryButton) return;
      event.preventDefault();
      primaryButton.click();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mounted, open, portalTarget]);

  if (!mounted || !open || !portalTarget) {
    return null;
  }

  // Two positioning modes:
  //  - globalPanel: full-viewport pinned right edge (legacy)
  //  - default: flex child of the PanelContainer (the panel fills its cell)
  const baseClass =
    "app-panel pointer-events-auto flex min-h-0 min-w-0 flex-col overflow-hidden bg-surface shadow-floating";
  const positionClass = globalPanel
    ? "fixed z-[100] rounded-card border"
    : "relative rounded-card border flex-1";

  const positionStyle: React.CSSProperties = globalPanel
    ? { bottom: 0, right: 0, top: 0, maxWidth: "100vw", width: `min(100vw, ${UNIT_PANEL_WIDTH}px)` }
    : // The cell we portal into already determines the panel's slot in the
      // layout tree; the panel itself just fills that cell.
      { flex: "1 1 0", minWidth: 0, minHeight: 0 };

  return createPortal(
    <aside
      aria-label={typeof title === "string" ? title : undefined}
      className={cn(
        baseClass,
        positionClass,
        // Visual feedback during a swap drag — kept light so it doesn't
        // distract; consumers can override via panelClassName.
        participatesInDockOrder && isDragging && "opacity-60",
        participatesInDockOrder && isDropTarget && "ring-2 ring-accent ring-offset-2 ring-offset-canvas",
        panelClassName
      )}
      onDragLeave={participatesInDockOrder ? handlePanelDragLeave : undefined}
      onDragOver={participatesInDockOrder ? handlePanelDragOver : undefined}
      onDrop={participatesInDockOrder ? handlePanelDrop : undefined}
      ref={panelRef}
      role="complementary"
      style={{ ...panelStyle, ...positionStyle }}
    >
      {participatesInDockOrder ? (
        // Drag handle wraps the header so the user can grab anywhere on the
        // header band to start a swap. `draggable` is the only way to
        // initiate a native HTML drag — must live on the visible element
        // the user grabs, not on the panel root.
        <div
          className="cursor-grab active:cursor-grabbing"
          draggable
          onDragEnd={handleHeaderDragEnd}
          onDragStart={handleHeaderDragStart}
        >
          <SurfaceHeader
            avatarAlt={headerAvatarAlt}
            avatarSlot={headerAvatarSlot}
            avatarUrl={headerAvatarUrl}
            showAvatar={headerShowAvatar}
            subtitle={subtitle}
            title={title}
            titleAccessory={headerTitleAccessory}
            topAction={headerTopAction}
          />
        </div>
      ) : (
        <SurfaceHeader
          avatarAlt={headerAvatarAlt}
          avatarSlot={headerAvatarSlot}
          avatarUrl={headerAvatarUrl}
          showAvatar={headerShowAvatar}
          subtitle={subtitle}
          title={title}
          topAction={headerTopAction}
        />
      )}
      <SurfaceCloseButton className="z-[101]" label="Close panel" onClick={onClose} />
      <SurfaceBody className={contentClassName}>{children}</SurfaceBody>
      {footer || footerLeading ? (
        <SurfaceFooter footerRef={footerRef}>
          {footerLeading ? (
            <>
              {footerLeading}
              <div className="ml-auto flex flex-wrap items-center gap-2">{footer}</div>
            </>
          ) : (
            footer
          )}
        </SurfaceFooter>
      ) : null}
    </aside>,
    portalTarget
  );
}

// -----------------------------------------------------------------------------
// PanelScreens — unchanged.
// -----------------------------------------------------------------------------

type PanelScreen = {
  key: string;
  label: string;
};

type PanelScreensProps = {
  screens: PanelScreen[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
};

export function PanelScreens({ screens, activeKey, onChange, className }: PanelScreensProps) {
  return (
    <div className={cn("inline-flex w-full items-center gap-1 rounded-control border bg-surface p-1", className)}>
      {screens.map((screen) => (
        <button
          className={cn(
            "min-w-0 flex-1 rounded-control px-2 py-1.5 text-xs font-semibold transition-colors",
            activeKey === screen.key ? "bg-surface-muted text-text" : "text-text-muted hover:bg-surface-muted hover:text-text"
          )}
          key={screen.key}
          onClick={() => onChange(screen.key)}
          type="button"
        >
          <span className="truncate">{screen.label}</span>
        </button>
      ))}
    </div>
  );
}
