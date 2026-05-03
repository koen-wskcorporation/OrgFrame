"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { SurfaceBody, SurfaceCloseButton, SurfaceFooter, SurfaceHeader } from "@orgframe/ui/primitives/surface";
import { cn } from "./utils";

const UNIT_PANEL_WIDTH = 325;
const PANEL_COUNT_ATTRIBUTE = "data-panel-count";
const APP_PANEL_COUNT_ATTRIBUTE = "data-app-panel-count";
const POPUP_PANEL_COUNT_ATTRIBUTE = "data-popup-panel-count";
const PRIMARY_HEADER_ID = "app-primary-header";
const POPUP_PANEL_DOCK_ID = "popup-panel-dock";
const ROOT_DOCK_ID = "panel-dock";
const PANEL_DRAG_MIME = "application/x-orgframe-panel-key";
const STORAGE_KEY = "orgframe.panel-container.v1";
const MIN_UNIT_WIDTH = 240;
const MAX_UNIT_WIDTH = 600;

// ─────────────────────────────────────────────────────────────────────────
// Module-level dock state. Multiple Panels share these arrays so they can
// arrange themselves into a single grid without prop-drilling. Each piece
// has its own listener set so consumers (PanelContainer, individual
// Panels) can subscribe to just what they care about.
// ─────────────────────────────────────────────────────────────────────────

export type GapOrientation = "horizontal" | "vertical";

type LayoutTree =
  | { kind: "leaf"; panelKey: string }
  | { kind: "split"; orientation: GapOrientation; children: LayoutTree[] };

let orderState: string[] = [];
const orderListeners = new Set<() => void>();

let gapOrientations: GapOrientation[] = [];
const gapOrientationListeners = new Set<() => void>();

const cellNodes = new Map<string, HTMLDivElement>();
const cellListeners = new Set<() => void>();

let containerState: { unitWidth: number } = { unitWidth: UNIT_PANEL_WIDTH };
let containerHydrated = false;
const containerListeners = new Set<() => void>();

function notifyOrder() {
  orderListeners.forEach((fn) => fn());
}

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
  const srcIdx = orderState.indexOf(sourceKey);
  const tgtIdx = orderState.indexOf(targetKey);
  if (srcIdx === -1 || tgtIdx === -1 || srcIdx === tgtIdx) return;
  const next = [...orderState];
  next[srcIdx] = targetKey;
  next[tgtIdx] = sourceKey;
  orderState = next;
  notifyOrder();
}

function getPanelOrderIndex(key: string) {
  return orderState.indexOf(key);
}

function subscribeOrder(fn: () => void) {
  orderListeners.add(fn);
  return () => {
    orderListeners.delete(fn);
  };
}

function notifyGaps() {
  gapOrientationListeners.forEach((fn) => fn());
}

function syncGapOrientations(panelCount: number) {
  const targetLen = Math.max(0, panelCount - 1);
  if (gapOrientations.length === targetLen) return;
  if (gapOrientations.length > targetLen) {
    gapOrientations = gapOrientations.slice(0, targetLen);
  } else {
    const fill = new Array(targetLen - gapOrientations.length).fill("horizontal" as GapOrientation);
    gapOrientations = [...gapOrientations, ...fill];
  }
  notifyGaps();
}

function setGapOrientation(idx: number, orientation: GapOrientation) {
  if (idx < 0 || idx >= gapOrientations.length) return;
  if (gapOrientations[idx] === orientation) return;
  const next = [...gapOrientations];
  next[idx] = orientation;
  gapOrientations = next;
  notifyGaps();
}

function subscribeGapOrientations(fn: () => void) {
  gapOrientationListeners.add(fn);
  return () => {
    gapOrientationListeners.delete(fn);
  };
}

function registerCellNode(key: string, node: HTMLDivElement | null) {
  if (node) {
    cellNodes.set(key, node);
  } else {
    cellNodes.delete(key);
  }
  cellListeners.forEach((fn) => fn());
}

function subscribeCells(fn: () => void) {
  cellListeners.add(fn);
  return () => {
    cellListeners.delete(fn);
  };
}

