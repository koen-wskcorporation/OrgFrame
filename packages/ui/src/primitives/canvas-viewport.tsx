"use client";

import { cn } from "./utils";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type PropsWithChildren
} from "react";

type CanvasView = {
  x: number;
  y: number;
  scale: number;
};

export type CanvasViewportHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  fitToView: (options?: { padding?: number; viewportOffsetX?: number; viewportOffsetY?: number; animated?: boolean }) => void;
  fitToContentSelector: (
    selector: string,
    options?: { padding?: number; viewportOffsetX?: number; viewportOffsetY?: number; animated?: boolean }
  ) => void;
  fitToBounds: (
    bounds: { x: number; y: number; width: number; height: number },
    options?: { padding?: number; viewportOffsetX?: number; viewportOffsetY?: number; animated?: boolean }
  ) => void;
  fitToElement: (element: HTMLElement, options?: { padding?: number; viewportOffsetX?: number; viewportOffsetY?: number; animated?: boolean }) => void;
  focusElement: (element: HTMLElement, options?: { targetScale?: number }) => void;
  shiftBy: (deltaX: number, deltaY: number, options?: { animated?: boolean }) => void;
};

type CanvasViewportProps = PropsWithChildren<{
  className?: string;
  viewportClassName?: string;
  viewportStyle?: CSSProperties;
  contentClassName?: string;
  minScale?: number;
  maxScale?: number;
  zoomStep?: number;
  fitPadding?: number;
  storageKey?: string;
  dragInProgress?: boolean;
  interactive?: boolean;
  onViewChange?: (view: CanvasView) => void;
  safeAreaInsets?: { left?: number; right?: number; top?: number; bottom?: number };
  gridSize?: number;
  gridColor?: string;
}>;

