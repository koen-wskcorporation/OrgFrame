"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  ExternalLink,
  FolderTree,
  Indent,
  MoreHorizontal,
  Outdent,
  Pencil,
  Plus,
  Trash2,
  X
} from "lucide-react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Badge } from "@orgframe/ui/primitives/chip";
import { Button } from "@orgframe/ui/primitives/button";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { useConfirmDialog } from "@orgframe/ui/primitives/confirm-dialog";
import { Repeater, type RepeaterDragHandle } from "@orgframe/ui/primitives/repeater";
import { RepeaterItem } from "@orgframe/ui/primitives/repeater-item";
import { Textarea } from "@orgframe/ui/primitives/textarea";
import { EditorSettingsDialog } from "@/src/features/core/layout/components/EditorSettingsDialog";
import type { OrgManagePage, OrgSiteStructureItem } from "@/src/features/site/types";
import {
  createWebsiteDropdownAction,
  createWebsiteExternalLinkAction,
  deleteWebsiteItemAction,
  reorderWebsiteItemsAction,
  updateWebsiteItemAction,
  type WebsiteManagerActionResult
} from "@/src/features/site/websiteManagerActions";
import { PageWizard } from "./PageWizard";

type FlatRow = {
  item: OrgSiteStructureItem;
  depth: number;
  hasChildren: boolean;
};

type AddDialogKind = "dropdown" | "link" | null;
type AddItemKind = "page" | "dropdown" | "link";

type Props = {
  canWrite: boolean;
  initialItems: OrgSiteStructureItem[];
  initialPages: OrgManagePage[];
  orgSlug: string;
};

function getLinkKind(item: OrgSiteStructureItem): "page" | "external" | "dynamic" | "none" {
  const kind = typeof item.linkTargetJson?.kind === "string" ? (item.linkTargetJson.kind as string) : "none";
  if (kind === "page" || kind === "external" || kind === "dynamic") return kind;
  return "none";
}

function getLinkedPageSlug(item: OrgSiteStructureItem): string | null {
  if (getLinkKind(item) !== "page") return null;
  const slug = item.linkTargetJson?.pageSlug;
  return typeof slug === "string" ? slug : null;
}

function getExternalUrl(item: OrgSiteStructureItem): string | null {
  if (getLinkKind(item) !== "external") return null;
  const url = item.linkTargetJson?.url;
  return typeof url === "string" ? url : null;
}

function isLocked(item: OrgSiteStructureItem): boolean {
  return item.flagsJson?.locked === true || item.flagsJson?.systemGenerated === true;
}