function hydrateContainerState() {
  if (containerHydrated) return;
  containerHydrated = true;
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.unitWidth === "number" && parsed.unitWidth >= MIN_UNIT_WIDTH && parsed.unitWidth <= MAX_UNIT_WIDTH) {
      containerState = { unitWidth: parsed.unitWidth };
    }
  } catch {
    // ignore corrupt storage
  }
}

function setUnitWidth(next: number) {
  const clamped = Math.max(MIN_UNIT_WIDTH, Math.min(MAX_UNIT_WIDTH, Math.round(next)));
  if (containerState.unitWidth === clamped) return;
  containerState = { unitWidth: clamped };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(containerState));
    } catch {
      // quota / private mode — drop silently
    }
  }
  containerListeners.forEach((fn) => fn());
}

function subscribeContainerState(fn: () => void) {
  containerListeners.add(fn);
  return () => {
    containerListeners.delete(fn);
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Layout tree
//
// Given an ordered list of panel keys and the per-gap orientations
// between them, produce a binary/N-ary split tree. The renderer maps
// the tree to nested flex containers — horizontal splits → flex-row,
// vertical splits → flex-col.
//
// Algorithm: outer split is vertical iff any gap is vertical; otherwise
// outer is horizontal (single N-ary split with all leaves). For vertical
// outer, slice the panel list at every vertical gap and recurse on each
// section with the section's local horizontal-only gaps.
//
// Examples (4 panels):
//   gaps [h,v,h]  → outer v: [(A|B), (C|D)]  → 2x2 grid
//   gaps [h,h,v]  → outer v: [(A|B|C), D]    → row of 3 with one below
//   gaps [v,h,v]  → outer v: [A, (B|C), D]   → 3 rows, middle is two side-by-side
// ─────────────────────────────────────────────────────────────────────────

function buildLayoutTree(panels: string[], gaps: GapOrientation[]): LayoutTree | null {
  if (panels.length === 0) return null;
  if (panels.length === 1) return { kind: "leaf", panelKey: panels[0] };

  const hasVertical = gaps.some((g) => g === "vertical");
  if (!hasVertical) {
    return {
      kind: "split",
      orientation: "horizontal",
      children: panels.map((k) => ({ kind: "leaf" as const, panelKey: k }))
    };
  }

  const sections: { panels: string[]; gaps: GapOrientation[] }[] = [];
  let cur: { panels: string[]; gaps: GapOrientation[] } = { panels: [panels[0]], gaps: [] };
  for (let i = 0; i < gaps.length; i++) {
    if (gaps[i] === "vertical") {
      sections.push(cur);
      cur = { panels: [panels[i + 1]], gaps: [] };
    } else {
      cur.panels.push(panels[i + 1]);
      cur.gaps.push(gaps[i]);
    }
  }
  sections.push(cur);

  const children = sections
    .map((s) => buildLayoutTree(s.panels, s.gaps))
    .filter((c): c is LayoutTree => c !== null);

  return { kind: "split", orientation: "vertical", children };
}

function computeHorizontalUnits(tree: LayoutTree | null): number {
  if (!tree) return 0;
  if (tree.kind === "leaf") return 1;
  if (tree.orientation === "horizontal") {
    return tree.children.reduce((sum, c) => sum + computeHorizontalUnits(c), 0);
  }
  // vertical split: width follows the widest row
  return tree.children.reduce((max, c) => Math.max(max, computeHorizontalUnits(c)), 0);
}

// ─────────────────────────────────────────────────────────────────────────
// Cell + GapToggleButton + LayoutNode renderer
// ─────────────────────────────────────────────────────────────────────────

function LayoutCell({ panelKey }: { panelKey: string }) {
  // Stable callback ref — React invokes synchronously on attach/detach,
  // so cellNodes stays exactly in sync without a useEffect race.
  const cellRef = React.useCallback(
    (node: HTMLDivElement | null) => registerCellNode(panelKey, node),
    [panelKey]
  );
  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1"
      data-panel-cell={panelKey}
      ref={cellRef}
    />
  );
}

function GapToggleButton({
  gapIndex,
  orientation,
  axis
}: {
  gapIndex: number;
  orientation: GapOrientation;
  axis: GapOrientation;
}) {
  // The button toggles ONE gap between horizontal and vertical. Its
  // visual position is at the midpoint of the boundary between two
  // adjacent panels along the parent split's axis.
  const next: GapOrientation = orientation === "horizontal" ? "vertical" : "horizontal";
  return (
    <button
      aria-label={`Switch panel boundary to ${next}`}
      className={cn(
        "pointer-events-auto absolute z-[101] inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/80 bg-surface text-[10px] font-semibold text-text-muted shadow-soft transition-colors hover:bg-surface-muted hover:text-text",
        axis === "horizontal"
          ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          : "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      )}
      onClick={() => setGapOrientation(gapIndex, next)}
      title={`Switch this gap to ${next}`}
      type="button"
    >
      {orientation === "horizontal" ? "⇅" : "⇄"}
    </button>
  );
}

type LayoutNodeProps = {
  tree: LayoutTree;
  // The flat ordered panel-key list at the top level so we can map each
  // split-child boundary back to its absolute gap index in `gapOrientations`.
  panelKeys: string[];
};

function LayoutNode({ tree, panelKeys }: LayoutNodeProps) {
  if (tree.kind === "leaf") {
    return <LayoutCell panelKey={tree.panelKey} />;
  }

  const flexDir = tree.orientation === "horizontal" ? "flex-row" : "flex-col";
  return (
    <div className={cn("relative flex min-h-0 min-w-0 flex-1 gap-[var(--layout-gap)]", flexDir)}>
      {tree.children.map((child, idx) => (
        <React.Fragment key={`${tree.orientation}-${idx}`}>
          <LayoutNode panelKeys={panelKeys} tree={child} />
          {idx < tree.children.length - 1
            ? renderGapToggleForBoundary(tree, idx, panelKeys)
            : null}
        </React.Fragment>
      ))}
    </div>
  );
}

// Find the absolute gap index in `gapOrientations` that corresponds to
// the boundary between tree.children[idx] and tree.children[idx+1].
// The boundary is the last leaf of children[idx] joined to the first
// leaf of children[idx+1] — its index in the flat panel list is the
// gap index.
function renderGapToggleForBoundary(
  parent: Extract<LayoutTree, { kind: "split" }>,
  idx: number,
  panelKeys: string[]
) {
  const lastLeafKey = lastLeaf(parent.children[idx]);
  const lastLeafIdx = panelKeys.indexOf(lastLeafKey);
  if (lastLeafIdx < 0) return null;
  const gapIndex = lastLeafIdx; // gap N joins panel N to panel N+1
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute z-[101]",
        parent.orientation === "horizontal" ? "top-0 bottom-0" : "left-0 right-0"
      )}
      style={
        parent.orientation === "horizontal"
          ? { left: `calc(${((idx + 1) / parent.children.length) * 100}% - var(--layout-gap) / 2)`, width: "var(--layout-gap)" }
          : { top: `calc(${((idx + 1) / parent.children.length) * 100}% - var(--layout-gap) / 2)`, height: "var(--layout-gap)" }
      }
    >
      <GapToggleButton
        axis={parent.orientation}
        gapIndex={gapIndex}
        orientation={parent.orientation}
      />
    </span>
  );
}

