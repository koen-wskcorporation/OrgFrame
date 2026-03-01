"use client";

import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Plus, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { createDefaultRuntimeBlock, getRuntimeBlockDefinition } from "@/modules/site-builder/blocks/runtime-registry";
import { loadOrgPageAction, saveOrgPageAction } from "@/modules/site-builder/actions";
import { ORG_SITE_EDITOR_STATE_EVENT, ORG_SITE_OPEN_EDITOR_EVENT, ORG_SITE_OPEN_EDITOR_REQUEST_KEY, ORG_SITE_SET_EDITOR_EVENT } from "@/modules/site-builder/events";
import { useUnsavedChangesWarning } from "@/modules/site-builder/hooks/useUnsavedChangesWarning";
import type { BlockContext, OrgPageBlock, OrgSiteBlockType, OrgSitePage as OrgSitePageType, OrgSiteRuntimeData } from "@/modules/site-builder/types";

const BlockLibraryDialog = dynamic(
  async () => (await import("@/modules/site-builder/components/BlockLibraryDialog")).BlockLibraryDialog,
  {
    ssr: false
  }
);

const BlockSettingsPanel = dynamic(
  async () => (await import("@/modules/site-builder/components/BlockSettingsPanel")).BlockSettingsPanel,
  {
    ssr: false
  }
);

const OrgPageEditor = dynamic(async () => (await import("@/modules/site-builder/components/OrgPageEditor")).OrgPageEditor, {
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
  canEdit
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
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);

  const [, startLoadingEditor] = useTransition();
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
    if (typeof document === "undefined") {
      return;
    }

    const syncHost = () => {
      setToolbarHost(document.getElementById("org-page-editor-toolbar-host"));
    };

    syncHost();
    const frameId = window.requestAnimationFrame(syncHost);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isEditing]);

  useEffect(() => {
    if (!canEdit || typeof window === "undefined") {
      return;
    }

    window.dispatchEvent(
      new CustomEvent(ORG_SITE_EDITOR_STATE_EVENT, {
        detail: {
          pathname: window.location.pathname,
          isEditing
        }
      })
    );

    return () => {
      window.dispatchEvent(
        new CustomEvent(ORG_SITE_EDITOR_STATE_EVENT, {
          detail: {
            pathname: window.location.pathname,
            isEditing: false
          }
        })
      );
    };
  }, [canEdit, isEditing]);

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

  const editorToolbar = canEdit && isEditing ? (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        className="h-9 w-[260px]"
        onChange={(event) => {
          setDraftTitle(event.target.value);
        }}
        value={draftTitle}
      />
      <label className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-1.5 text-sm">
        <Checkbox
          checked={draftIsPublished}
          onChange={(event) => {
            setDraftIsPublished(event.target.checked);
          }}
        />
        Published
      </label>
      <Button onClick={() => setLibraryOpen(true)} size="sm" variant="secondary">
        <Plus className="h-4 w-4" />
        Add block
      </Button>
      <Button disabled={isSaving} loading={isSaving} onClick={saveDraft} size="sm">
        <Save className="h-4 w-4" />
        {isSaving ? "Saving..." : "Save"}
      </Button>
      <Button disabled={isSaving} onClick={cancelEditing} size="sm" variant="ghost">
        <X className="h-4 w-4" />
        Cancel
      </Button>
      {hasUnsavedChanges ? (
        <span className="ml-auto rounded-control border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-text">Unsaved changes</span>
      ) : null}
    </div>
  ) : null;

  return (
    <main className="app-container pb-10 pt-0 md:pb-10 md:pt-0">
      <div className="space-y-6">
        {!isEditing ? (
          <div className="space-y-6">
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

      {editorToolbar ? (toolbarHost ? createPortal(editorToolbar, toolbarHost) : editorToolbar) : null}
    </main>
  );
}
