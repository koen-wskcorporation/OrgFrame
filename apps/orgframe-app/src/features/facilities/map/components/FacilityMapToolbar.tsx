"use client";

import * as React from "react";
import { Check, MapPin, Maximize2, Pencil, Plus, Satellite, Sparkles, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { cn } from "@orgframe/ui/primitives/utils";

type FacilityMapToolbarProps = {
  canWrite: boolean;
  isSaving: boolean;
  isAdding: boolean;
  onSave: () => void;
  onAddSpace: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  zoom: number;
  geoShowMap: boolean;
  geoHasAnchor: boolean;
  /** Indoor facilities render on the grid only; hide satellite + map-pin. */
  indoor?: boolean;
  onToggleGeoMap: () => void;
  onEditGeoLocation: () => void;
  aiMode?: boolean;
  isAiBusy?: boolean;
  onToggleAiMode?: () => void;
  /** Read-only preview mode — hides all editing controls and shows a single
   *  "Edit" button that opens the full editor. Zoom + fit stay visible. */
  readOnly?: boolean;
  onEdit?: () => void;
};

export function FacilityMapToolbar({
  canWrite,
  isSaving,
  isAdding,
  onSave,
  onAddSpace,
  onZoomIn,
  onZoomOut,
  onFit,
  zoom,
  geoShowMap,
  geoHasAnchor,
  indoor = false,
  onToggleGeoMap,
  onEditGeoLocation,
  aiMode = false,
  isAiBusy = false,
  onToggleAiMode,
  readOnly = false,
  onEdit
}: FacilityMapToolbarProps) {
  if (readOnly) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border bg-surface p-2 shadow-floating">
          <Button aria-label="Zoom out" iconOnly onClick={onZoomOut}>
            <ZoomOut />
          </Button>
          <span className="min-w-[3ch] px-1 text-center text-xs font-medium tabular-nums text-text-muted">
            {Math.round(zoom * 50)}%
          </span>
          <Button aria-label="Zoom in" iconOnly onClick={onZoomIn}>
            <ZoomIn />
          </Button>
          <Button aria-label="Fit to content" iconOnly onClick={onFit}>
            <Maximize2 />
          </Button>
          {onEdit ? (
            <>
              <span className="mx-1 h-5 w-px bg-border" aria-hidden />
              <Button onClick={onEdit} size="sm" variant="primary">
                <Pencil />
                Edit
              </Button>
            </>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-8 z-10 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border bg-surface p-3 shadow-floating">
        <Button disabled={!canWrite || isAdding} loading={isAdding} onClick={onAddSpace} size="sm" variant="ghost">
          <Plus />
          Add space
        </Button>

        <span className="mx-1 h-5 w-px bg-border" aria-hidden />

        <Button aria-label="Zoom out" iconOnly onClick={onZoomOut}>
          <ZoomOut />
        </Button>
        <span className="min-w-[3ch] px-1 text-center text-xs font-medium tabular-nums text-text-muted">{Math.round(zoom * 50)}%</span>
        <Button aria-label="Zoom in" iconOnly onClick={onZoomIn}>
          <ZoomIn />
        </Button>
        <Button aria-label="Fit to content" iconOnly onClick={onFit}>
          <Maximize2 />
        </Button>

        {!indoor ? (
          <>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />

            <Button
              aria-label={geoShowMap ? "Hide satellite" : "Show satellite"}
              aria-pressed={geoShowMap}
              className={cn(geoShowMap ? "bg-surface-muted text-text" : undefined)}
              disabled={!canWrite}
              iconOnly
              onClick={onToggleGeoMap}
            >
              <Satellite />
            </Button>
            {geoHasAnchor ? (
              <Button aria-label="Edit map location" disabled={!canWrite} iconOnly onClick={onEditGeoLocation}>
                <MapPin />
              </Button>
            ) : null}
          </>
        ) : null}
        {/* AI click-to-segment is hidden for now while the SAM2 pipeline is
            being tuned. The full implementation (toolbar button, workspace
            mode, server action) is left in place behind this gate so we can
            re-enable with a single line. */}
        {false && geoShowMap && onToggleAiMode ? (
          <Button
            aria-label={aiMode ? "Exit AI segment mode" : "AI · Click to outline spaces"}
            aria-pressed={aiMode}
            className={cn("text-accent hover:text-accent", aiMode ? "bg-accent/10" : undefined)}
            disabled={!canWrite || isAiBusy}
            iconOnly
            onClick={onToggleAiMode}
          >
            <Sparkles />
          </Button>
        ) : null}

        <span className="mx-1 h-5 w-px bg-border" aria-hidden />

        <Button disabled={!canWrite || isSaving} loading={isSaving} onClick={onSave} size="sm" variant="primary">
          <Check />
          Save
        </Button>
      </div>
    </div>
  );
}
