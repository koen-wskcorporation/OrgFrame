"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Plus, Settings2, X } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
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
  manageReturnHref
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

  const [isLoadingEditor, startLoadingEditor] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const autoOpenHandledRef = useRef(false);

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

    if (!pendingPath || pendingPath !== window.location.pathname) {
      return;
    }

    autoOpenHandledRef.current = true;
    sessionStorage.removeItem(ORG_SITE_OPEN_EDITOR_REQUEST_KEY);
    enterEditMode();
  }, [canEdit, enterEditMode]);

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

  const [settingsOpen, setSettingsOpen] = useState(false);

  const editorToolbar = canEdit && isEditing ? (
    <div className="flex flex-wrap items-center gap-2">
      {manageReturnHref ? (
        <Button href={manageReturnHref} size="md" variant="ghost">
          <ArrowLeft className="h-4 w-4" />
          Back to website manager
        </Button>
      ) : null}
      <Button onClick={() => setSettingsOpen(true)} size="md" type="button" variant="secondary">
        <Settings2 className="h-4 w-4" />
        Page settings
      </Button>
      <Button onClick={() => setLibraryOpen(true)} size="md" type="button" variant="secondary">
        <Plus className="h-4 w-4" />
        Add block
      </Button>
      <Button disabled={isSaving} onClick={cancelEditing} size="md" type="button" variant="ghost">
        <X className="h-4 w-4" />
        Cancel
      </Button>
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
