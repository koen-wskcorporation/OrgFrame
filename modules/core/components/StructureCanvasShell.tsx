"use client";

import { createPortal } from "react-dom";
import { Pencil, Plus, Search, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { CanvasViewport, type CanvasViewportHandle } from "@/components/ui/canvas-viewport";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";

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
  bottomRightContent?: ReactNode;
  canvasViewportClassName?: string;
  canvasViewportStyle?: CSSProperties;
  canvasContentClassName?: string;
  canvasLayoutMode?: "stacked" | "free";
  canvasGridSize?: number;
  canvasGridColor?: string;
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
  bottomRightContent,
  canvasViewportClassName,
  canvasViewportStyle,
  canvasContentClassName,
  canvasLayoutMode = "stacked",
  canvasGridSize,
  canvasGridColor
}: StructureCanvasShellProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [overlayVars, setOverlayVars] = useState<Record<string, string>>({});
  const shellRootRef = useRef<HTMLDivElement | null>(null);
  const normalizedSearch = searchQuery.trim();

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

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

  function renderShell({ editable, fullscreen }: { editable: boolean; fullscreen: boolean }) {
    return (
      <div
        className={`relative ${fullscreen ? "h-full min-h-0" : "h-[68vh] min-h-[460px]"}`}
        onPointerEnter={onCanvasEnter}
        onPointerLeave={onCanvasLeave}
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
          storageKey={storageKey}
          viewportClassName={canvasViewportClassName}
          viewportStyle={canvasViewportStyle}
          gridSize={canvasGridSize}
          gridColor={canvasGridColor}
        >
          {canvasLayoutMode === "free" ? (
            <div className={editable ? undefined : "pointer-events-none select-none"}>{children}</div>
          ) : (
            <div className="flex w-full min-w-[840px] flex-col items-center gap-3">
              {rootHeader}
              {emptyState}
              <div className={editable ? undefined : "pointer-events-none select-none"}>{children}</div>
            </div>
          )}
        </CanvasViewport>

        {canvasLayoutMode === "free" ? (
          <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
            {rootHeader}
            {emptyState ? <div className="mt-3">{emptyState}</div> : null}
          </div>
        ) : null}

        <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2">
          {editable ? (
            <div
              className="pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-control border bg-surface/95 p-2 shadow-sm"
              data-canvas-pan-ignore="true"
            >
              <div className="relative w-[260px] min-w-[220px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <Input
                  className="pl-9"
                  onChange={(event) => onSearchQueryChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") {
                      return;
                    }

                    event.preventDefault();
                    onSearchSubmit(event.currentTarget.value);
                    onSearchQueryChange("");
                  }}
                  placeholder={searchPlaceholder}
                  ref={searchInputRef}
                  value={searchQuery}
                />
                {normalizedSearch ? (
                  <div className="absolute bottom-full mb-2 max-h-44 w-full overflow-y-auto rounded-control border bg-surface p-1 shadow-sm">
                    <p className="px-2 py-1 text-[11px] text-text-muted">Press Enter to jump to the best match</p>
                    {searchResults.length === 0 ? <p className="px-2 py-1 text-xs text-text-muted">No matches</p> : null}
                    {searchResults.slice(0, 12).map((item) => (
                      <button
                        className="flex w-full items-center justify-between rounded-control px-2 py-1 text-left text-xs text-text hover:bg-surface-muted"
                        key={item.id}
                        onClick={() => {
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
              <Button aria-label={addButtonAriaLabel} disabled={addButtonDisabled} onClick={onAdd} size="sm" type="button" variant="primary">
                <Plus className="h-4 w-4" />
              </Button>
              <Button onClick={() => canvasRef.current?.zoomOut()} size="sm" type="button" variant="secondary">
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <Button onClick={() => canvasRef.current?.zoomIn()} size="sm" type="button" variant="secondary">
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button onClick={() => canvasRef.current?.fitToView()} size="sm" type="button" variant="secondary">
                Reset
              </Button>
              <Chip size="compact">{zoomPercent}%</Chip>
              {bottomRightContent ? <div className="max-w-[40vw]">{bottomRightContent}</div> : null}
              <Button onClick={() => setIsEditOpen(false)} size="sm" type="button" variant="ghost">
                <X className="h-4 w-4" />
                Done
              </Button>
            </div>
          ) : (
            <div className="pointer-events-auto" data-canvas-pan-ignore="true">
              <Button onClick={() => setIsEditOpen(true)} size="sm" type="button" variant="secondary">
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div ref={shellRootRef}>{renderShell({ editable: false, fullscreen: false })}</div>
      {mounted && isEditOpen
        ? createPortal(
            <div className="fixed inset-0 bg-black/55 p-2 sm:p-4" style={{ ...overlayVars, zIndex: 2147483647 }}>
              <div
                className="grid h-full w-full items-stretch"
                data-popup-editor-root="true"
                style={{
                  gridTemplateColumns: "minmax(0, 1fr) var(--popup-panel-active-width, 0px)",
                  columnGap: "var(--popup-panel-gap, 0px)"
                }}
              >
                <div className="min-w-0 overflow-hidden rounded-card border bg-surface shadow-floating">
                  {renderShell({ editable: true, fullscreen: true })}
                </div>
                <div className="relative h-full" data-panel-context="popup" id="popup-panel-dock" />
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
