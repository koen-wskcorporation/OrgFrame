"use client";

import * as React from "react";
import { MapPin, Plus, Satellite, Sparkles } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { cn } from "@orgframe/ui/primitives/utils";
import { EditorActionBar } from "@/src/features/canvas/components/EditorActionBar";

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

// The facility editor's zoom range is wider than the default editor's; it
// stores zoom values that look natural at *50 instead of *100. The shared
// EditorActionBar lets us swap the formatter without forking the component.
const facilityZoomFormatter = (zoom: number) => Math.round(zoom * 50);

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
      <EditorActionBar
        readOnly
        onEdit={onEdit}
        zoom={zoom}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onFit={onFit}
        formatZoomPercent={facilityZoomFormatter}
        bottomOffsetClass="bottom-4"
      />
    );
  }

  const leadingSlot = (
    <Button
      disabled={!canWrite || isAdding}
      loading={isAdding}
      onClick={onAddSpace}
      size="sm"
      variant="ghost"
    >
      <Plus />
      Add space
    </Button>
  );

  // Outdoor-only chrome: satellite toggle, optional location-pin edit, and the
  // (currently gated) AI segment mode button. Indoor facilities skip all of
  // these and render only the core zoom/save group from EditorActionBar.
  const trailingSlot = !indoor ? (
    <>
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
        <Button
          aria-label="Edit map location"
          disabled={!canWrite}
          iconOnly
          onClick={onEditGeoLocation}
        >
          <MapPin />
        </Button>
      ) : null}
      {/* AI click-to-segment is hidden for now while the SAM2 pipeline is
          being tuned. The full implementation (toolbar button, workspace mode,
          server action) is left in place behind this gate so we can re-enable
          with a single line. */}
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
    </>
  ) : undefined;

  return (
    <EditorActionBar
      canWrite={canWrite}
      isSaving={isSaving}
      onSave={onSave}
      zoom={zoom}
      onZoomIn={onZoomIn}
      onZoomOut={onZoomOut}
      onFit={onFit}
      formatZoomPercent={facilityZoomFormatter}
      leadingSlot={leadingSlot}
      trailingSlot={trailingSlot}
    />
  );
}
