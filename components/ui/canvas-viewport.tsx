"use client";

import { cn } from "@/lib/utils";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
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
  fitToView: () => void;
  focusElement: (element: HTMLElement, options?: { targetScale?: number }) => void;
};

type CanvasViewportProps = PropsWithChildren<{
  className?: string;
  viewportClassName?: string;
  contentClassName?: string;
  minScale?: number;
  maxScale?: number;
  zoomStep?: number;
  fitPadding?: number;
  centerInsetLeft?: number;
  centerInsetRight?: number;
  centerInsetTop?: number;
  centerInsetBottom?: number;
  storageKey?: string;
  dragInProgress?: boolean;
  onViewChange?: (view: CanvasView) => void;
}>;

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
    contentClassName,
    minScale = 0.5,
    maxScale = 2,
    zoomStep = 0.14,
    fitPadding = 48,
    centerInsetLeft = 0,
    centerInsetRight = 0,
    centerInsetTop = 0,
    centerInsetBottom = 0,
    storageKey,
    dragInProgress = false,
    onViewChange
  },
  ref
) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const transformRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<CanvasView>({ x: 0, y: 0, scale: 1 });
  const panSessionRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const notifyRafRef = useRef<number | null>(null);
  const onViewChangeRef = useRef<CanvasViewportProps["onViewChange"]>(onViewChange);

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

  const applyView = useCallback(
    (next: CanvasView, options?: { skipPersist?: boolean; skipNotify?: boolean }) => {
      const transformNode = transformRef.current;
      if (!transformNode) {
        return;
      }

      viewRef.current = next;
      // Use 2D transforms to keep text/vector content sharp while zooming.
      // Persistent 3D compositing can rasterize the layer and introduce pixelation on zoom-in.
      transformNode.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;

      if (storageKey && !options?.skipPersist) {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
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
          onViewChangeRef.current?.(next);
        }
      });
    },
    [storageKey]
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

  const fitToView = useCallback(() => {
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

    const usableWidth = Math.max(32, viewportRect.width - centerInsetLeft - centerInsetRight);
    const usableHeight = Math.max(32, viewportRect.height - centerInsetTop - centerInsetBottom);
    const innerWidth = Math.max(32, usableWidth - fitPadding * 2);
    const innerHeight = Math.max(32, usableHeight - fitPadding * 2);
    const targetScale = clamp(Math.min(innerWidth / contentWidth, innerHeight / contentHeight), scaleBounds.min, scaleBounds.max);
    const centerX = centerInsetLeft + usableWidth / 2;
    const centerY = centerInsetTop + usableHeight / 2;
    const x = centerX - (contentWidth * targetScale) / 2;
    const y = centerY - (contentHeight * targetScale) / 2;
    animateTo({ x, y, scale: targetScale });
  }, [
    animateTo,
    centerInsetBottom,
    centerInsetLeft,
    centerInsetRight,
    centerInsetTop,
    fitPadding,
    scaleBounds.max,
    scaleBounds.min
  ]);

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
      const usableWidth = Math.max(32, viewportRect.width - centerInsetLeft - centerInsetRight);
      const usableHeight = Math.max(32, viewportRect.height - centerInsetTop - centerInsetBottom);
      const centerX = centerInsetLeft + usableWidth / 2;
      const centerY = centerInsetTop + usableHeight / 2;
      const x = centerX - (elementX + elementWidth / 2) * targetScale;
      const y = centerY - (elementY + elementHeight / 2) * targetScale;
      animateTo({ x, y, scale: targetScale });
    },
    [animateTo, centerInsetBottom, centerInsetLeft, centerInsetRight, centerInsetTop, scaleBounds.max, scaleBounds.min]
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
        const usableWidth = Math.max(32, rect.width - centerInsetLeft - centerInsetRight);
        const usableHeight = Math.max(32, rect.height - centerInsetTop - centerInsetBottom);
        const centerX = centerInsetLeft + usableWidth / 2;
        const centerY = centerInsetTop + usableHeight / 2;
        const next = viewRef.current.scale * (1 + zoomStep);
        zoomAtPoint(next, centerX, centerY);
      },
      zoomOut: () => {
        const viewportNode = viewportRef.current;
        if (!viewportNode) {
          return;
        }

        const rect = viewportNode.getBoundingClientRect();
        const usableWidth = Math.max(32, rect.width - centerInsetLeft - centerInsetRight);
        const usableHeight = Math.max(32, rect.height - centerInsetTop - centerInsetBottom);
        const centerX = centerInsetLeft + usableWidth / 2;
        const centerY = centerInsetTop + usableHeight / 2;
        const next = viewRef.current.scale * (1 - zoomStep);
        zoomAtPoint(next, centerX, centerY);
      },
      resetView,
      fitToView,
      focusElement
    }),
    [
      centerInsetBottom,
      centerInsetLeft,
      centerInsetRight,
      centerInsetTop,
      fitToView,
      focusElement,
      resetView,
      zoomAtPoint,
      zoomStep
    ]
  );

  useEffect(() => {
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

  useEffect(() => {
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
    [dragInProgress, zoomAtPoint]
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
          "h-full w-full cursor-grab overflow-hidden overscroll-contain rounded-control border bg-surface-muted/20 active:cursor-grabbing",
          viewportClassName
        )}
        ref={viewportRef}
      >
        <div ref={transformRef} style={{ transformOrigin: "0 0" }}>
          <div className={cn("inline-block p-8", contentClassName)} ref={contentRef}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
});
