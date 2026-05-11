"use client";

import * as React from "react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Popup } from "@orgframe/ui/primitives/popup";
import { Section } from "@orgframe/ui/primitives/section";

/**
 * Shared chrome for canvas-style editors (facility map, program map, …).
 *
 * Provides two layers, both optional:
 * - **Preview card** — a read-only mini canvas inside a `Section`. Click
 *   the "Edit" affordance inside the editor body to open the full popup.
 * - **Fullscreen popup** — `<Popup size="full">` with an unsaved-changes guard
 *   on close (browser-level beforeunload + a confirm() on backdrop/close click).
 *
 * Side panels are NOT this component's concern. Callers render `<Panel>`
 * primitives at the top level of their workspace; those panels portal into
 * the global `<PanelContainer>` (which sits above the fullscreen popup via
 * z-index). The popup body shrinks via `padding-right: var(--panel-active-width)`
 * so the canvas leaves room for whatever panels the user has open.
 *
 * Both editors render their own canvas via `renderEditor`. The shell hands
 * back a `mode` ("preview" | "full") so callers can lock interaction in
 * preview and route the full set of mutations only when in popup.
 */
export type EditorMode = "preview" | "full";

export type EditorShellProps = {
  /** Title shown above the preview card and inside the popup header. */
  title: React.ReactNode;
  /** Read-only access banner (when canWrite is false and preview is shown). */
  readOnlyMessage?: React.ReactNode;
  /** Description under the preview card title. */
  previewDescription?: React.ReactNode;
  /** Subtitle under the popup title in the popup header. */
  popupSubtitle?: React.ReactNode;

  canWrite: boolean;
  /** Workspace draft is dirty — drives beforeunload and discard-confirm. */
  isDirty: boolean;
  /** Reset the draft to baseline; called when the user discards on close. */
  onDiscardDirty: () => void;

  /** Hide the read-only preview entirely (e.g. when embedded in a full page). */
  hidePreview?: boolean;
  /** Open the popup immediately on mount. */
  defaultEditorOpen?: boolean;
  /** Called once the popup has fully closed (after dirty-discard check). */
  onEditorClose?: () => void;

  /**
   * Render the canvas. Called twice: once for the preview (mode="preview",
   * `requestEdit` opens the popup) and once for the popup (mode="full").
   * `popupSession` increments on every popup open so callers can use it as
   * a `key` to remount internal state (pan/zoom/fit).
   */
  renderEditor: (args: {
    mode: EditorMode;
    popupSession: number;
    requestEdit: () => void;
  }) => React.ReactNode;

  /** Extra slots above/below the popup (e.g. SetLocationPopup, status manager). */
  popupExtras?: React.ReactNode;

  /** Definite preview height. Editors with `h-full` children need an explicit
   *  ancestor height — `min-h` alone resolves to 0 inside a non-stretching
   *  flex column. Defaults to 480 to match the embedded facility preview. */
  previewHeight?: number;
};

const DEFAULT_PREVIEW_HEIGHT = 480;

export function EditorShell({
  title,
  readOnlyMessage,
  previewDescription,
  popupSubtitle,
  canWrite,
  isDirty,
  onDiscardDirty,
  hidePreview = false,
  defaultEditorOpen = false,
  onEditorClose,
  renderEditor,
  popupExtras,
  previewHeight = DEFAULT_PREVIEW_HEIGHT
}: EditorShellProps) {
  const [isOpen, setIsOpen] = React.useState(defaultEditorOpen);

  // Bump on every open so callers can remount internal canvas state (fit, zoom).
  // Mirrors the pattern from the original FacilityMapWorkspace.
  const [popupSession, setPopupSession] = React.useState(0);
  React.useEffect(() => {
    if (isOpen) setPopupSession((session) => session + 1);
  }, [isOpen]);

  // Guard against hydration drift in inline preview canvases — the original
  // facility map editor's path math diverged between SSR and client.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // Browser beforeunload guard while the draft is dirty. Modern browsers
  // ignore the message text but require a non-empty `returnValue`.
  React.useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const requestEdit = React.useCallback(() => setIsOpen(true), []);

  const attemptClose = React.useCallback(() => {
    if (!isDirty) {
      setIsOpen(false);
      onEditorClose?.();
      return;
    }
    const ok =
      typeof window !== "undefined"
        ? window.confirm("You have unsaved changes. Discard them and close?")
        : true;
    if (!ok) return;
    onDiscardDirty();
    setIsOpen(false);
    onEditorClose?.();
  }, [isDirty, onDiscardDirty, onEditorClose]);

  return (
    // Spacing wrapper between the read-only banner, preview card, and any
    // popupExtras. Deliberately NOT `ui-stack-page` — see prior commit; the
    // preview has its own definite height so we don't need flex-fill.
    <div className={hidePreview ? "" : "flex flex-col gap-4"}>
      {!hidePreview && !canWrite && readOnlyMessage ? (
        <Alert variant="info">{readOnlyMessage}</Alert>
      ) : null}

      {!hidePreview ? (
        <Section
          contentClassName="flex flex-col"
          description={previewDescription}
          fill={false}
          title={title}
        >
          <div
            className="relative w-full overflow-hidden rounded-card border border-border bg-canvas"
            style={{ height: previewHeight }}
          >
            {mounted ? renderEditor({ mode: "preview", popupSession, requestEdit }) : null}
          </div>
        </Section>
      ) : null}

      <Popup
        closeOnBackdrop={false}
        contentClassName="!p-0"
        onClose={attemptClose}
        open={isOpen}
        size="full"
        subtitle={popupSubtitle}
        title={title}
      >
        {/* Pure passthrough — the canvas fills the popup edge-to-edge so
            its background (grid, satellite) keeps running behind the
            floating side panel. Editors offset their content + floating
            UI inwards using `usePanelOffset` from canvas/core; that one
            JS-animated value drives the world-transform centering, grid
            background position, and action-bar translation in lockstep
            so nothing drifts during the panel open/close animation. */}
        <div className="relative h-full w-full">
          {renderEditor({ mode: "full", popupSession, requestEdit })}
        </div>
      </Popup>

      {popupExtras}
    </div>
  );
}
