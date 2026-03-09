"use client";

import { Search, ZoomIn, ZoomOut, Plus } from "lucide-react";
import { type ReactNode, type RefObject } from "react";
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
  canvasRef?: RefObject<CanvasViewportHandle | null>;
  viewportMode?: "canvas" | "static";
  staticFill?: boolean;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  dragInProgress?: boolean;
  onViewScaleChange: (scale: number) => void;
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
  onZoomOut?: () => void;
  onZoomIn?: () => void;
  onResetView?: () => void;
  clearSearchOnSubmit?: boolean;
  toolbarSlot?: ReactNode;
  bottomRightContent?: ReactNode;
};

export function StructureCanvasShell({
  storageKey,
  canvasRef,
  viewportMode = "canvas",
  staticFill = false,
  searchInputRef,
  dragInProgress,
  onViewScaleChange,
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
  onZoomOut,
  onZoomIn,
  onResetView,
  clearSearchOnSubmit = true,
  toolbarSlot,
  bottomRightContent
}: StructureCanvasShellProps) {
  const normalizedSearch = searchQuery.trim();
  const rightRailWidthPx = 320;
  const rightRailGapPx = 32;
  const centerInsetRightPx = rightRailWidthPx + rightRailGapPx;

  return (
    <div className="relative h-[68vh] min-h-[460px]" onPointerEnter={onCanvasEnter} onPointerLeave={onCanvasLeave}>
      {viewportMode === "canvas" ? (
        <CanvasViewport
          centerInsetRight={centerInsetRightPx}
          contentClassName="min-w-max"
          dragInProgress={Boolean(dragInProgress)}
          onViewChange={(view) => {
            onViewScaleChange(view.scale);
          }}
          ref={canvasRef}
          storageKey={storageKey}
        >
          <div className="flex w-full min-w-[840px] flex-col items-center gap-3">
            {rootHeader}
            {emptyState}
            {children}
          </div>
        </CanvasViewport>
      ) : (
        <div className="h-full overflow-hidden rounded-control border bg-surface">
          {staticFill ? (
            <div className="h-full w-full">{children}</div>
          ) : (
            <div className="flex h-full w-full min-w-[840px] flex-col items-center gap-3">
              {rootHeader}
              {emptyState}
              {children}
            </div>
          )}
        </div>
      )}

      <div className="pointer-events-none absolute right-3 top-3 z-30 w-[320px]">
        <div className="pointer-events-auto flex flex-col gap-2" data-canvas-pan-ignore="true">
          <div className="relative">
            <div className="relative">
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
                  if (clearSearchOnSubmit) {
                    onSearchQueryChange("");
                  }
                }}
                placeholder={searchPlaceholder}
                ref={searchInputRef}
                value={searchQuery}
              />
            </div>
            {normalizedSearch ? (
              <div className="mt-1 max-h-44 overflow-y-auto rounded-control border bg-surface p-1 shadow-sm">
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
          {toolbarSlot ?? (
            <div className="flex items-center gap-2 rounded-control border bg-surface/95 p-2 shadow-sm">
              <Button aria-label={addButtonAriaLabel} disabled={addButtonDisabled} onClick={onAdd} size="sm" type="button" variant="primary">
                <Plus className="h-4 w-4" />
              </Button>
              <Button onClick={() => (onZoomOut ? onZoomOut() : canvasRef?.current?.zoomOut())} size="sm" type="button" variant="secondary">
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <Button onClick={() => (onZoomIn ? onZoomIn() : canvasRef?.current?.zoomIn())} size="sm" type="button" variant="secondary">
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button onClick={() => (onResetView ? onResetView() : canvasRef?.current?.fitToView())} size="sm" type="button" variant="secondary">
                Reset
              </Button>
              <Chip size="compact">{zoomPercent}%</Chip>
            </div>
          )}
          {bottomRightContent}
        </div>
      </div>
    </div>
  );
}