function buildFlatTree(items: OrgSiteStructureItem[]): FlatRow[] {
  const byParent = new Map<string | null, OrgSiteStructureItem[]>();
  for (const item of items) {
    const list = byParent.get(item.parentId) ?? [];
    list.push(item);
    byParent.set(item.parentId, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.orderIndex - b.orderIndex || a.title.localeCompare(b.title));
  }
  const out: FlatRow[] = [];
  const walk = (parentId: string | null, depth: number) => {
    const list = byParent.get(parentId) ?? [];
    for (const item of list) {
      const children = byParent.get(item.id) ?? [];
      out.push({ item, depth, hasChildren: children.length > 0 });
      walk(item.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

type BadgeVariant = "neutral" | "success" | "warning" | "destructive";
function rowTypeLabel(item: OrgSiteStructureItem): { label: string; variant: BadgeVariant } {
  if (item.type === "dynamic") return { label: "Dynamic", variant: "neutral" };
  if (item.type === "placeholder") return { label: "Dropdown", variant: "neutral" };
  const link = getLinkKind(item);
  if (link === "external") return { label: "Link", variant: "neutral" };
  return { label: "Page", variant: "neutral" };
}

type WebsiteManagerContextValue = {
  canWrite: boolean;
  orgSlug: string;
  items: OrgSiteStructureItem[];
  pages: OrgManagePage[];
  visibleFlat: FlatRow[];
  collapsed: Set<string>;
  pending: boolean;
  error: string | null;
  setError: (next: string | null) => void;
  toggleCollapse: (id: string) => void;
  toggleField: (item: OrgSiteStructureItem, patch: { showInMenu?: boolean; isPublished?: boolean }) => void;
  indent: (item: OrgSiteStructureItem) => void;
  outdent: (item: OrgSiteStructureItem) => void;
  handleDelete: (item: OrgSiteStructureItem) => void | Promise<void>;
  handleReorder: (orderedIds: string[]) => void;
  openAdd: (kind: AddItemKind, parentId: string | null) => void;
  // Dialog plumbing — read by the Body so dialogs render alongside the tree.
  addDialog: AddDialogKind;
  addParentId: string | null;
  wizardOpen: boolean;
  wizardParentId: string | null;
  editingItem: OrgSiteStructureItem | null;
  setEditingItem: (item: OrgSiteStructureItem | null) => void;
  closeAdd: () => void;
  closeWizard: () => void;
  applyResult: (res: WebsiteManagerActionResult) => void;
  startTransition: React.TransitionStartFunction;
};

const WebsiteManagerContext = React.createContext<WebsiteManagerContextValue | null>(null);

function useWebsiteManager(): WebsiteManagerContextValue {
  const ctx = React.useContext(WebsiteManagerContext);
  if (!ctx) {
    throw new Error("WebsiteManagerActions/Body must be rendered inside WebsiteManagerProvider.");
  }
  return ctx;
}

export function WebsiteManagerProvider({
  canWrite,
  initialItems,
  initialPages,
  orgSlug,
  children
}: Props & { children: React.ReactNode }) {
  const router = useRouter();
  const confirm = useConfirmDialog().confirm;
  const [items, setItems] = React.useState(initialItems);
  const [pages, setPages] = React.useState(initialPages);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const [addDialog, setAddDialog] = React.useState<AddDialogKind>(null);
  const [addParentId, setAddParentId] = React.useState<string | null>(null);
  const [wizardParentId, setWizardParentId] = React.useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [editingItem, setEditingItem] = React.useState<OrgSiteStructureItem | null>(null);

  const flat = React.useMemo(() => buildFlatTree(items), [items]);
  const visibleFlat = React.useMemo(() => {
    const hidden = new Set<string>();
    const out: FlatRow[] = [];
    for (const row of flat) {
      if (row.item.parentId && hidden.has(row.item.parentId)) {
        hidden.add(row.item.id);
        continue;
      }
      out.push(row);
      if (collapsed.has(row.item.id)) {
        hidden.add(row.item.id);
      }
    }
    return out;
  }, [flat, collapsed]);

  const itemsById = React.useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const applyResult = (result: WebsiteManagerActionResult) => {
    if (result.ok) {
      setItems(result.snapshot.items);
      setPages(result.snapshot.pages);
      setError(null);
      router.refresh();
    } else {
      setError(result.error);
    }
  };

  const persistOrder = React.useCallback(
    (nextItems: OrgSiteStructureItem[]) => {
      const payload = nextItems.map((item) => ({
        id: item.id,
        parentId: item.parentId,
        sortIndex: item.orderIndex
      }));
      startTransition(async () => {
        const res = await reorderWebsiteItemsAction({ orgSlug, items: payload });
        applyResult(res);
      });
    },
    [orgSlug]
  );

  const handleReorder = (orderedIds: string[]) => {
    // Repeater drag-and-drop. Only same-parent moves are accepted; cross-parent
    // drags fall back to indent/outdent buttons.
    const visibleIds = visibleFlat.map((r) => r.item.id);
    const oldOrder = visibleIds;
    let movedId: string | null = null;
    let newIndex = -1;
    for (let i = 0; i < orderedIds.length; i += 1) {
      if (orderedIds[i] !== oldOrder[i]) {
        movedId = orderedIds[i];
        newIndex = i;
        break;
      }
    }
    if (!movedId || newIndex === -1) return;
    const moved = itemsById.get(movedId);
    if (!moved) return;

    // Find the destination's neighbours from the new order, using only siblings
    // of the moved item to determine the new sortIndex within its parent.
    const siblings = items.filter((i) => i.parentId === moved.parentId).sort((a, b) => a.orderIndex - b.orderIndex);
    const siblingIds = siblings.map((s) => s.id);
    // Build a new sibling order from the dragged sequence, restricted to siblings.
    const reorderedSiblingIds = orderedIds.filter((id) => siblingIds.includes(id));
    if (reorderedSiblingIds.length !== siblings.length) {
      setError("Drag only reorders within the same level. Use the indent buttons to move between levels.");
      return;
    }
    const next = items.map((it) => {
      if (it.parentId !== moved.parentId) return it;
      const idx = reorderedSiblingIds.indexOf(it.id);
      return idx === -1 ? it : { ...it, orderIndex: idx };
    });
    setItems(next);
    persistOrder(next);
  };

  const indent = (item: OrgSiteStructureItem) => {
    const siblings = items.filter((i) => i.parentId === item.parentId).sort((a, b) => a.orderIndex - b.orderIndex);
    const myIndex = siblings.findIndex((s) => s.id === item.id);
    if (myIndex <= 0) {
      setError("Nothing above this item to nest under.");
      return;
    }
    const newParent = siblings[myIndex - 1];
    if (newParent.type === "dynamic") {
      setError("Cannot nest under a dynamic item.");
      return;
    }
    const newSiblings = items.filter((i) => i.parentId === newParent.id);
    const next = items.map((it) => {
      if (it.id !== item.id) return it;
      return { ...it, parentId: newParent.id, orderIndex: newSiblings.length };
    });
    setItems(next);
    persistOrder(next);
  };

  const outdent = (item: OrgSiteStructureItem) => {
    if (!item.parentId) {
      setError("Already at the top level.");
      return;
    }
    const parent = itemsById.get(item.parentId);
    if (!parent) return;
    const grandparentId = parent.parentId;
    const newSiblings = items.filter((i) => i.parentId === grandparentId).sort((a, b) => a.orderIndex - b.orderIndex);
    const parentIndex = newSiblings.findIndex((s) => s.id === parent.id);
    const insertAt = parentIndex === -1 ? newSiblings.length : parentIndex + 1;
    const reordered = [...newSiblings];
    const next = items.map((it) => {
      if (it.id !== item.id) return it;
      return { ...it, parentId: grandparentId };
    });
    // Re-number siblings of grandparent
    const grandSiblingsAfter = next.filter((i) => i.parentId === grandparentId && i.id !== item.id).sort((a, b) => a.orderIndex - b.orderIndex);
    grandSiblingsAfter.splice(insertAt, 0, next.find((i) => i.id === item.id)!);
    const renumbered = next.map((it) => {
      if (it.parentId !== grandparentId) return it;
      const idx = grandSiblingsAfter.findIndex((g) => g.id === it.id);
      return idx === -1 ? it : { ...it, orderIndex: idx };
    });
    void reordered;
    setItems(renumbered);
    persistOrder(renumbered);
  };

  const toggleField = (item: OrgSiteStructureItem, patch: { showInMenu?: boolean; isPublished?: boolean }) => {
    startTransition(async () => {
      const res = await updateWebsiteItemAction({ orgSlug, itemId: item.id, patch });
      applyResult(res);
    });
  };

  const handleDelete = async (item: OrgSiteStructureItem) => {
    const linkedSlug = getLinkedPageSlug(item);
    let alsoDeletePage = false;
    if (item.type === "page" && linkedSlug && linkedSlug !== "home") {
      alsoDeletePage = await confirm({
        title: `Delete "${item.title}"`,
        description:
          "Also delete the underlying page (with all its blocks)? Choose Cancel to keep the page but remove it from navigation.",
        confirmLabel: "Delete page + content",
        cancelLabel: "Just remove from nav",
        variant: "destructive"
      });
      if (!alsoDeletePage) {
        const removeOnly = await confirm({
          title: `Remove "${item.title}" from navigation`,
          description: "The underlying page and its blocks will be kept.",
          confirmLabel: "Remove",
          cancelLabel: "Cancel",
          variant: "destructive"
        });
        if (!removeOnly) return;
      }
    } else {
      const ok = await confirm({
        title: `Delete "${item.title}"`,
        description: "This cannot be undone.",
        confirmLabel: "Delete",
        cancelLabel: "Cancel",
        variant: "destructive"
      });
      if (!ok) return;
    }
    startTransition(async () => {
      const res = await deleteWebsiteItemAction({ orgSlug, itemId: item.id, alsoDeletePage });
      applyResult(res);
    });
  };

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openAdd = (kind: AddItemKind, parentId: string | null) => {
    if (kind === "page") {
      setWizardParentId(parentId);
      setWizardOpen(true);
      return;
    }
    setAddDialog(kind);
    setAddParentId(parentId);
  };

  const closeAdd = () => {
    setAddDialog(null);
    setAddParentId(null);
  };

  const closeWizard = () => {
    setWizardOpen(false);
    setWizardParentId(null);
  };

  const value: WebsiteManagerContextValue = {
    canWrite,
    orgSlug,
    items,
    pages,
    visibleFlat,
    collapsed,
    pending,
    error,
    setError,
    toggleCollapse,
    toggleField,
    indent,
    outdent,
    handleDelete,
    handleReorder,
    openAdd,
    addDialog,
    addParentId,
    wizardOpen,
    wizardParentId,
    editingItem,
    setEditingItem,
    closeAdd,
    closeWizard,
    applyResult,
    startTransition
  };

  return <WebsiteManagerContext.Provider value={value}>{children}</WebsiteManagerContext.Provider>;
}

/**
 * Three "New …" buttons. Slot into a `<ManageSection actions={…}>` so they
 * land in the section header. Must be rendered inside `WebsiteManagerProvider`.
 */
export function WebsiteManagerActions() {
  const { canWrite, openAdd } = useWebsiteManager();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button disabled={!canWrite} onClick={() => openAdd("page", null)} size="sm">
        <Plus className="h-4 w-4" />
        New page
      </Button>
      <Button disabled={!canWrite} onClick={() => openAdd("dropdown", null)} size="sm" variant="secondary">
        <FolderTree className="h-4 w-4" />
        New dropdown
      </Button>
      <Button disabled={!canWrite} onClick={() => openAdd("link", null)} size="sm" variant="secondary">
        <ExternalLink className="h-4 w-4" />
        New external link
      </Button>
    </div>
  );
}

/**
 * The tree (rendered via Repeater) plus the modals that read from manager
 * state. Render as the children of the section that hosts `WebsiteManagerActions`.
 */
export function WebsiteManagerBody() {
  const ctx = useWebsiteManager();
  const {
    addDialog,
    addParentId,
    applyResult,
    canWrite,
    closeAdd,
    closeWizard,
    collapsed,
    editingItem,
    error,
    handleDelete,
    handleReorder,
    indent,
    items,
    openAdd,
    orgSlug,
    outdent,
    pages,
    pending,
    setEditingItem,
    setError,
    startTransition,
    toggleCollapse,
    toggleField,
    visibleFlat,
    wizardOpen,
    wizardParentId
  } = ctx;

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <div className="flex items-start justify-between gap-3">
            <span>{error}</span>
            <Button aria-label="Dismiss" iconOnly onClick={() => setError(null)} variant="ghost">
              <X />
            </Button>
          </div>
        </Alert>
      ) : null}

      <Repeater<FlatRow>
        disableSearch
        disableViewToggle
        emptyMessage={
          <span>
            No pages yet. Click <span className="font-semibold text-text">New page</span> to get started.
          </span>
        }
        fixedView="list"
        getItemId={(row) => row.item.id}
        getSearchValue={(row) => row.item.title}
        items={visibleFlat}
        onReorder={canWrite ? handleReorder : undefined}
        renderItem={({ item: row, drag }) => (
          <TreeRow
            canWrite={canWrite}
            collapsed={collapsed.has(row.item.id)}
            drag={drag}
            onAddChild={(kind) => openAdd(kind, row.item.id)}
            onDelete={() => handleDelete(row.item)}
            onEdit={() => setEditingItem(row.item)}
            onIndent={() => indent(row.item)}
            onOutdent={() => outdent(row.item)}
            onToggleCollapse={() => toggleCollapse(row.item.id)}
            onTogglePublished={() => toggleField(row.item, { isPublished: !row.item.isPublished })}
            onToggleShowInMenu={() => toggleField(row.item, { showInMenu: !row.item.showInMenu })}
            orgSlug={orgSlug}
            pending={pending}
            row={row}
          />
        )}
        reorderable={canWrite}
      />

      <AddItemDialog
        kind={addDialog}
        onClose={closeAdd}
        onResult={(res) => {
          applyResult(res);
          if (res.ok) closeAdd();
        }}
        orgSlug={orgSlug}
        parentId={addParentId}
        pending={pending}
        startTransition={startTransition}
      />

      <PageWizard
        defaultParentId={wizardParentId}
        mode="create"
        onClose={closeWizard}
        onResult={(res) => {
          applyResult(res);
          if (res.ok) closeWizard();
        }}
        open={wizardOpen}
        orgSlug={orgSlug}
        parentItems={items}
      />

      {editingItem && editingItem.type === "page" ? (
        <PageWizard
          editingItem={editingItem}
          editingPage={
            (() => {
              const linked = editingItem.linkTargetJson?.pageSlug;
              if (typeof linked !== "string") return null;
              return pages.find((p) => p.slug === linked) ?? null;
            })()
          }
          mode="edit"
          onClose={() => setEditingItem(null)}
          onResult={(res) => {
            applyResult(res);
            if (res.ok) setEditingItem(null);
          }}
          open={Boolean(editingItem)}
          orgSlug={orgSlug}
          parentItems={items}
        />
      ) : null}

      <EditItemDialog
        initialPages={pages}
        item={editingItem && editingItem.type !== "page" ? editingItem : null}
        onClose={() => setEditingItem(null)}
        onResult={(res) => {
          applyResult(res);
          if (res.ok) setEditingItem(null);
        }}
        orgSlug={orgSlug}
        pending={pending}
        startTransition={startTransition}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// TreeRow
// ---------------------------------------------------------------------------

type TreeRowProps = {
  canWrite: boolean;
  collapsed: boolean;
  drag?: RepeaterDragHandle;
  onAddChild: (kind: AddItemKind) => void;
  onDelete: () => void;
  onEdit: () => void;
  onIndent: () => void;
  onOutdent: () => void;
  onToggleCollapse: () => void;
  onTogglePublished: () => void;
  onToggleShowInMenu: () => void;
  orgSlug: string;
  pending: boolean;
  row: FlatRow;
};

function TreeRow({
  canWrite,
  collapsed,
  drag,
  onAddChild,
  onDelete,
  onEdit,
  onIndent,
  onOutdent,
  onToggleCollapse,
  onTogglePublished,
  onToggleShowInMenu,
  orgSlug,
  pending,
  row
}: TreeRowProps) {
  const { item, depth, hasChildren } = row;
  const setNodeRef = drag?.setNodeRef;
  const dragStyle = drag?.style;
  const DragHandle = drag?.Handle;
  const typeLabel = rowTypeLabel(item);
  const linkedPageSlug = getLinkedPageSlug(item);
  const externalUrl = getExternalUrl(item);
  const locked = isLocked(item);
  const editorHref =
    item.type === "page" && linkedPageSlug
      ? linkedPageSlug === "home"
        ? `/${orgSlug}`
        : `/${orgSlug}/${linkedPageSlug}`
      : null;
  const [actionsOpen, setActionsOpen] = React.useState(false);

  const titleNode = editorHref ? (
    <Link className="truncate text-text hover:underline" href={editorHref}>
      {item.title}
    </Link>
  ) : externalUrl ? (
    <a className="truncate text-text hover:underline" href={externalUrl} rel="noopener noreferrer" target="_blank">
      {item.title}
    </a>
  ) : (
    <span className="truncate">{item.title}</span>
  );

  const metaText =
    item.type === "page" && externalUrl
      ? externalUrl
      : item.type === "page" && linkedPageSlug
      ? linkedPageSlug === "home"
        ? `/${orgSlug}`
        : `/${orgSlug}/${linkedPageSlug}`
      : item.type === "placeholder"
      ? "Dropdown — no link"
      : item.urlPath || "—";

  const leading = (
    <div className="flex items-center gap-1">
      <span aria-hidden className="flex-none" style={{ width: depth * 16 }} />
      {hasChildren ? (
        <Button aria-label={collapsed ? "Expand" : "Collapse"} iconOnly onClick={onToggleCollapse} variant="ghost">
          {collapsed ? <ChevronRight /> : <ChevronDown />}
        </Button>
      ) : (
        <span aria-hidden className="inline-block h-8 w-8" />
      )}
      {DragHandle ? <DragHandle aria-label="Drag to reorder" disabled={!canWrite || locked} /> : null}
    </div>
  );

  const chips = (
    <>
      <Badge variant={typeLabel.variant}>{typeLabel.label}</Badge>
      {!item.isPublished ? <Badge variant="warning">Draft</Badge> : null}
      {!item.showInMenu ? <Badge variant="neutral">Hidden in nav</Badge> : null}
      {locked ? <Badge variant="neutral">Locked</Badge> : null}
    </>
  );

  const secondaryActions = (
    <div className="flex items-center gap-0.5">
      <Button
        aria-label={item.isPublished ? "Unpublish" : "Publish"}
        disabled={!canWrite || pending || locked}
        iconOnly
        onClick={onTogglePublished}
        title={item.isPublished ? "Published" : "Draft"}
        variant="ghost"
      >
        {item.isPublished ? <Eye /> : <EyeOff className="text-text-muted" />}
      </Button>
      <Button
        aria-label={item.showInMenu ? "Hide from nav" : "Show in nav"}
        disabled={!canWrite || pending || locked}
        iconOnly
        onClick={onToggleShowInMenu}
        title={item.showInMenu ? "Visible in nav" : "Hidden from nav"}
        variant="ghost"
      >
        <FolderTree className={item.showInMenu ? "" : "text-text-muted opacity-50"} />
      </Button>
      <Button
        aria-label="Outdent"
        disabled={!canWrite || pending || locked || !item.parentId}
        iconOnly
        onClick={onOutdent}
        title="Move out one level"
        variant="ghost"
      >
        <Outdent />
      </Button>
      <Button
        aria-label="Indent"
        disabled={!canWrite || pending || locked}
        iconOnly
        onClick={onIndent}
        title="Nest under previous item"
        variant="ghost"
      >
        <Indent />
      </Button>
    </div>
  );

  const primaryAction = (
    <div className="flex items-center gap-0.5">
      <Button aria-label="Edit" disabled={!canWrite || locked} iconOnly onClick={onEdit} variant="ghost">
        <Pencil />
      </Button>
      <div className="relative">
        <Button aria-label="More" disabled={!canWrite || locked} iconOnly onClick={() => setActionsOpen((v) => !v)} variant="ghost">
          <MoreHorizontal />
        </Button>
        {actionsOpen ? (
          <div
            className="absolute right-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-md border border-border bg-surface shadow-lg"
            onMouseLeave={() => setActionsOpen(false)}
          >
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted"
              onClick={() => {
                setActionsOpen(false);
                onAddChild("page");
              }}
              type="button"
            >
              <Plus className="h-3.5 w-3.5" /> Add page below
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted"
              onClick={() => {
                setActionsOpen(false);
                onAddChild("dropdown");
              }}
              type="button"
            >
              <FolderTree className="h-3.5 w-3.5" /> Add dropdown below
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted"
              onClick={() => {
                setActionsOpen(false);
                onAddChild("link");
              }}
              type="button"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Add link below
            </button>
            <div className="border-t border-border" />
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-status-danger hover:bg-surface-muted"
              onClick={() => {
                setActionsOpen(false);
                onDelete();
              }}
              type="button"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <div ref={setNodeRef} style={dragStyle}>
      <RepeaterItem
        chips={chips}
        id={item.id}
        leading={leading}
        meta={metaText}
        primaryAction={primaryAction}
        secondaryActions={secondaryActions}
        title={titleNode}
        view="list"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add dialog
// ---------------------------------------------------------------------------

type AddDialogProps = {
  kind: AddDialogKind;
  onClose: () => void;
  onResult: (res: WebsiteManagerActionResult) => void;
  orgSlug: string;
  parentId: string | null;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
};

function AddItemDialog({ kind, onClose, onResult, orgSlug, parentId, pending, startTransition }: AddDialogProps) {
  const [title, setTitle] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [openInNewTab, setOpenInNewTab] = React.useState(true);

  React.useEffect(() => {
    if (kind) {
      setTitle("");
      setUrl("");
      setOpenInNewTab(true);
    }
  }, [kind]);

  const submit = () => {
    if (!title.trim()) return;
    startTransition(async () => {
      let res: WebsiteManagerActionResult;
      if (kind === "dropdown") {
        res = await createWebsiteDropdownAction({ orgSlug, parentId, title });
      } else if (kind === "link") {
        res = await createWebsiteExternalLinkAction({ orgSlug, parentId, title, url, openInNewTab });
      } else {
        return;
      }
      onResult(res);
    });
  };

  const titleText = kind === "dropdown" ? "New dropdown" : kind === "link" ? "New external link" : "";
  const description =
    kind === "dropdown"
      ? "A header dropdown that groups child links. It has no link of its own."
      : kind === "link"
      ? "A nav item that links to an external URL."
      : "";

  return (
    <EditorSettingsDialog
      description={description}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button disabled={pending || !title.trim() || (kind === "link" && !url.trim())} onClick={submit}>
            Create
          </Button>
        </div>
      }
      onClose={onClose}
      open={Boolean(kind)}
      size="md"
      title={titleText}
    >
      <div className="space-y-4">
        <FormField htmlFor="add-title" label="Title">
          <Input autoFocus id="add-title" onChange={(e) => setTitle(e.target.value)} value={title} />
        </FormField>
        {kind === "link" ? (
          <>
            <FormField htmlFor="add-url" label="URL">
              <Input id="add-url" onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" value={url} />
            </FormField>
            <label className="flex items-center gap-2 text-sm">
              <input checked={openInNewTab} onChange={(e) => setOpenInNewTab(e.target.checked)} type="checkbox" />
              Open in new tab
            </label>
          </>
        ) : null}
      </div>
    </EditorSettingsDialog>
  );
}

// ---------------------------------------------------------------------------
// Edit dialog
// ---------------------------------------------------------------------------

type EditDialogProps = {
  item: OrgSiteStructureItem | null;
  onClose: () => void;
  onResult: (res: WebsiteManagerActionResult) => void;
  orgSlug: string;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
};

function EditItemDialog({ item, initialPages, onClose, onResult, orgSlug, pending, startTransition }: EditDialogProps & { initialPages: OrgManagePage[] }) {
  const linkKind = item ? getLinkKind(item) : "none";
  const linkedSlug = item ? getLinkedPageSlug(item) : null;
  const initialUrl = item ? getExternalUrl(item) ?? "" : "";
  const linkedPage = React.useMemo(
    () => (linkedSlug ? initialPages.find((p) => p.slug === linkedSlug) ?? null : null),
    [linkedSlug, initialPages]
  );

  const [title, setTitle] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [externalUrl, setExternalUrl] = React.useState("");
  const [openInNewTab, setOpenInNewTab] = React.useState(false);
  const [isPublished, setIsPublished] = React.useState(true);
  const [showInMenu, setShowInMenu] = React.useState(true);
  const [seoTitle, setSeoTitle] = React.useState("");
  const [metaDescription, setMetaDescription] = React.useState("");
  const [ogImagePath, setOgImagePath] = React.useState("");
  const [showSeo, setShowSeo] = React.useState(false);

  React.useEffect(() => {
    if (!item) return;
    setTitle(item.title);
    setSlug(linkedSlug ?? "");
    setDescription(item.description ?? "");
    setExternalUrl(initialUrl);
    setOpenInNewTab(item.openInNewTab);
    setIsPublished(item.isPublished);
    setShowInMenu(item.showInMenu);
    setSeoTitle(linkedPage?.seoTitle ?? "");
    setMetaDescription(linkedPage?.metaDescription ?? "");
    setOgImagePath(linkedPage?.ogImagePath ?? "");
    setShowSeo(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  if (!item) {
    return (
      <EditorSettingsDialog onClose={onClose} open={false} size="md" title="">
        <div />
      </EditorSettingsDialog>
    );
  }

  const submit = () => {
    if (!title.trim()) return;
    startTransition(async () => {
      const patch: Parameters<typeof updateWebsiteItemAction>[0]["patch"] = {
        title,
        description: description || null,
        isPublished,
        showInMenu,
        openInNewTab
      };
      if (linkKind === "page" && slug && slug !== linkedSlug) {
        patch.slug = slug;
      }
      if (linkKind === "external" && externalUrl) {
        patch.externalUrl = externalUrl;
      }
      if (linkKind === "page") {
        patch.seoTitle = seoTitle.trim() || null;
        patch.metaDescription = metaDescription.trim() || null;
        patch.ogImagePath = ogImagePath.trim() || null;
      }
      const res = await updateWebsiteItemAction({ orgSlug, itemId: item.id, patch });
      onResult(res);
    });
  };

  return (
    <EditorSettingsDialog
      description="Edit title, URL, and visibility."
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} size="sm" variant="ghost">
            Cancel
          </Button>
          <Button disabled={pending || !title.trim()} onClick={submit} size="sm">
            Save
          </Button>
        </div>
      }
      onClose={onClose}
      open={Boolean(item)}
      size="md"
      title={`Edit "${item.title}"`}
    >
      <div className="space-y-4">
        <FormField htmlFor="edit-title" label="Title">
          <Input id="edit-title" onChange={(e) => setTitle(e.target.value)} value={title} />
        </FormField>
        {linkKind === "page" && linkedSlug && linkedSlug !== "home" ? (
          <FormField
            hint="Changing the URL renames the public path. Update any saved links."
            htmlFor="edit-slug"
            label="URL slug"
          >
            <Input id="edit-slug" onChange={(e) => setSlug(e.target.value)} persistentPrefix={`/${orgSlug}/`} value={slug} />
          </FormField>
        ) : null}
        {linkKind === "external" ? (
          <FormField htmlFor="edit-url" label="URL">
            <Input id="edit-url" onChange={(e) => setExternalUrl(e.target.value)} value={externalUrl} />
          </FormField>
        ) : null}
        <FormField hint="Optional. Used for SEO meta description on linked pages." htmlFor="edit-description" label="Description">
          <Textarea
            id="edit-description"
            maxLength={500}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            value={description}
          />
        </FormField>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} type="checkbox" />
            Published
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input checked={showInMenu} onChange={(e) => setShowInMenu(e.target.checked)} type="checkbox" />
            Show in navigation
          </label>
          {linkKind === "external" ? (
            <label className="flex items-center gap-2 text-sm">
              <input checked={openInNewTab} onChange={(e) => setOpenInNewTab(e.target.checked)} type="checkbox" />
              Open in new tab
            </label>
          ) : null}
        </div>
        {linkKind === "page" ? (
          <div className="rounded-md border border-border">
            <button
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium hover:bg-surface-muted"
              onClick={() => setShowSeo((v) => !v)}
              type="button"
            >
              <span>SEO &amp; sharing</span>
              {showSeo ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            {showSeo ? (
              <div className="space-y-3 border-t border-border px-3 py-3">
                <FormField hint="Overrides the page title in browser tabs and search results." htmlFor="seo-title" label="SEO title">
                  <Input
                    id="seo-title"
                    maxLength={120}
                    onChange={(e) => setSeoTitle(e.target.value)}
                    placeholder={title}
                    value={seoTitle}
                  />
                </FormField>
                <FormField
                  hint="Shown under the title in Google results and link previews. Aim for 150–160 characters."
                  htmlFor="meta-description"
                  label="Meta description"
                >
                  <Textarea
                    id="meta-description"
                    maxLength={320}
                    onChange={(e) => setMetaDescription(e.target.value)}
                    rows={3}
                    value={metaDescription}
                  />
                </FormField>
                <FormField
                  hint="Path to the share image (e.g. uploaded image path). 1200×630 works best."
                  htmlFor="og-image"
                  label="Share image path"
                >
                  <Input id="og-image" onChange={(e) => setOgImagePath(e.target.value)} value={ogImagePath} />
                </FormField>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </EditorSettingsDialog>
  );
}
