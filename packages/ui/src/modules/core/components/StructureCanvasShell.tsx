"use client";

import { Expand, Pencil, Plus, Search, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { Button } from "@orgframe/ui/ui/button";
import { CanvasViewport, type CanvasViewportHandle } from "@orgframe/ui/ui/canvas-viewport";
import { Chip } from "@orgframe/ui/ui/chip";
import { Input } from "@orgframe/ui/ui/input";
import { Popup } from "@orgframe/ui/ui/popup";

export type StructureSearchItem = {
  id: string;
  name: string;
  kindLabel: string;
};

type StructureCanvasShellProps = {
  storageKey: string;
  canvasRef: RefObject<CanvasViewportHandle | null>;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  dragInProgress?: boolean;
  onViewScaleChange: (scale: number) => void;
  onViewChange?: (view: { x: number; y: number; scale: number }) => void;
  onCanvasEnter?: () => void;
  onCanvasLeave?: () => void;
  rootHeader: ReactNode;
  centerOverlay?: ReactNode;
  emptyState?: ReactNode;
  children: ReactNode;
  searchPlaceholder: string;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSearchSubmit: (query: string) => void;
  searchResults: StructureSearchItem[];
  addButtonAriaLabel: string;
  addButtonDisabled?: boolean;
  onAdd: () => void;
  zoomPercent: number;
  onFit?: (options?: { viewportOffsetX?: number; viewportOffsetY?: number; animated?: boolean }) => void;
  autoFitKey?: string | number;
  bottomRightContent?: ReactNode;
  canvasViewportClassName?: string;
  canvasViewportStyle?: CSSProperties;
  canvasContentClassName?: string;
  canvasLayoutMode?: "stacked" | "free";
  canvasGridSize?: number;
  canvasGridColor?: string;
  popupTitle?: ReactNode;
  popupSubtitle?: ReactNode;
  autoFitOnOpen?: boolean;
  persistViewState?: boolean;
  viewEditButtonPlacement?: "bottom-center" | "top-right";
  showEditButton?: boolean;
  viewContentInteractive?: boolean;
  viewViewportInteractive?: boolean;
  onViewNodeSelect?: (nodeId: string) => void;
  onEditOpenChange?: (isEditOpen: boolean) => void;
};

export function StructureCanvasShell({
  storageKey,
  canvasRef,
  searchInputRef,
  dragInProgress,
  onViewScaleChange,
  onViewChange,
  onCanvasEnter,
  onCanvasLeave,
  rootHeader,
  centerOverlay,
  emptyState,
  children,
  searchPlaceholder,
  searchQuery,
  onSearchQueryChange,
  onSearchSubmit,
  searchResults,
  addButtonAriaLabel,
  addButtonDisabled,
  onAdd,
  zoomPercent,
  onFit,
  autoFitKey,
  bottomRightContent,
  canvasViewportClassName,
  canvasViewportStyle,
  canvasContentClassName,
  canvasLayoutMode = "stacked",
  canvasGridSize,
  canvasGridColor,
  popupTitle = "Structure map",
  popupSubtitle = "Edit structure map, rooms, and layout.",
  autoFitOnOpen = false,
  persistViewState = true,
  viewEditButtonPlacement = "bottom-center",
  showEditButton = true,
  viewContentInteractive = false,
  viewViewportInteractive = false,
  onViewNodeSelect,
  onEditOpenChange
}: StructureCanvasShellProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAutoFitPending, setIsAutoFitPending] = useState(false);
  const [isPopupLayoutSettled, setIsPopupLayoutSettled] = useState(false);
  const [isCanvasHot, setIsCanvasHot] = useState(false);
  const [safeAreaInsets, setSafeAreaInsets] = useState({ left: 0, right: 0, top: 0, bottom: 0 });
  const [overlayVars, setOverlayVars] = useState<Record<string, string>>({});
  const shellRootRef = useRef<HTMLDivElement | null>(null);
  const actionBarRef = useRef<HTMLDivElement | null>(null);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const onFitRef = useRef(onFit);
  const manualFocusRef = useRef(false);
  const normalizedSearch = searchQuery.trim();

  useEffect(() => {
    onFitRef.current = onFit;
  }, [onFit]);

  useEffect(() => {
    onEditOpenChange?.(isEditOpen);
  }, [isEditOpen, onEditOpenChange]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      const searchContainer = searchContainerRef.current;
      if (searchContainer && searchContainer.contains(target)) {
        return;
      }

      if (searchInputRef?.current && searchInputRef.current === document.activeElement) {
        searchInputRef.current.blur();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [searchInputRef]);

  useEffect(() => {
    if (!isCanvasHot) {
      return;
    }

    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      if (target.isContentEditable) {
        return true;
      }

      return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === "Enter") {
        if (!searchQuery.trim()) {
          return;
        }
        event.preventDefault();
        manualFocusRef.current = true;
        onSearchSubmit(searchQuery.trim());
        onSearchQueryChange("");
        searchInputRef?.current?.focus();
        return;
      }

      if (event.key === "Backspace") {
        if (!searchQuery) {
          return;
        }
        event.preventDefault();
        onSearchQueryChange(searchQuery.slice(0, -1));
        searchInputRef?.current?.focus();
        return;
      }

      if (event.key === "Escape") {
        if (!searchQuery) {
          return;
        }
        event.preventDefault();
        onSearchQueryChange("");
        searchInputRef?.current?.focus();
        return;
      }

      if (event.key.length !== 1) {
        return;
      }

      event.preventDefault();
      onSearchQueryChange(`${searchQuery}${event.key}`);
      searchInputRef?.current?.focus();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCanvasHot, onSearchQueryChange, onSearchSubmit, searchInputRef, searchQuery]);

  useEffect(() => {
    if (!isEditOpen) {
      setIsPopupLayoutSettled(false);
    }
  }, [isEditOpen]);

  useEffect(() => {
    if (!isEditOpen) {
      return;
    }

    const source = shellRootRef.current?.closest(".org-layout-root") as HTMLElement | null;
    if (!source) {
      setOverlayVars({});
      return;
    }

    const nextVars: Record<string, string> = {};
    for (let index = 0; index < source.style.length; index += 1) {
      const key = source.style.item(index);
      if (!key || !key.startsWith("--")) {
        continue;
      }

      const value = source.style.getPropertyValue(key);
      if (value) {
        nextVars[key] = value;
      }
    }
    setOverlayVars(nextVars);
  }, [isEditOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (isEditOpen) {
      const updateInsets = () => {
        const actionBarHeight = actionBarRef.current?.getBoundingClientRect().height ?? 0;
        setSafeAreaInsets({ left: 0, right: 0, top: 0, bottom: Math.round(actionBarHeight + 12) });
      };

      updateInsets();
      const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => updateInsets()) : null;
      if (actionBarRef.current) {
        resizeObserver?.observe(actionBarRef.current);
      }
      window.addEventListener("resize", updateInsets);

      return () => {
        resizeObserver?.disconnect();
        window.removeEventListener("resize", updateInsets);
      };
    }

    let observedPanels = new Set<HTMLElement>();
    const panelResizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => updateInsets()) : null;
    const panelDock = document.getElementById("panel-dock");

    const syncPanelObservers = () => {
      if (!panelResizeObserver) {
        return;
      }
      const panels = Array.from(document.querySelectorAll<HTMLElement>(".app-panel")).filter((panel) => {
        const styles = window.getComputedStyle(panel);
        return styles.position === "fixed" && styles.display !== "none" && styles.visibility !== "hidden";
      });
      const nextSet = new Set(panels);
      observedPanels.forEach((panel) => {
        if (!nextSet.has(panel)) {
          panelResizeObserver.unobserve(panel);
        }
      });
      panels.forEach((panel) => {
        if (!observedPanels.has(panel)) {
          panelResizeObserver.observe(panel);
        }
      });
      observedPanels = nextSet;
    };

    function updateInsets() {
      syncPanelObservers();
      const panels = Array.from(document.querySelectorAll<HTMLElement>(".app-panel")).filter((panel) => {
        const styles = window.getComputedStyle(panel);
        return styles.position === "fixed" && styles.display !== "none" && styles.visibility !== "hidden";
      });
      const panelWidth = panels.reduce((max, panel) => Math.max(max, panel.getBoundingClientRect().width), 0);
      const rootStyles = window.getComputedStyle(document.documentElement);
      const gap = Number.parseFloat(rootStyles.getPropertyValue("--layout-gap")) || 0;
      setSafeAreaInsets({ left: 0, right: panelWidth > 0 ? Math.round(panelWidth + gap) : 0, top: 0, bottom: 0 });
    }

    updateInsets();
    const mutationObserver =
      panelDock && typeof MutationObserver !== "undefined"
        ? new MutationObserver(() => {
            updateInsets();
          })
        : null;
    if (mutationObserver && panelDock) {
      mutationObserver.observe(panelDock, { childList: true, subtree: true });
    }
    window.addEventListener("resize", updateInsets);

    return () => {
      mutationObserver?.disconnect();
      panelResizeObserver?.disconnect();
      window.removeEventListener("resize", updateInsets);
    };
  }, [isEditOpen]);

  useLayoutEffect(() => {
    if (!autoFitOnOpen) {
      setIsAutoFitPending(false);
      return;
    }

    let stopped = false;
    let fitCommitInProgress = false;
    let stableTicks = 0;
    let lastKey: string | null = null;
    let rafId: number | null = null;
    const timerIds: number[] = [];
    setIsAutoFitPending(true);

    const getScope = () =>
      isEditOpen
        ? ((actionBarRef.current?.closest("[data-popup-editor-root='true']") as HTMLElement | null) ?? null)
        : shellRootRef.current;

    const buildLayoutKey = () => {
      const scope = getScope();
      if (!scope) {
        return null;
      }
      const viewport = scope.querySelector<HTMLElement>("[data-canvas-viewport='true']");
      if (!viewport) {
        return null;
      }
      const viewportRect = viewport.getBoundingClientRect();
      if (viewportRect.width <= 1 || viewportRect.height <= 1) {
        return null;
      }

      let contentKey = "";
      if (canvasLayoutMode !== "free") {
        const content = scope.querySelector<HTMLElement>("[data-canvas-content='true']");
        if (content) {
          const contentRect = content.getBoundingClientRect();
          contentKey = `${Math.round(contentRect.width)}x${Math.round(contentRect.height)}`;
        }
      }

      const insetKey = `${safeAreaInsets.left},${safeAreaInsets.right},${safeAreaInsets.top},${safeAreaInsets.bottom}`;
      const extraKey = autoFitKey !== undefined ? String(autoFitKey) : "";
      return `${Math.round(viewportRect.width)}x${Math.round(viewportRect.height)}|${contentKey}|${insetKey}|${extraKey}`;
    };

      const runFit = () => {
        const handle = canvasRef.current;
        if (!handle) {
          return;
        }
        const fit = onFitRef.current;
        if (fit) {
          fit({
            viewportOffsetX: 0,
            viewportOffsetY: 0,
            animated: false
          });
        } else {
          handle.fitToView({
            viewportOffsetX: 0,
            viewportOffsetY: 0,
            animated: false
          });
        }
      };

    const attemptFit = () => {
      if (stopped) {
        return;
      }

      if (manualFocusRef.current) {
        return;
      }

      if (isEditOpen && !isPopupLayoutSettled) {
        return;
      }

      const nextKey = buildLayoutKey();
      if (!nextKey) {
        return;
      }

      if (nextKey === lastKey) {
        stableTicks += 1;
      } else {
        stableTicks = 0;
        lastKey = nextKey;
      }

      if (stableTicks < 2) {
        return;
      }

      if (fitCommitInProgress) {
        return;
      }
      fitCommitInProgress = true;
      runFit();
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (stopped) {
            return;
          }
          runFit();
          fitCommitInProgress = false;
          setIsAutoFitPending(false);
        });
      });
    };

    const schedule = () => {
      if (rafId !== null) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        attemptFit();
      });
    };

    schedule();
    [80, 180, 320, 520].forEach((delay) => {
      timerIds.push(window.setTimeout(schedule, delay));
    });

    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => schedule()) : null;
    const scope = getScope();
    if (scope) {
      const viewport = scope.querySelector<HTMLElement>("[data-canvas-viewport='true']");
      const content = scope.querySelector<HTMLElement>("[data-canvas-content='true']");
      if (viewport) {
        resizeObserver?.observe(viewport);
      }
      if (content && canvasLayoutMode !== "free") {
        resizeObserver?.observe(content);
      }
    }
    window.addEventListener("resize", schedule);
    timerIds.push(
      window.setTimeout(() => {
        if (stopped) {
          return;
        }
        setIsAutoFitPending(false);
      }, 1200)
    );

    return () => {
      stopped = true;
      timerIds.forEach((timerId) => window.clearTimeout(timerId));
      resizeObserver?.disconnect();
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener("resize", schedule);
    };
  }, [autoFitKey, autoFitOnOpen, canvasLayoutMode, canvasRef, isEditOpen, isPopupLayoutSettled, safeAreaInsets]);

  function renderShell({ editable, fullscreen }: { editable: boolean; fullscreen: boolean }) {
    const hideUntilAutoFit = autoFitOnOpen && isAutoFitPending && editable === isEditOpen;
    const allowContentInteraction = editable || viewContentInteractive;
    return (
      <div
        className={`relative ${hideUntilAutoFit ? "opacity-0" : "opacity-100"} ${fullscreen ? "h-full min-h-0" : "h-[68vh] min-h-[460px]"}`}
        onClickCapture={(event) => {
          if (editable || !onViewNodeSelect) {
            return;
          }

          const target = event.target;
          if (!(target instanceof HTMLElement)) {
            return;
          }

          const nodeElement = target.closest<HTMLElement>("[data-structure-node-id]");
          const nodeId = nodeElement?.dataset.structureNodeId;
          if (!nodeId) {
            return;
          }

          onViewNodeSelect(nodeId);
        }}
        onPointerEnter={() => {
          setIsCanvasHot(true);
          onCanvasEnter?.();
        }}
        onPointerLeave={() => {
          setIsCanvasHot(false);
          onCanvasLeave?.();
        }}
      >
        <CanvasViewport
          contentClassName={canvasContentClassName ?? "min-w-max"}
          dragInProgress={editable ? Boolean(dragInProgress) : false}
          interactive={editable}
          onViewChange={(view) => {
            onViewScaleChange(view.scale);
            onViewChange?.(view);
          }}
          ref={canvasRef}
          storageKey={persistViewState ? `${storageKey}:${editable ? "edit" : "view"}` : undefined}
          viewportClassName={`${canvasViewportClassName ?? ""} ${fullscreen ? "rounded-none border-0" : ""}`.trim()}
          viewportStyle={canvasViewportStyle}
          safeAreaInsets={safeAreaInsets}
          gridSize={canvasGridSize}
          gridColor={canvasGridColor}
        >
          {canvasLayoutMode === "free" ? (
            <div className={allowContentInteraction ? undefined : "pointer-events-none select-none"}>{children}</div>
          ) : (
            <div className="flex w-full min-w-[840px] flex-col items-center gap-3">
              {rootHeader}
              {emptyState}
              <div className={allowContentInteraction ? undefined : "pointer-events-none select-none"}>{children}</div>
            </div>
          )}
        </CanvasViewport>
        {canvasLayoutMode === "free" ? (
          <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
            {rootHeader}
            {emptyState ? <div className="mt-3">{emptyState}</div> : null}
          </div>
        ) : null}
        {centerOverlay ? <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">{centerOverlay}</div> : null}

        {editable ? (
          <>
            <div className="pointer-events-none absolute left-3 top-3 z-30">
              <div
                className="pointer-events-auto relative min-w-[220px] max-w-[320px] rounded-full border border-border/70 bg-surface/92 p-2 shadow-floating backdrop-blur-xl"
                data-canvas-pan-ignore="true"
                ref={searchContainerRef}
              >
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                  <Input
                    className="h-10 rounded-full border-border/70 bg-surface/95 pl-9 pr-16"
                    onChange={(event) => onSearchQueryChange(event.target.value)}
                    onKeyDown={(event) => {
                    if (event.key !== "Enter") {
                      return;
                    }

                    event.preventDefault();
                    manualFocusRef.current = true;
                    onSearchSubmit(event.currentTarget.value);
                    onSearchQueryChange("");
                  }}
                    placeholder={searchPlaceholder}
                    ref={searchInputRef}
                    value={searchQuery}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                    Enter
                  </span>
                  {normalizedSearch ? (
                    <div className="absolute top-full mt-2 max-h-44 w-full overflow-y-auto rounded-control border bg-surface p-1 shadow-sm">
                      <p className="px-2 py-1 text-[11px] text-text-muted">Press Enter to jump to the best match</p>
                      {searchResults.length === 0 ? <p className="px-2 py-1 text-xs text-text-muted">No matches</p> : null}
                      {searchResults.slice(0, 12).map((item) => (
                        <button
                          className="flex w-full items-center justify-between rounded-control px-2 py-1 text-left text-xs text-text hover:bg-surface-muted"
                          key={item.id}
                          onClick={() => {
                            manualFocusRef.current = true;
                            onSearchSubmit(item.name);
                          }}
                          type="button"
                        >
                          <span className="truncate" title={item.name}>
                            {item.name}
                          </span>
                          <span className="ml-2 shrink-0 text-text-muted">{item.kindLabel}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="pointer-events-none absolute right-3 top-3 z-30">
              <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border/70 bg-surface/92 px-2 py-2 shadow-floating backdrop-blur-xl" data-canvas-pan-ignore="true">
                <Button onClick={() => canvasRef.current?.zoomOut()} size="sm" type="button" variant="ghost">
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                <Chip className="min-w-[56px] justify-center" size="compact">
                  {zoomPercent}%
                </Chip>
                <Button onClick={() => canvasRef.current?.zoomIn()} size="sm" type="button" variant="ghost">
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
                <Button
                  onClick={() => {
                    manualFocusRef.current = false;
                    if (onFit) {
                      onFit();
                      return;
                    }

                    canvasRef.current?.fitToView();
                  }}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  <Expand className="h-3.5 w-3.5" />
                  Fit
                </Button>
              </div>
            </div>

            <div className="pointer-events-none absolute bottom-3 right-3 z-30">
              <div
                className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/70 bg-surface/92 px-3 py-2 shadow-floating backdrop-blur-xl"
                data-canvas-pan-ignore="true"
                ref={actionBarRef}
              >
                <Button aria-label={addButtonAriaLabel} disabled={addButtonDisabled} onClick={onAdd} size="sm" type="button" variant="primary">
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>
          </>
        ) : showEditButton ? (
          <div
            className={`pointer-events-none absolute z-30 ${
              viewEditButtonPlacement === "top-right" ? "right-3 top-3" : "bottom-3 left-1/2 -translate-x-1/2"
            }`}
          >
            <div className="pointer-events-auto" data-canvas-pan-ignore="true">
              <Button onClick={() => setIsEditOpen(true)} size="sm" type="button" variant="secondary">
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div ref={shellRootRef}>{isEditOpen ? null : renderShell({ editable: false, fullscreen: false })}</div>
      <Popup
        closeOnBackdrop={false}
        contentClassName="overflow-hidden p-0"
        onClose={() => setIsEditOpen(false)}
        onOpenSettled={() => setIsPopupLayoutSettled(true)}
        open={isEditOpen}
        popupClassName="bg-surface"
        popupStyle={overlayVars}
        size="full"
        subtitle={popupSubtitle}
        title={popupTitle}
      >
        <div
          className="grid h-full w-full items-stretch transition-[grid-template-columns,column-gap] duration-200 ease-out motion-reduce:transition-none"
          data-popup-editor-root="true"
          style={{
            gridTemplateColumns: "minmax(0, 1fr) var(--popup-panel-active-width, 0px)",
            columnGap: "var(--popup-panel-gap, 0px)"
          }}
        >
          <div className="min-w-0 overflow-hidden bg-surface">
            {renderShell({ editable: true, fullscreen: true })}
          </div>
          <div className="relative h-full" data-panel-context="popup" id="popup-panel-dock" />
        </div>
      </Popup>
    </>
  );
}
