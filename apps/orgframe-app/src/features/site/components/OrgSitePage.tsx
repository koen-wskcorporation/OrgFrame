"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Plus, Settings2, X } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { Chip } from "@orgframe/ui/primitives/chip";
import { useToast } from "@orgframe/ui/primitives/toast";
import { createDefaultRuntimeBlock, getRuntimeBlockDefinition } from "@/src/features/site/blocks/runtime-registry";
import { loadOrgPageAction, saveOrgPageAction } from "@/src/features/site/actions";
import { PageSettingsWizardLauncher } from "@/src/features/site/components/PageSettingsWizardLauncher";
import {
  ORG_HEADER_EDITOR_TOOLBAR_SLOT_ID,
  ORG_SITE_EDITOR_STATE_EVENT,
  ORG_SITE_OPEN_BLOCK_LIBRARY_EVENT,
  ORG_SITE_OPEN_EDITOR_EVENT,
  ORG_SITE_OPEN_EDITOR_REQUEST_KEY,
  ORG_SITE_SET_EDITOR_EVENT
} from "@/src/features/site/events";
import { useUnsavedChangesWarning } from "@/src/features/site/hooks/useUnsavedChangesWarning";
import type { BlockContext, OrgPageBlock, OrgSiteBlockType, OrgSitePage as OrgSitePageType, OrgSiteRuntimeData } from "@/src/features/site/types";

const BlockLibraryDialog = dynamic(
  async () => (await import("@/src/features/site/components/BlockLibraryDialog")).BlockLibraryDialog,
  {
    ssr: false
  }
);

const BlockSettingsPanel = dynamic(
  async () => (await import("@/src/features/site/components/BlockSettingsPanel")).BlockSettingsPanel,
  {
    ssr: false
  }
);

const OrgPageEditor = dynamic(async () => (await import("@/src/features/site/components/OrgPageEditor")).OrgPageEditor, {
  ssr: false
});

type OrgSitePageProps = {
  orgSlug: string;
  orgName: string;
  pageSlug: string;
  initialPage: OrgSitePageType;
  initialBlocks: OrgPageBlock[];
  initialRuntimeData: OrgSiteRuntimeData;
  canEdit: boolean;
  /**
   * When set, the editor toolbar shows a "Back to website manager" button
   * linking here. Pass `/{orgSlug}/manage/website` to drop the editor user
   * back into the tree they came from.
   */
  manageReturnHref?: string;
  /**
   * Server-side signal that this mount should open straight into edit
   * mode. The routes at `/[orgSlug]/edit` and `/[orgSlug]/<slug>/edit`
   * pass `true`; the standard view routes pass undefined.
   */
  autoStartEditing?: boolean;
};

function updateDraftBlock(blocks: OrgPageBlock[], nextBlock: OrgPageBlock) {
  return blocks.map((block) => {
    if (block.id !== nextBlock.id) {
      return block;
    }

    return nextBlock;
  });
}