function lastLeaf(tree: LayoutTree): string {
  if (tree.kind === "leaf") return tree.panelKey;
  return lastLeaf(tree.children[tree.children.length - 1]);
}

// ─────────────────────────────────────────────────────────────────────────
// PanelContainer — the body-level dock. Renders a fixed-positioned
// container whose top edge aligns with `.app__body`'s top, whose width
// follows the layout tree's horizontal-units * unitWidth, and whose
// inner tree provides cell portal targets for individual Panels.
// ─────────────────────────────────────────────────────────────────────────

export function PanelContainer() {
  const [panelKeys, setPanelKeys] = React.useState<string[]>([]);
  const [gapOrients, setGapOrients] = React.useState<GapOrientation[]>([]);
  const [unitWidth, setUnitWidth] = React.useState<number>(UNIT_PANEL_WIDTH);
  const [panelTop, setPanelTop] = React.useState<number>(0);
  const [layoutGap, setLayoutGap] = React.useState<number>(16);
  const [resizing, setResizing] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  // Subscribe to dock-order + gap-orientation changes.
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

  // Hydrate container state (unitWidth) and subscribe to changes.
  React.useEffect(() => {
    hydrateContainerState();
    setUnitWidthState(containerState.unitWidth);
    const unsub = subscribeContainerState(() => setUnitWidthState(containerState.unitWidth));
    return unsub;
    function setUnitWidthState(w: number) {
      setUnitWidth(w);
    }
  }, []);

  // Measure --layout-gap from CSS root.
  React.useEffect(() => {
    const measureGap = () => {
      const rootStyles = window.getComputedStyle(document.documentElement);
      const g = Number.parseFloat(rootStyles.getPropertyValue("--layout-gap")) || 16;
      // --layout-gap is in rem. Convert to px.
      const fs = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
      const isRem = rootStyles.getPropertyValue("--layout-gap").trim().endsWith("rem");
      setLayoutGap(isRem ? Math.round(g * fs) : Math.round(g));
    };
    measureGap();
    window.addEventListener("resize", measureGap);
    return () => window.removeEventListener("resize", measureGap);
  }, []);

  // Measure the panel-top edge (aligned with .app__body's top, with
  // PrimaryHeader fallback when no AppShell is present).
  React.useEffect(() => {
    const measure = () => {
      const body = document.querySelector(".app__body") as HTMLElement | null;
      let next = 0;
      if (body) {
        next = Math.max(0, Math.round(body.getBoundingClientRect().top));
      } else {
        const header = document.getElementById(PRIMARY_HEADER_ID);
        const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
        next = Math.max(0, Math.round(headerBottom + layoutGap));
      }
      setPanelTop(next);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      const body = document.querySelector(".app__body");
      if (body) observer.observe(body);
      const header = document.getElementById(PRIMARY_HEADER_ID);
      if (header) observer.observe(header);
    }
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, [layoutGap]);

  const tree = React.useMemo(() => buildLayoutTree(panelKeys, gapOrients), [panelKeys, gapOrients]);
  const horizontalUnits = computeHorizontalUnits(tree);

  // Update --panel-active-width on body so .app__body padding-right
  // reserves the full container width (not just one panel).
  React.useEffect(() => {
    if (horizontalUnits === 0) {
      document.body.style.removeProperty("--panel-active-width");
      return;
    }
    const totalWidth = horizontalUnits * unitWidth + Math.max(0, horizontalUnits - 1) * layoutGap;
    document.body.style.setProperty("--panel-active-width", `${totalWidth}px`);
    return () => {
      document.body.style.removeProperty("--panel-active-width");
    };
  }, [horizontalUnits, unitWidth, layoutGap]);

  // Resize handle — drag the LEFT edge of the container to widen/narrow
  // the unit width. Persisted to localStorage by setUnitWidth.
  const onResizeStart = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (horizontalUnits === 0) return;
      event.preventDefault();
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
      setResizing(true);
      document.body.classList.add("panel-resizing");
      const startX = event.clientX;
      const startUnit = containerState.unitWidth;
      const onMove = (e: PointerEvent) => {
        const delta = startX - e.clientX; // dragging left widens
        const desired = startUnit + delta / Math.max(1, horizontalUnits);
        setUnitWidth(desired);
      };
      const onEnd = (e: PointerEvent) => {
        try {
          (event.target as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          // pointer already released
        }
        setResizing(false);
        document.body.classList.remove("panel-resizing");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onEnd);
        window.removeEventListener("pointercancel", onEnd);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onEnd);
      window.addEventListener("pointercancel", onEnd);
    },
    [horizontalUnits]
  );

  if (!tree || horizontalUnits === 0) {
    // No panels open — still render the dock element so legacy callers
    // (popup wizards using getElementById("panel-dock")) keep working.
    return <div id={ROOT_DOCK_ID} style={{ display: "none" }} />;
  }

  const totalWidth = horizontalUnits * unitWidth + Math.max(0, horizontalUnits - 1) * layoutGap;

  return (
    <div
      className="pointer-events-none fixed z-[100]"
      id={ROOT_DOCK_ID}
      ref={containerRef}
      style={{
        top: `${panelTop}px`,
        right: `${layoutGap}px`,
        bottom: `${layoutGap}px`,
        width: `min(calc(100vw - ${layoutGap * 2}px), ${totalWidth}px)`
      }}
    >
      <div
        aria-label="Resize panel container"
        className="panel-resize-handle pointer-events-auto"
        onPointerDown={onResizeStart}
        role="separator"
        style={{ left: -4 }}
      />
      <div
        className={cn(
          "pointer-events-auto flex h-full w-full min-w-0 gap-[var(--layout-gap)]",
          resizing ? "select-none" : null
        )}
      >
        <LayoutNode panelKeys={panelKeys} tree={tree} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Panel — single side-panel surface. Self-portals into a cell of the
// PanelContainer dock when used in normal app flow, falls back to a
// fixed-position attached panel inside popup-editor contexts.
// ─────────────────────────────────────────────────────────────────────────

export type PanelProps = {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  headerShowAvatar?: boolean;
  headerAvatarUrl?: string | null;
  headerAvatarAlt?: string;
  /** Custom avatar element rendered in the header (e.g. EditableAvatar). */
  headerAvatarSlot?: React.ReactNode;
  headerTopAction?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  panelClassName?: string;
  contentClassName?: string;
  panelStyle?: React.CSSProperties;
  pushMode?: "content" | "app";
  globalPanel?: boolean;
  /**
   * Stable identity for dock ordering. Auto-generated from React.useId
   * if omitted, but a stable user-supplied key is recommended so the
   * panel keeps its slot across re-mounts.
   */
  panelKey?: string;
};

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
  children,
  footer,
  panelClassName,
  contentClassName,
  panelStyle,
  pushMode = "content",
  globalPanel = false,
  panelKey
}: PanelProps) {
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const footerRef = React.useRef<HTMLDivElement | null>(null);
  const onCloseRef = React.useRef(onClose);
  const [mounted, setMounted] = React.useState(false);
  const [portalTarget, setPortalTarget] = React.useState<HTMLElement | null>(null);
  const [, bumpOrder] = React.useReducer((n: number) => n + 1, 0);
  const [, bumpCells] = React.useReducer((n: number) => n + 1, 0);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isDropTarget, setIsDropTarget] = React.useState(false);
  const generatedKey = React.useId();
  const orderKey = React.useMemo(() => panelKey ?? generatedKey, [panelKey, generatedKey]);

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  React.useEffect(() => subscribeOrder(bumpOrder), []);
  React.useEffect(() => subscribeCells(bumpCells), []);

  // Resolve portal target on each render that depends on its inputs.
  // Three contexts:
  //   1. Popup editor: dock into a per-popup container.
  //   2. Global panel: portal into the top-level dock element directly.
  //   3. Standard dock-order panel: portal into the cell registered for
  //      this panelKey by PanelContainer's LayoutCell. Falls back to the
  //      root dock if the cell hasn't mounted yet.
  React.useEffect(() => {
    if (!mounted) return;
    const popupDock = document.getElementById(POPUP_PANEL_DOCK_ID);
    if (popupDock) {
      setPortalTarget(popupDock);
      return;
    }
    if (globalPanel) {
      setPortalTarget(document.getElementById(ROOT_DOCK_ID) ?? document.body);
      return;
    }
    const cell = cellNodes.get(orderKey);
    setPortalTarget(cell ?? document.getElementById(ROOT_DOCK_ID) ?? document.body);
  }, [mounted, open, orderKey, globalPanel]);

  // Re-resolve on the panel-dock-changed event so already-open panels
  // can hop into a popup-panel-dock that appeared after they mounted.
  React.useEffect(() => {
    if (!mounted) return;
    const onDockChanged = () => {
      const popupDock = document.getElementById(POPUP_PANEL_DOCK_ID);
      if (popupDock) {
        setPortalTarget(popupDock);
        return;
      }
      const cell = cellNodes.get(orderKey);
      setPortalTarget(cell ?? document.getElementById(ROOT_DOCK_ID) ?? document.body);
    };
    window.addEventListener("panel-dock-changed", onDockChanged);
    return () => window.removeEventListener("panel-dock-changed", onDockChanged);
  }, [mounted, orderKey]);

  const isPopupContext = portalTarget?.getAttribute("data-panel-context") === "popup";
  const participatesInDockOrder = open && mounted && !isPopupContext && !globalPanel;

  // Register self in the dock order while open. Cell registration
  // happens in PanelContainer's LayoutCell — this panel just declares
  // it's present and gets a slot.
  React.useEffect(() => {
    if (!participatesInDockOrder) return;
    registerPanelOrder(orderKey);
    return () => unregisterPanelOrder(orderKey);
  }, [orderKey, participatesInDockOrder]);

  const ready = open && mounted && Boolean(portalTarget);

  React.useLayoutEffect(() => {
    if (!ready) return;

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

    if (isPopupContext) {
      const popupDock = portalTarget as HTMLElement;
      const popupRoot = popupDock.closest("[data-popup-editor-root='true']") as HTMLElement | null;

      const syncPopupPanelOffset = () => {
        if (!popupRoot) return;
        const rootStyles = window.getComputedStyle(document.documentElement);
        const layoutGap = Number.parseFloat(rootStyles.getPropertyValue("--layout-gap")) || 0;
        const viewportAllowance = Math.max(0, popupRoot.clientWidth - layoutGap * 2);
        const panelWidth = Math.min(viewportAllowance, UNIT_PANEL_WIDTH);
        popupRoot.style.setProperty("--popup-panel-active-width", `${Math.round(panelWidth)}px`);
        popupRoot.style.setProperty("--popup-panel-gap", `${Math.round(layoutGap)}px`);
      };

      const popupCount = Number(portalTarget.getAttribute(POPUP_PANEL_COUNT_ATTRIBUTE) ?? "0");
      portalTarget.setAttribute(POPUP_PANEL_COUNT_ATTRIBUTE, String(popupCount + 1));
      syncPopupPanelOffset();
      const rafId = window.requestAnimationFrame(syncPopupPanelOffset);
      window.addEventListener("resize", syncPopupPanelOffset);

      return () => {
        window.cancelAnimationFrame(rafId);
        window.removeEventListener("resize", syncPopupPanelOffset);
        const nextCount = Math.max(0, Number(portalTarget.getAttribute(POPUP_PANEL_COUNT_ATTRIBUTE) ?? "1") - 1);
        if (nextCount === 0) {
          portalTarget.removeAttribute(POPUP_PANEL_COUNT_ATTRIBUTE);
          popupRoot?.style.removeProperty("--popup-panel-active-width");
          popupRoot?.style.removeProperty("--popup-panel-gap");
        } else {
          portalTarget.setAttribute(POPUP_PANEL_COUNT_ATTRIBUTE, String(nextCount));
          syncPopupPanelOffset();
        }
        document.removeEventListener("keydown", onKeyDown);
      };
    }

    // Standard dock-order or globalPanel: keep body classes/counts so
    // .app__body padding-right reservation activates.
    const panelCount = Number(document.body.getAttribute(PANEL_COUNT_ATTRIBUTE) ?? "0");
    const appPanelCount = Number(document.body.getAttribute(APP_PANEL_COUNT_ATTRIBUTE) ?? "0");
    document.body.setAttribute(PANEL_COUNT_ATTRIBUTE, String(panelCount + 1));
    document.body.classList.add("panel-open-content");
    if (pushMode === "app") {
      document.body.setAttribute(APP_PANEL_COUNT_ATTRIBUTE, String(appPanelCount + 1));
      document.body.classList.add("panel-open-app");
    }

    return () => {
      const nextCount = Math.max(0, Number(document.body.getAttribute(PANEL_COUNT_ATTRIBUTE) ?? "1") - 1);
      const nextAppCount = Math.max(
        0,
        Number(document.body.getAttribute(APP_PANEL_COUNT_ATTRIBUTE) ?? (pushMode === "app" ? "1" : "0")) - (pushMode === "app" ? 1 : 0)
      );
      if (nextCount === 0) {
        document.body.classList.remove("panel-open-content");
        document.body.removeAttribute(PANEL_COUNT_ATTRIBUTE);
      } else {
        document.body.setAttribute(PANEL_COUNT_ATTRIBUTE, String(nextCount));
      }
      if (nextAppCount === 0) {
        document.body.classList.remove("panel-open-app");
        document.body.removeAttribute(APP_PANEL_COUNT_ATTRIBUTE);
      } else {
        document.body.setAttribute(APP_PANEL_COUNT_ATTRIBUTE, String(nextAppCount));
      }
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [globalPanel, isPopupContext, pushMode, ready, portalTarget]);

  const onHeaderDragStart = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!participatesInDockOrder) return;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(PANEL_DRAG_MIME, orderKey);
      // Some browsers require any data type on dataTransfer in addition
      // to a custom MIME for drag image to render correctly.
      event.dataTransfer.setData("text/plain", orderKey);
      setIsDragging(true);
    },
    [orderKey, participatesInDockOrder]
  );

  const onHeaderDragEnd = React.useCallback(() => {
    setIsDragging(false);
  }, []);

  const onAsideDragOver = React.useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (!participatesInDockOrder) return;
      if (!Array.from(event.dataTransfer.types).includes(PANEL_DRAG_MIME)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setIsDropTarget(true);
    },
    [participatesInDockOrder]
  );

  const onAsideDragLeave = React.useCallback(() => {
    setIsDropTarget(false);
  }, []);

  const onAsideDrop = React.useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (!participatesInDockOrder) return;
      const sourceKey = event.dataTransfer.getData(PANEL_DRAG_MIME);
      if (sourceKey && sourceKey !== orderKey) {
        event.preventDefault();
        swapPanelOrder(sourceKey, orderKey);
      }
      setIsDropTarget(false);
    },
    [orderKey, participatesInDockOrder]
  );

  if (!mounted || !open || !portalTarget) return null;

  // In dock-order mode the cell sets its own size via flex; the panel
  // fills 100% of the cell. In popup/global mode the panel positions
  // itself via fixed coordinates.
  const dockStyle: React.CSSProperties = participatesInDockOrder
    ? { position: "absolute", inset: 0 }
    : isPopupContext
      ? { bottom: 0, right: 0, top: 0, maxWidth: "100%", width: "100%" }
      : globalPanel
        ? { bottom: 0, right: 0, top: 0, maxWidth: "100vw", width: `min(100vw, ${UNIT_PANEL_WIDTH}px)` }
        : {
            bottom: "var(--layout-gap)",
            right: "var(--layout-gap)",
            top: "var(--panel-top, 0px)",
            maxWidth: `min(calc(100vw - (var(--layout-gap) * 2)), ${UNIT_PANEL_WIDTH}px)`,
            width: `min(calc(100vw - (var(--layout-gap) * 2)), ${UNIT_PANEL_WIDTH}px)`
          };

  return createPortal(
    <aside
      aria-label={typeof title === "string" ? title : undefined}
      className={cn(
        "app-panel pointer-events-auto flex min-w-0 shrink-0 flex-col overflow-hidden bg-surface shadow-floating",
        participatesInDockOrder
          ? "rounded-card border"
          : isPopupContext
            ? "absolute z-[1100] rounded-none border-y-0 border-r-0 border-l"
            : "fixed z-[100] rounded-card border",
        isDragging ? "opacity-60" : null,
        isDropTarget ? "ring-2 ring-accent ring-offset-2 ring-offset-canvas" : null,
        panelClassName
      )}
      onDragLeave={onAsideDragLeave}
      onDragOver={onAsideDragOver}
      onDrop={onAsideDrop}
      ref={panelRef}
      role="complementary"
      style={{ ...panelStyle, ...dockStyle }}
    >
      {participatesInDockOrder ? (
        <div
          aria-label="Drag to swap panel position"
          className="cursor-grab active:cursor-grabbing"
          draggable
          onDragEnd={onHeaderDragEnd}
          onDragStart={onHeaderDragStart}
        >
          <SurfaceHeader
            avatarAlt={headerAvatarAlt}
            avatarSlot={headerAvatarSlot}
            avatarUrl={headerAvatarUrl}
            showAvatar={headerShowAvatar}
            subtitle={subtitle}
            title={title}
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
      {footer ? <SurfaceFooter footerRef={footerRef}>{footer}</SurfaceFooter> : null}
    </aside>,
    portalTarget
  );
}

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
