"use client";

import * as React from "react";
import { Check, Maximize2, Pencil, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";

/**
 * Floating pill-shaped action bar pinned to the bottom of a canvas editor.
 *
 * Provides the controls that every editor needs (zoom in/out, zoom badge, fit,
 * save) and slot props for the controls that are domain-specific (Add buttons,
 * satellite toggle, AI mode, …). Two display modes:
 *
 * - **Read-only** — drops the slots and Save, surfaces a single "Edit" CTA on
 *   the right that the shell maps to opening the fullscreen popup.
 * - **Editing** — full control bar with leading slot, zoom group, optional
 *   center slot, and trailing Save.
 *
 * Lives at `inset-x-0 bottom-N flex justify-center` so it floats over the
 * canvas without claiming layout space — the canvas stays free to fill its
 * container.
 *
 * Why "slots" instead of e.g. an "items: ButtonDef[]" prop: the per-domain
 * buttons (satellite/AI/AddSpace, AddDivision/AddTeam, mode toggle…) need
 * full control over their own pressed state and disabled behavior. A flat
 * data list would force every caller to fight the renderer.
 */
export type EditorActionBarProps = {
  /** When true, only zoom + Edit are shown. Hides save and slots. */
  readOnly?: boolean;
  /** Called when the Edit CTA is pressed (read-only mode only). */
  onEdit?: () => void;

  /** Disable Save + slot interactions. */
  canWrite?: boolean;
  /** Render Save in loading state. */
  isSaving?: boolean;
  /** Save handler. Hide Save by leaving this null. */
  onSave?: () => void;
  /** Save button label override. */
  saveLabel?: React.ReactNode;
  /** Save button variant override. */
  saveDisabled?: boolean;

  /** Current zoom (1 = 100%). */
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  /**
   * Custom percentage formatter. Default treats `1` as 100%. The facility
   * editor reports a wider zoom range and prefers `zoom * 50` for its scale.
   */
  formatZoomPercent?: (zoom: number) => number;

  /** Slot rendered before the zoom group (e.g. Add Division/Team buttons). */
  leadingSlot?: React.ReactNode;
  /** Slot rendered after the zoom group, before Save (e.g. satellite toggle). */
  trailingSlot?: React.ReactNode;

  /** Controls vertical offset from the bottom edge. Default 8 (= bottom-8). */
  bottomOffsetClass?: string;
};

function Divider() {
  return <span className="mx-1 h-5 w-px bg-border" aria-hidden />;
}

export function EditorActionBar({
  readOnly = false,
  onEdit,
  canWrite = true,
  isSaving = false,
  onSave,
  saveLabel,
  saveDisabled,
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
  formatZoomPercent,
  leadingSlot,
  trailingSlot,
  bottomOffsetClass = "bottom-8"
}: EditorActionBarProps) {
  const percent = (formatZoomPercent ?? ((value: number) => Math.round(value * 100)))(zoom);

  if (readOnly) {
    return (
      <div className={`pointer-events-none absolute inset-x-0 ${bottomOffsetClass} z-10 flex justify-center`}>
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border bg-surface p-2 shadow-floating">
          <Button aria-label="Zoom out" iconOnly onClick={onZoomOut}>
            <ZoomOut />
          </Button>
          <span className="min-w-[3ch] px-1 text-center text-xs font-medium tabular-nums text-text-muted">
            {percent}%
          </span>
          <Button aria-label="Zoom in" iconOnly onClick={onZoomIn}>
            <ZoomIn />
          </Button>
          <Button aria-label="Fit to content" iconOnly onClick={onFit}>
            <Maximize2 />
          </Button>
          {onEdit ? (
            <>
              <Divider />
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
    <div className={`pointer-events-none absolute inset-x-0 ${bottomOffsetClass} z-10 flex justify-center`}>
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border bg-surface p-3 shadow-floating">
        {leadingSlot ? (
          <>
            {leadingSlot}
            <Divider />
          </>
        ) : null}

        <Button aria-label="Zoom out" iconOnly onClick={onZoomOut}>
          <ZoomOut />
        </Button>
        <span className="min-w-[3ch] px-1 text-center text-xs font-medium tabular-nums text-text-muted">
          {percent}%
        </span>
        <Button aria-label="Zoom in" iconOnly onClick={onZoomIn}>
          <ZoomIn />
        </Button>
        <Button aria-label="Fit to content" iconOnly onClick={onFit}>
          <Maximize2 />
        </Button>

        {trailingSlot ? (
          <>
            <Divider />
            {trailingSlot}
          </>
        ) : null}

        {onSave ? (
          <>
            <Divider />
            <Button
              disabled={!canWrite || isSaving || saveDisabled}
              loading={isSaving}
              onClick={onSave}
              size="sm"
              variant="primary"
            >
              <Check />
              {saveLabel ?? "Save"}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