const GRID_WORLD_RADIUS = 100000;
const GRID_LINE_WIDTH = 1;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export const CanvasViewport = forwardRef<CanvasViewportHandle, CanvasViewportProps>(function CanvasViewport(
  {
    children,
    className,
    viewportClassName,
    viewportStyle,
    contentClassName,
    minScale = 0.5,
    maxScale = 2,
    zoomStep = 0.14,
    fitPadding = 48,
    storageKey,
    dragInProgress = false,
    interactive = true,
    onViewChange,
    safeAreaInsets,
    gridSize,
    gridColor = "hsl(var(--border) / 0.55)"
  },
  ref
) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const transformRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const viewportSizeRef = useRef<{ width: number; height: number } | null>(null);
  const viewportInsetsRef = useRef<{ left: number; right: number; top: number; bottom: number } | null>(null);
  const safeAreaRef = useRef({ left: 0, right: 0, top: 0, bottom: 0 });
  const viewRef = useRef<CanvasView>({ x: 0, y: 0, scale: 1 });
  const panSessionRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const notifyRafRef = useRef<number | null>(null);
  const onViewChangeRef = useRef<CanvasViewportProps["onViewChange"]>(onViewChange);

  const normalizeView = useCallback((view: CanvasView): CanvasView => {
    // Keep viewport translation on whole CSS pixels so grid lines do not land on half-cells.
    const x = Math.round(view.x);
    const y = Math.round(view.y);
    // Keep scale stable but precise enough for smooth zoom.
    const scale = Math.round(view.scale * 1000) / 1000;
    return { x, y, scale };
  }, []);

  const scaleBounds = useMemo(
    () => ({
      min: Math.min(minScale, maxScale),
      max: Math.max(minScale, maxScale)
    }),
    [maxScale, minScale]
  );

  useEffect(() => {
    onViewChangeRef.current = onViewChange;
  }, [onViewChange]);

  useEffect(() => {
    safeAreaRef.current = {
      left: Math.max(0, safeAreaInsets?.left ?? 0),
      right: Math.max(0, safeAreaInsets?.right ?? 0),
      top: Math.max(0, safeAreaInsets?.top ?? 0),
      bottom: Math.max(0, safeAreaInsets?.bottom ?? 0)
    };
  }, [safeAreaInsets?.bottom, safeAreaInsets?.left, safeAreaInsets?.right, safeAreaInsets?.top]);

  const getVisibleViewport = useCallback(
    (viewportRect: DOMRect) => {
      const insets = safeAreaRef.current;
      const width = Math.max(1, viewportRect.width - insets.left - insets.right);
      const height = Math.max(1, viewportRect.height - insets.top - insets.bottom);
      return {
        insetLeft: insets.left,
        insetTop: insets.top,
        width,
        height
      };
    },
    []
  );

  const applyView = useCallback(
    (next: CanvasView, options?: { skipPersist?: boolean; skipNotify?: boolean }) => {
      const transformNode = transformRef.current;
      if (!transformNode) {
        return;
      }

      const normalized = normalizeView(next);
      viewRef.current = normalized;
      // Use 2D transforms to keep text/vector content sharp while zooming.
      // Persistent 3D compositing can rasterize the layer and introduce pixelation on zoom-in.
      transformNode.style.transform = `translate(${normalized.x}px, ${normalized.y}px) scale(${normalized.scale})`;

      if (storageKey && !options?.skipPersist) {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(normalized));
        } catch {
          // Ignore storage failures in private browsing or restricted environments.
        }
      }

      if (notifyRafRef.current !== null) {
        window.cancelAnimationFrame(notifyRafRef.current);
      }

      notifyRafRef.current = window.requestAnimationFrame(() => {
        notifyRafRef.current = null;
        if (!options?.skipNotify) {
          onViewChangeRef.current?.(normalized);
        }
      });
    },
    [normalizeView, storageKey]
  );

  const animateTo = useCallback(
    (target: CanvasView, durationMs = 170) => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }

      const start = viewRef.current;
      const startedAt = performance.now();

      const tick = (now: number) => {
        const elapsed = now - startedAt;
        const progress = clamp(elapsed / durationMs, 0, 1);
        const eased = 1 - (1 - progress) ** 3;
        applyView(
          {
            x: start.x + (target.x - start.x) * eased,
            y: start.y + (target.y - start.y) * eased,
            scale: start.scale + (target.scale - start.scale) * eased
          },
          { skipPersist: progress < 1 }
        );

        if (progress >= 1) {
          rafRef.current = null;
          applyView(target);
          return;
        }

        rafRef.current = window.requestAnimationFrame(tick);
      };

      rafRef.current = window.requestAnimationFrame(tick);
    },
    [applyView]
  );

  const moveToView = useCallback(
    (target: CanvasView, options?: { animated?: boolean }) => {
      if (options?.animated === false) {
        applyView(target);
        return;
      }

      animateTo(target);
    },
    [animateTo, applyView]
  );

  const fitToView = useCallback((options?: { padding?: number; viewportOffsetX?: number; viewportOffsetY?: number; animated?: boolean }) => {
    const viewportNode = viewportRef.current;
    const contentNode = contentRef.current;
    if (!viewportNode || !contentNode) {
      return;
    }

    const viewportRect = viewportNode.getBoundingClientRect();
    const contentRect = contentNode.getBoundingClientRect();
    const current = viewRef.current;
    const contentWidth = contentRect.width / current.scale;
    const contentHeight = contentRect.height / current.scale;
    if (contentWidth <= 0 || contentHeight <= 0 || viewportRect.width <= 0 || viewportRect.height <= 0) {
      return;
    }

    const padding = options?.padding ?? fitPadding;
    const viewportOffsetX = options?.viewportOffsetX ?? 0;
    const viewportOffsetY = options?.viewportOffsetY ?? 0;
    const visible = getVisibleViewport(viewportRect);
    const innerWidth = Math.max(32, visible.width - padding * 2);
    const innerHeight = Math.max(32, visible.height - padding * 2);
    const targetScale = clamp(Math.min(innerWidth / contentWidth, innerHeight / contentHeight), scaleBounds.min, scaleBounds.max);
    const x = visible.insetLeft + (visible.width - contentWidth * targetScale) / 2 + viewportOffsetX;
    const y = visible.insetTop + (visible.height - contentHeight * targetScale) / 2 + viewportOffsetY;
    moveToView({ x, y, scale: targetScale }, { animated: options?.animated });
  }, [fitPadding, getVisibleViewport, moveToView, scaleBounds.max, scaleBounds.min]);

  const resetView = useCallback(() => {
    animateTo({ x: 0, y: 0, scale: 1 });
  }, [animateTo]);

  const zoomAtPoint = useCallback(
    (nextScale: number, pointX: number, pointY: number) => {
      const viewportNode = viewportRef.current;
      if (!viewportNode) {
        return;
      }

      const current = viewRef.current;
      const clampedScale = clamp(nextScale, scaleBounds.min, scaleBounds.max);
      if (Math.abs(clampedScale - current.scale) < 0.0001) {
        return;
      }

      const worldX = (pointX - current.x) / current.scale;
      const worldY = (pointY - current.y) / current.scale;
      const x = pointX - worldX * clampedScale;
      const y = pointY - worldY * clampedScale;
      applyView({ x, y, scale: clampedScale });
    },
    [applyView, scaleBounds.max, scaleBounds.min]
  );

  const focusElement = useCallback(
    (element: HTMLElement, options?: { targetScale?: number }) => {
      const viewportNode = viewportRef.current;
      const contentNode = contentRef.current;
      if (!viewportNode || !contentNode) {
        return;
      }

      const viewportRect = viewportNode.getBoundingClientRect();
      const contentRect = contentNode.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const current = viewRef.current;
      const elementX = (elementRect.left - contentRect.left) / current.scale;
      const elementY = (elementRect.top - contentRect.top) / current.scale;
      const elementWidth = elementRect.width / current.scale;
      const elementHeight = elementRect.height / current.scale;

      const targetScale = clamp(options?.targetScale ?? Math.max(current.scale, 1), scaleBounds.min, scaleBounds.max);
      const visible = getVisibleViewport(viewportRect);
      const x = visible.insetLeft + visible.width / 2 - (elementX + elementWidth / 2) * targetScale;
      const y = visible.insetTop + visible.height / 2 - (elementY + elementHeight / 2) * targetScale;
      animateTo({ x, y, scale: targetScale });
    },
    [animateTo, getVisibleViewport, scaleBounds.max, scaleBounds.min]
  );

  const fitToElement = useCallback(
    (element: HTMLElement, options?: { padding?: number; viewportOffsetX?: number; viewportOffsetY?: number; animated?: boolean }) => {
      const viewportNode = viewportRef.current;
      const contentNode = contentRef.current;
      if (!viewportNode || !contentNode) {
        return;
      }

      const viewportRect = viewportNode.getBoundingClientRect();
      const contentRect = contentNode.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const current = viewRef.current;
      const elementX = (elementRect.left - contentRect.left) / current.scale;
      const elementY = (elementRect.top - contentRect.top) / current.scale;
      const elementWidth = elementRect.width / current.scale;
      const elementHeight = elementRect.height / current.scale;
      if (elementWidth <= 0 || elementHeight <= 0) {
        return;
      }

      const padding = options?.padding ?? fitPadding;
      const viewportOffsetX = options?.viewportOffsetX ?? 0;
      const viewportOffsetY = options?.viewportOffsetY ?? 0;
      const visible = getVisibleViewport(viewportRect);
      const innerWidth = Math.max(32, visible.width - padding * 2);
      const innerHeight = Math.max(32, visible.height - padding * 2);
      const targetScale = clamp(Math.min(innerWidth / elementWidth, innerHeight / elementHeight), scaleBounds.min, scaleBounds.max);
      const x = visible.insetLeft + visible.width / 2 + viewportOffsetX - (elementX + elementWidth / 2) * targetScale;
      const y = visible.insetTop + visible.height / 2 + viewportOffsetY - (elementY + elementHeight / 2) * targetScale;
      moveToView({ x, y, scale: targetScale }, { animated: options?.animated });
    },
    [fitPadding, getVisibleViewport, moveToView, scaleBounds.max, scaleBounds.min]
  );

  const fitToBounds = useCallback(
    (
      bounds: { x: number; y: number; width: number; height: number },
      options?: { padding?: number; viewportOffsetX?: number; viewportOffsetY?: number; animated?: boolean }
    ) => {
      const viewportNode = viewportRef.current;
      if (!viewportNode) {
        return;
      }

      const viewportRect = viewportNode.getBoundingClientRect();
      if (viewportRect.width <= 0 || viewportRect.height <= 0 || bounds.width <= 0 || bounds.height <= 0) {
        return;
      }

      const padding = options?.padding ?? fitPadding;
      const viewportOffsetX = options?.viewportOffsetX ?? 0;
      const viewportOffsetY = options?.viewportOffsetY ?? 0;
      const visible = getVisibleViewport(viewportRect);
      const innerWidth = Math.max(32, visible.width - padding * 2);
      const innerHeight = Math.max(32, visible.height - padding * 2);
      const targetScale = clamp(Math.min(innerWidth / bounds.width, innerHeight / bounds.height), scaleBounds.min, scaleBounds.max);
      const x = visible.insetLeft + visible.width / 2 + viewportOffsetX - (bounds.x + bounds.width / 2) * targetScale;
      const y = visible.insetTop + visible.height / 2 + viewportOffsetY - (bounds.y + bounds.height / 2) * targetScale;
      moveToView({ x, y, scale: targetScale }, { animated: options?.animated });
    },
    [fitPadding, getVisibleViewport, moveToView, scaleBounds.max, scaleBounds.min]
  );

  const fitToContentSelector = useCallback(
    (selector: string, options?: { padding?: number; viewportOffsetX?: number; viewportOffsetY?: number; animated?: boolean }) => {
      const contentNode = contentRef.current;
      if (!contentNode) {
        return;
      }

      const elements = Array.from(contentNode.querySelectorAll<HTMLElement>(selector));
      if (elements.length === 0) {
        fitToView(options);
        return;
      }

      const contentRect = contentNode.getBoundingClientRect();
      const currentScale = viewRef.current.scale || 1;
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;

      elements.forEach((element) => {
        const rect = element.getBoundingClientRect();
        const x = (rect.left - contentRect.left) / currentScale;
        const y = (rect.top - contentRect.top) / currentScale;
        const width = rect.width / currentScale;
        const height = rect.height / currentScale;
        if (width <= 0 || height <= 0) {
          return;
        }
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + width);
        maxY = Math.max(maxY, y + height);
      });

      if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
        fitToView(options);
        return;
      }

      fitToBounds(
        {
          x: minX,
          y: minY,
          width: Math.max(1, maxX - minX),
          height: Math.max(1, maxY - minY)
        },
        options
      );
    },
    [fitToBounds, fitToView]
  );

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => {
        const viewportNode = viewportRef.current;
        if (!viewportNode) {
          return;
        }

        const rect = viewportNode.getBoundingClientRect();
        const next = viewRef.current.scale * (1 + zoomStep);
        zoomAtPoint(next, rect.width / 2, rect.height / 2);
      },
      zoomOut: () => {
        const viewportNode = viewportRef.current;
        if (!viewportNode) {
          return;
        }

        const rect = viewportNode.getBoundingClientRect();
        const next = viewRef.current.scale * (1 - zoomStep);
        zoomAtPoint(next, rect.width / 2, rect.height / 2);
      },
      resetView,
      fitToView,
      fitToContentSelector,
      fitToBounds,
      fitToElement,
      focusElement,
      shiftBy: (deltaX: number, deltaY: number, options?: { animated?: boolean }) => {
        if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
          return;
        }

        const current = viewRef.current;
        const target: CanvasView = {
          x: current.x + deltaX,
          y: current.y + deltaY,
          scale: current.scale
        };

        if (options?.animated) {
          animateTo(target);
          return;
        }

        applyView(target);
      }
    }),
    [animateTo, applyView, fitToBounds, fitToContentSelector, fitToElement, fitToView, focusElement, resetView, zoomAtPoint, zoomStep]
  );

  useLayoutEffect(() => {
    if (!storageKey) {
      return;
    }

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as Partial<CanvasView> | null;
      if (!parsed || !isFiniteNumber(parsed.x) || !isFiniteNumber(parsed.y) || !isFiniteNumber(parsed.scale)) {
        return;
      }

      applyView({
        x: parsed.x,
        y: parsed.y,
        scale: clamp(parsed.scale, scaleBounds.min, scaleBounds.max)
      });
    } catch {
      // Ignore malformed persisted state.
    }
  }, [scaleBounds.max, scaleBounds.min, storageKey, applyView]);

  useLayoutEffect(() => {
    applyView(viewRef.current, { skipPersist: true });

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }

      if (notifyRafRef.current !== null) {
        window.cancelAnimationFrame(notifyRafRef.current);
      }
    };
  }, [applyView]);

  useEffect(() => {
    const viewportNode = viewportRef.current;
    if (!viewportNode) {
      return;
    }

    const syncViewForViewportResize = () => {
      const rect = viewportNode.getBoundingClientRect();
      const nextSize = {
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
      const nextInsets = safeAreaRef.current;

      const previousSize = viewportSizeRef.current;
      const previousInsets = viewportInsetsRef.current;
      viewportSizeRef.current = nextSize;
      viewportInsetsRef.current = nextInsets;
      if (!previousSize || !previousInsets) {
        return;
      }

      const previousVisibleWidth = Math.max(1, previousSize.width - previousInsets.left - previousInsets.right);
      const previousVisibleHeight = Math.max(1, previousSize.height - previousInsets.top - previousInsets.bottom);
      const previousCenterX = previousInsets.left + previousVisibleWidth / 2;
      const previousCenterY = previousInsets.top + previousVisibleHeight / 2;
      const current = viewRef.current;
      const worldCenterX = (previousCenterX - current.x) / current.scale;
      const worldCenterY = (previousCenterY - current.y) / current.scale;

      const nextVisibleWidth = Math.max(1, nextSize.width - nextInsets.left - nextInsets.right);
      const nextVisibleHeight = Math.max(1, nextSize.height - nextInsets.top - nextInsets.bottom);
      const nextCenterX = nextInsets.left + nextVisibleWidth / 2;
      const nextCenterY = nextInsets.top + nextVisibleHeight / 2;

      const nextX = nextCenterX - worldCenterX * current.scale;
      const nextY = nextCenterY - worldCenterY * current.scale;
      if (Math.abs(nextX - current.x) < 0.5 && Math.abs(nextY - current.y) < 0.5) {
        return;
      }

      applyView({
        x: nextX,
        y: nextY,
        scale: current.scale
      });
    };

    syncViewForViewportResize();
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => syncViewForViewportResize()) : null;
    resizeObserver?.observe(viewportNode);
    window.addEventListener("resize", syncViewForViewportResize);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncViewForViewportResize);
    };
  }, [applyView, safeAreaInsets?.bottom, safeAreaInsets?.left, safeAreaInsets?.right, safeAreaInsets?.top]);

  const canStartBackgroundPan = useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    if (target.closest("[data-canvas-pan-ignore='true']")) {
      return false;
    }

    if (
      target.closest(
        "button, input, textarea, select, option, a, [role='button'], [data-dnd-kit-draggable], [data-structure-node-id]"
      )
    ) {
      return false;
    }

    return true;
  }, []);

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      if (!interactive) {
        return;
      }

      if (dragInProgress) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const viewportNode = viewportRef.current;
      if (!viewportNode) {
        return;
      }

      const rect = viewportNode.getBoundingClientRect();

      // Wheel always zooms when pointer is inside the canvas.
      event.preventDefault();
      event.stopPropagation();
      const pointX = event.clientX - rect.left;
      const pointY = event.clientY - rect.top;
      const intensity = Math.exp(-event.deltaY * 0.0018);
      zoomAtPoint(viewRef.current.scale * intensity, pointX, pointY);
    },
    [dragInProgress, interactive, zoomAtPoint]
  );

  useEffect(() => {
    const viewportNode = viewportRef.current;
    if (!viewportNode) {
      return;
    }

    viewportNode.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      viewportNode.removeEventListener("wheel", handleWheel);
    };
  }, [handleWheel]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) {
      return;
    }

    const isMiddleMouse = event.button === 1;
    const canPanFromPointer = isMiddleMouse || canStartBackgroundPan(event.target);
    if (!canPanFromPointer) {
      return;
    }

    if (dragInProgress) {
      return;
    }

    event.preventDefault();
    panSessionRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const panSession = panSessionRef.current;
    if (!panSession) {
      return;
    }

    event.preventDefault();
    const deltaX = event.clientX - panSession.x;
    const deltaY = event.clientY - panSession.y;
    panSessionRef.current = { x: event.clientX, y: event.clientY };
    applyView({
      x: viewRef.current.x + deltaX,
      y: viewRef.current.y + deltaY,
      scale: viewRef.current.scale
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!panSessionRef.current) {
      return;
    }

    panSessionRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      className={cn("relative h-full w-full", className)}
      ref={rootRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        className={cn(
          `h-full w-full overflow-hidden overscroll-contain rounded-control border bg-surface-muted/20 ${interactive ? "cursor-grab active:cursor-grabbing" : ""}`,
          viewportClassName
        )}
        data-canvas-viewport="true"
        ref={viewportRef}
        style={viewportStyle}
      >
        <div className="relative" ref={transformRef} style={{ transformOrigin: "0 0" }}>
          <div className={cn("relative p-8", contentClassName)} data-canvas-content="true" ref={contentRef}>
            {gridSize && gridSize > 0 ? (
              <div
                aria-hidden
                className="pointer-events-none absolute"
                style={{
                  left: -GRID_WORLD_RADIUS,
                  top: -GRID_WORLD_RADIUS,
                  width: GRID_WORLD_RADIUS * 2,
                  height: GRID_WORLD_RADIUS * 2,
                  backgroundImage: `repeating-linear-gradient(
                    to right,
                    ${gridColor} 0 ${GRID_LINE_WIDTH}px,
                    transparent ${GRID_LINE_WIDTH}px ${gridSize}px
                  ),
                  repeating-linear-gradient(
                    to bottom,
                    ${gridColor} 0 ${GRID_LINE_WIDTH}px,
                    transparent ${GRID_LINE_WIDTH}px ${gridSize}px
                  )`,
                  backgroundSize: `${gridSize}px ${gridSize}px`,
                  backgroundPosition: "0 0"
                }}
              />
            ) : null}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
});