export function OrgSitePage({
  orgSlug,
  orgName,
  pageSlug,
  initialPage,
  initialBlocks,
  initialRuntimeData,
  canEdit,
  manageReturnHref,
  autoStartEditing
}: OrgSitePageProps) {
  const [page, setPage] = useState(initialPage);
  const [blocks, setBlocks] = useState(initialBlocks);
  const [runtimeData] = useState(initialRuntimeData);

  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(initialPage.title);
  const [draftIsPublished, setDraftIsPublished] = useState(initialPage.isPublished);
  const [draftBlocks, setDraftBlocks] = useState(initialBlocks);

  const [libraryOpen, setLibraryOpen] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  // Page-settings panel hosts the shared <PageWizard> the website manager
  // uses. We auto-open it whenever the user enters edit mode (see
  // `enterEditMode` below) so editing a page surface always brings up the
  // page settings pane by default.
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [isLoadingEditor, startLoadingEditor] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const autoOpenHandledRef = useRef(false);

  // Autosave state machine. Surfaced in the editor header via the
  // `<AutosaveChip>` so users can see whether their latest keystroke has
  // been persisted. The "saved" state lingers briefly after a successful
  // save before relaxing to "idle" (still green), giving the user a clear
  // visual confirmation pulse without nagging permanently.
  type AutosaveStatus = "idle" | "saving" | "saved" | "error";
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");

  const { toast } = useToast();

  const context: BlockContext = {
    orgSlug,
    orgName,
    pageSlug
  };

  const selectedBlock = useMemo(() => {
    if (!selectedBlockId) {
      return null;
    }

    return draftBlocks.find((block) => block.id === selectedBlockId) ?? null;
  }, [draftBlocks, selectedBlockId]);

  const enterEditMode = useCallback(() => {
    startLoadingEditor(async () => {
      const latest = await loadOrgPageAction({
        orgSlug,
        pageSlug
      });

      if (!latest.ok) {
        toast({
          title: "Unable to load editor",
          description: "Please refresh and try again.",
          variant: "destructive"
        });
        return;
      }

      if (!latest.canEdit) {
        toast({
          title: "Access denied",
          description: "You do not have edit access for this page.",
          variant: "destructive"
        });
        return;
      }

      setPage(latest.page);
      setBlocks(latest.blocks);
      setDraftTitle(latest.page.title);
      setDraftIsPublished(latest.page.isPublished);
      setDraftBlocks(latest.blocks);
      setSelectedBlockId(null);
      setIsEditing(true);
      // Always open the page-management panel when entering edit mode. The
      // panel hosts the same wizard the website manager uses, so the editor
      // and the website manager share one settings surface. The user can
      // dismiss it; we only auto-open on edit-mode entry, not every render.
      setSettingsOpen(true);
    });
  }, [orgSlug, pageSlug, startLoadingEditor, toast]);

  useEffect(() => {
    if (!canEdit) {
      return;
    }

    const onOpenEditor = (event: Event) => {
      const detail = (event as CustomEvent<{ pathname?: string }>).detail;

      if (detail?.pathname && detail.pathname !== window.location.pathname) {
        return;
      }

      enterEditMode();
    };

    window.addEventListener(ORG_SITE_OPEN_EDITOR_EVENT, onOpenEditor);

    return () => {
      window.removeEventListener(ORG_SITE_OPEN_EDITOR_EVENT, onOpenEditor);
    };
  }, [canEdit, enterEditMode]);

  useEffect(() => {
    if (!canEdit) {
      return;
    }

    const onSetEditor = (event: Event) => {
      const detail = (event as CustomEvent<{ pathname?: string; isEditing?: boolean }>).detail;

      if (detail?.pathname && detail.pathname !== window.location.pathname) {
        return;
      }

      if (detail?.isEditing) {
        enterEditMode();
        return;
      }

      cancelEditing();
    };

    window.addEventListener(ORG_SITE_SET_EDITOR_EVENT, onSetEditor);

    return () => {
      window.removeEventListener(ORG_SITE_SET_EDITOR_EVENT, onSetEditor);
    };
  }, [canEdit, enterEditMode]);

  useEffect(() => {
    if (!canEdit || autoOpenHandledRef.current) {
      return;
    }

    const pendingPath = sessionStorage.getItem(ORG_SITE_OPEN_EDITOR_REQUEST_KEY);
    if (!pendingPath) {
      return;
    }

    // Normalize both sides for the comparison: strip trailing slash + drop
    // any query/hash. The setter (OrgHeader, WebsiteManager) writes
    // pathname-only values, but a defensive normalize means the handshake
    // also works if a future caller stores `/foo/` or `/foo?bar=1`.
    const stripTrailing = (s: string) => (s.length > 1 && s.endsWith("/") ? s.slice(0, -1) : s);
    const normalize = (raw: string) => {
      const noQuery = raw.split("?")[0].split("#")[0];
      return stripTrailing(noQuery);
    };

    if (normalize(pendingPath) !== normalize(window.location.pathname)) {
      return;
    }

    autoOpenHandledRef.current = true;
    sessionStorage.removeItem(ORG_SITE_OPEN_EDITOR_REQUEST_KEY);
    enterEditMode();
  }, [canEdit, enterEditMode]);

  // Second auto-open path: the route mounted us at `/<slug>/edit` (or
  // `/orgSlug/edit` for home). The server signals this via the
  // `autoStartEditing` prop. We don't strip the segment from the URL —
  // staying on `/<slug>/edit` means a refresh inside the editor keeps
  // the editor open, which is the right default when the user explicitly
  // navigated to an edit URL.
  useEffect(() => {
    if (!canEdit || autoOpenHandledRef.current) return;
    if (!autoStartEditing) return;
    autoOpenHandledRef.current = true;
    enterEditMode();
  }, [autoStartEditing, canEdit, enterEditMode]);

  useEffect(() => {
    if (!canEdit) {
      return;
    }

    const onOpenBlockLibrary = (event: Event) => {
      const detail = (event as CustomEvent<{ pathname?: string }>).detail;

      if (detail?.pathname && detail.pathname !== window.location.pathname) {
        return;
      }

      if (!isEditing) {
        return;
      }

      setLibraryOpen(true);
    };

    window.addEventListener(ORG_SITE_OPEN_BLOCK_LIBRARY_EVENT, onOpenBlockLibrary);

    return () => {
      window.removeEventListener(ORG_SITE_OPEN_BLOCK_LIBRARY_EVENT, onOpenBlockLibrary);
    };
  }, [canEdit, isEditing]);

  useEffect(() => {
    if (!canEdit || typeof window === "undefined") {
      return;
    }

    window.dispatchEvent(
      new CustomEvent(ORG_SITE_EDITOR_STATE_EVENT, {
        detail: {
          pathname: window.location.pathname,
          isEditing,
          isInitializing: isLoadingEditor
        }
      })
    );

    return () => {
      window.dispatchEvent(
        new CustomEvent(ORG_SITE_EDITOR_STATE_EVENT, {
          detail: {
            pathname: window.location.pathname,
            isEditing: false,
            isInitializing: false
          }
        })
      );
    };
  }, [canEdit, isEditing, isLoadingEditor]);

  function cancelEditing() {
    setDraftTitle(page.title);
    setDraftIsPublished(page.isPublished);
    setDraftBlocks(blocks);
    setSelectedBlockId(null);
    setLibraryOpen(false);
    setIsEditing(false);
  }

  function saveDraft() {
    startSaving(async () => {
      const result = await saveOrgPageAction({
        orgSlug,
        pageSlug,
        title: draftTitle,
        isPublished: draftIsPublished,
        blocks: draftBlocks.map((block) => ({
          id: block.id,
          type: block.type,
          config: block.config
        }))
      });

      if (!result.ok) {
        toast({
          title: "Save failed",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setPage(result.page);
      setBlocks(result.blocks);
      setDraftTitle(result.page.title);
      setDraftIsPublished(result.page.isPublished);
      setDraftBlocks(result.blocks);
      setSelectedBlockId(null);
      setIsEditing(false);

      toast({
        title: "Page saved",
        description: "Changes are now live.",
        variant: "success"
      });
    });
  }

  function addBlock(type: OrgSiteBlockType) {
    setDraftBlocks((current) => {
      return [...current, createDefaultRuntimeBlock(type, context)];
    });
  }

  function removeBlock(blockId: string) {
    setDraftBlocks((current) => current.filter((block) => block.id !== blockId));

    if (selectedBlockId === blockId) {
      setSelectedBlockId(null);
    }
  }

  const viewBlocks = isEditing ? draftBlocks : blocks;
  const hasUnsavedChanges = useMemo(() => {
    if (!isEditing) {
      return false;
    }

    if (draftTitle !== page.title || draftIsPublished !== page.isPublished) {
      return true;
    }

    return JSON.stringify(draftBlocks) !== JSON.stringify(blocks);
  }, [blocks, draftBlocks, draftIsPublished, draftTitle, isEditing, page.isPublished, page.title]);

  useUnsavedChangesWarning({
    enabled: hasUnsavedChanges
  });

  // Debounced autosave. The effect schedules a flush ~800ms after the
  // user's last edit; any further edit before the timer fires resets it.
  // Refs hold the latest draft so the in-flight save always submits the
  // current state without re-creating the timer on every keystroke (which
  // would never let the debounce actually settle).
  const draftRef = useRef({ title: draftTitle, isPublished: draftIsPublished, blocks: draftBlocks });
  draftRef.current = { title: draftTitle, isPublished: draftIsPublished, blocks: draftBlocks };
  const inFlightAutosaveRef = useRef(false);
  const autosaveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushAutosave = useCallback(async () => {
    if (!canEdit || !isEditing) return;
    if (inFlightAutosaveRef.current) return;
    inFlightAutosaveRef.current = true;
    setAutosaveStatus("saving");
    const snapshot = draftRef.current;
    try {
      const result = await saveOrgPageAction({
        orgSlug,
        pageSlug,
        title: snapshot.title,
        isPublished: snapshot.isPublished,
        blocks: snapshot.blocks.map((block) => ({
          id: block.id,
          type: block.type,
          config: block.config
        }))
      });
      if (!result.ok) {
        setAutosaveStatus("error");
        return;
      }
      // Update the "committed" copies so `hasUnsavedChanges` recomputes to
      // false and the unsaved-changes warning detaches.
      setPage(result.page);
      setBlocks(result.blocks);
      setAutosaveStatus("saved");
      // Hold "saved" briefly so the user sees a confirmation flash, then
      // relax to idle (still rendered green — the chip's idle state IS
      // saved-and-quiet).
      if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
      savedFlashTimerRef.current = setTimeout(() => setAutosaveStatus("idle"), 1500);
    } catch {
      setAutosaveStatus("error");
    } finally {
      inFlightAutosaveRef.current = false;
    }
  }, [canEdit, isEditing, orgSlug, pageSlug]);

  useEffect(() => {
    if (!isEditing || !canEdit) return;
    if (!hasUnsavedChanges) return;
    if (autosaveDebounceRef.current) clearTimeout(autosaveDebounceRef.current);
    autosaveDebounceRef.current = setTimeout(() => {
      void flushAutosave();
    }, 800);
    return () => {
      if (autosaveDebounceRef.current) {
        clearTimeout(autosaveDebounceRef.current);
        autosaveDebounceRef.current = null;
      }
    };
  }, [canEdit, draftBlocks, draftIsPublished, draftTitle, flushAutosave, hasUnsavedChanges, isEditing]);

  // Clean up timers on unmount so a slow save doesn't try to mutate state
  // on a torn-down component.
  useEffect(() => {
    return () => {
      if (autosaveDebounceRef.current) clearTimeout(autosaveDebounceRef.current);
      if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
    };
  }, []);

  const [toolbarSlotEl, setToolbarSlotEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!canEdit || !isEditing) {
      setToolbarSlotEl(null);
      return;
    }

    let rafId = 0;
    const findSlot = () => {
      const el = document.getElementById(ORG_HEADER_EDITOR_TOOLBAR_SLOT_ID);
      if (el) {
        setToolbarSlotEl(el);
      } else {
        rafId = window.requestAnimationFrame(findSlot);
      }
    };
    findSlot();

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      setToolbarSlotEl(null);
    };
  }, [canEdit, isEditing]);

  const editorToolbar = canEdit && isEditing ? (
    <div className="flex flex-wrap items-center gap-2">
      {manageReturnHref ? (
        <Button href={manageReturnHref} size="md" variant="ghost">
          <ArrowLeft className="h-4 w-4" />
          Back to website manager
        </Button>
      ) : null}
      <AutosaveChip status={autosaveStatus} />
      <Button onClick={() => setSettingsOpen(true)} size="md" type="button" variant="secondary">
        <Settings2 className="h-4 w-4" />
        Page settings
      </Button>
      <Button onClick={() => setLibraryOpen(true)} size="md" type="button" variant="secondary">
        <Plus className="h-4 w-4" />
        Add block
      </Button>
      <Button intent="cancel" disabled={isSaving} onClick={cancelEditing} size="md" type="button" variant="secondary">Cancel</Button>
      <Button disabled={isSaving} loading={isSaving} onClick={saveDraft} size="md" type="button" variant="primary">
        Done
      </Button>
    </div>
  ) : null;

  return (
    <main>
      <div className="ui-stack-page">
        {!isEditing ? (
          <div className="ui-stack-page">
            {viewBlocks.map((block) => {
              const definition = getRuntimeBlockDefinition(block.type);
              const Render = definition.Render;

              return <Render block={block as never} context={context} isEditing={isEditing} key={block.id} runtimeData={runtimeData} />;
            })}
          </div>
        ) : (
          <>
            <OrgPageEditor
              blocks={draftBlocks}
              context={context}
              onChangeBlock={(next) => setDraftBlocks((current) => updateDraftBlock(current, next))}
              onChangeBlocks={setDraftBlocks}
              onRemoveBlock={removeBlock}
              onSelectBlock={setSelectedBlockId}
              runtimeData={runtimeData}
            />
            {draftBlocks.length === 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>No blocks yet</CardTitle>
                  <CardDescription>Add a block to start building this page.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={() => setLibraryOpen(true)} size="sm" variant="secondary">
                    Add block
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </>
        )}
      </div>

      <BlockLibraryDialog
        onClose={() => {
          setLibraryOpen(false);
        }}
        onSelect={addBlock}
        open={libraryOpen}
      />

      <BlockSettingsPanel
        block={selectedBlock}
        context={context}
        runtimeData={runtimeData}
        onChange={(nextBlock) => {
          setDraftBlocks((current) => updateDraftBlock(current, nextBlock));
        }}
        onClose={() => setSelectedBlockId(null)}
        open={Boolean(selectedBlock)}
      />

      {editorToolbar && toolbarSlotEl ? createPortal(editorToolbar, toolbarSlotEl) : null}

      <PageSettingsWizardLauncher
        onClose={() => setSettingsOpen(false)}
        open={canEdit && isEditing && settingsOpen}
        orgSlug={orgSlug}
        pageSlug={page.slug}
      />
    </main>
  );
}

/**
 * Header status chip for the page-editor autosave flow.
 *
 * - `idle` / `saved`: emerald "Saved" — the user's draft is in sync with the
 *   server.
 * - `saving`: amber "Saving…" — flush in progress (debounced 800ms after the
 *   last keystroke; see `flushAutosave` in `OrgSitePage`).
 * - `error`: rose "Save failed" — the most recent flush rejected; the next
 *   edit will retry.
 */
function AutosaveChip({ status }: { status: "idle" | "saving" | "saved" | "error" }) {
  if (status === "saving") {
    return (
      <Chip status variant="warning">
        Saving…
      </Chip>
    );
  }
  if (status === "error") {
    return (
      <Chip status variant="destructive">
        Save failed
      </Chip>
    );
  }
  // `idle` and `saved` both render as the same green chip; `saved` is just
  // the brief flash right after a successful flush before relaxing to idle.
  return (
    <Chip status variant="success">
      Saved
    </Chip>
  );
}
