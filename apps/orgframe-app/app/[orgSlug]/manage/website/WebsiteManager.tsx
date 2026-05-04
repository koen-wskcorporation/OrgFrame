"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FolderTree,
  GripVertical,
  Indent,
  MoreHorizontal,
  Outdent,
  Pencil,
  Plus,
  Trash2,
  X
} from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@orgframe/ui/primitives/utils";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Badge, ChipPicker } from "@orgframe/ui/primitives/chip";
import { Button } from "@orgframe/ui/primitives/button";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { useConfirmDialog } from "@orgframe/ui/primitives/confirm-dialog";
import { RepeaterItem } from "@orgframe/ui/primitives/repeater-item";
import { Textarea } from "@orgframe/ui/primitives/textarea";
import { EditorSettingsDialog } from "@/src/features/core/layout/components/EditorSettingsDialog";
import type { OrgManagePage, OrgSiteStructureItem } from "@/src/features/site/types";
import {
  deleteWebsiteItemAction,
  reorderWebsiteItemsAction,
  updateWebsiteItemAction,
  type WebsiteManagerActionResult
} from "@/src/features/site/websiteManagerActions";
import { PageWizard } from "./PageWizard";

type TreeNode = {
  item: OrgSiteStructureItem;
  children: TreeNode[];
};

type AddItemKind = "page" | "dropdown" | "link";

type Props = {
  canWrite: boolean;
  /** Public host (custom domain or `<slug>.orgframe.app`) used as the URL preview prefix. */
  displayHost: string;
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

function buildTree(items: OrgSiteStructureItem[]): TreeNode[] {
  const byParent = new Map<string | null, OrgSiteStructureItem[]>();
  for (const item of items) {
    const list = byParent.get(item.parentId) ?? [];
    list.push(item);
    byParent.set(item.parentId, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.orderIndex - b.orderIndex || a.title.localeCompare(b.title));
  }
  const walk = (parentId: string | null): TreeNode[] => {
    const list = byParent.get(parentId) ?? [];
    return list.map((item) => ({ item, children: walk(item.id) }));
  };
  return walk(null);
}

/**
 * Walk up the parent chain of `parentId` and return the slug segments — used
 * to build a URL preview like `acme.orgframe.app/about/team/`. Dynamic items
 * are skipped (they generate their own paths at render time).
 */
function buildParentPath(items: OrgSiteStructureItem[], parentId: string | null): string[] {
  if (!parentId) return [];
  const byId = new Map(items.map((i) => [i.id, i]));
  const path: string[] = [];
  let current = byId.get(parentId);
  while (current) {
    if (current.type !== "dynamic" && current.slug) {
      path.unshift(current.slug);
    }
    if (!current.parentId) break;
    current = byId.get(current.parentId);
  }
  return path;
}

// Reused on every row's status chip — same shape and palette as the wizard's
// `PUBLISH_OPTIONS` so the in-list toggle and the in-wizard toggle match
// exactly. Order matters: the popover lists options top-to-bottom in this
// order. Published first (live = primary state), Unpublished second (greyed).
const PUBLISH_OPTIONS = [
  { value: "published", label: "Published", color: "emerald" as const },
  { value: "unpublished", label: "Unpublished", color: "slate" as const }
];

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
  displayHost: string;
  items: OrgSiteStructureItem[];
  pages: OrgManagePage[];
  treeNodes: TreeNode[];
  collapsed: Set<string>;
  pending: boolean;
  error: string | null;
  setError: (next: string | null) => void;
  toggleCollapse: (id: string) => void;
  toggleField: (item: OrgSiteStructureItem, patch: { showInMenu?: boolean; isPublished?: boolean }) => void;
  indent: (item: OrgSiteStructureItem) => void;
  outdent: (item: OrgSiteStructureItem) => void;
  handleDelete: (item: OrgSiteStructureItem) => void | Promise<void>;
  /** Move active to be the last child of newParentId (or null = top level). */
  handleNest: (activeId: string, newParentId: string | null) => void;
  /** Insert active before/after over within the over item's sibling group. */
  handleReorderRelative: (
    activeId: string,
    overId: string,
    position: "before" | "after"
  ) => void;
  /** Pass null to show the type-picker first; pass a specific kind to skip it. */
  openAdd: (kind: AddItemKind | null, parentId: string | null) => void;
  // Dialog plumbing — read by the Body so dialogs render alongside the tree.
  wizardOpen: boolean;
  wizardParentId: string | null;
  wizardDefaultType: AddItemKind | null;
  editingItem: OrgSiteStructureItem | null;
  setEditingItem: (item: OrgSiteStructureItem | null) => void;
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
  displayHost,
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
  const [wizardParentId, setWizardParentId] = React.useState<string | null>(null);
  const [wizardDefaultType, setWizardDefaultType] = React.useState<AddItemKind | null>(null);
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [editingItem, setEditingItem] = React.useState<OrgSiteStructureItem | null>(null);

  const treeNodes = React.useMemo(() => buildTree(items), [items]);
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

  /**
   * Move the active item to be the last child of `newParentId`. Pass `null` to
   * promote it to the top level. Skips no-ops and rejects nesting under
   * a `dynamic` item.
   */
  const handleNest = (activeId: string, newParentId: string | null) => {
    const newParent = newParentId ? items.find((i) => i.id === newParentId) : null;
    if (newParentId && (!newParent || newParent.type === "dynamic")) {
      setError("Cannot nest under that item.");
      return;
    }
    const active = items.find((i) => i.id === activeId);
    if (!active) return;
    if (active.parentId === newParentId) {
      // Already under this parent; treat as a no-op.
      return;
    }

    const childrenOfTarget = items.filter((i) => i.parentId === newParentId && i.id !== activeId);
    const next = items.map((it) =>
      it.id === activeId
        ? { ...it, parentId: newParentId, orderIndex: childrenOfTarget.length }
        : it
    );
    setItems(next);
    persistOrder(next);
  };

  /**
   * Insert the active item before/after the over item in the over item's
   * sibling group. If the active was previously in a different group it gets
   * reparented at the same time.
   */
  const handleReorderRelative = (
    activeId: string,
    overId: string,
    position: "before" | "after"
  ) => {
    const over = items.find((i) => i.id === overId);
    const active = items.find((i) => i.id === activeId);
    if (!over || !active) return;

    const targetParentId = over.parentId;
    const siblings = items
      .filter((i) => i.parentId === targetParentId && i.id !== activeId)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    const overIndex = siblings.findIndex((s) => s.id === overId);
    if (overIndex < 0) return;
    const insertIndex = position === "before" ? overIndex : overIndex + 1;

    const newSiblings = [...siblings];
    newSiblings.splice(insertIndex, 0, { ...active, parentId: targetParentId });

    const next = items.map((it) => {
      if (it.id === activeId) {
        const idx = newSiblings.findIndex((s) => s.id === activeId);
        return { ...it, parentId: targetParentId, orderIndex: idx };
      }
      if (it.parentId === targetParentId) {
        const idx = newSiblings.findIndex((s) => s.id === it.id);
        return idx === -1 ? it : { ...it, orderIndex: idx };
      }
      return it;
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

  const openAdd = (kind: AddItemKind | null, parentId: string | null) => {
    setWizardDefaultType(kind);
    setWizardParentId(parentId);
    setWizardOpen(true);
  };

  const closeWizard = () => {
    setWizardOpen(false);
    setWizardParentId(null);
    setWizardDefaultType(null);
  };

  const value: WebsiteManagerContextValue = {
    canWrite,
    orgSlug,
    displayHost,
    items,
    pages,
    treeNodes,
    collapsed,
    pending,
    error,
    setError,
    toggleCollapse,
    toggleField,
    indent,
    outdent,
    handleDelete,
    handleNest,
    handleReorderRelative,
    openAdd,
    wizardOpen,
    wizardParentId,
    wizardDefaultType,
    editingItem,
    setEditingItem,
    closeWizard,
    applyResult,
    startTransition
  };

  return <WebsiteManagerContext.Provider value={value}>{children}</WebsiteManagerContext.Provider>;
}

/**
 * Single "+ New" button. Slots into a `<ManageSection actions={…}>` so it
 * lands in the section header. Must be rendered inside `WebsiteManagerProvider`.
 */
export function WebsiteManagerActions() {
  const { canWrite, openAdd } = useWebsiteManager();
  return (
    <Button disabled={!canWrite} onClick={() => openAdd(null, null)} size="sm">
      <Plus className="h-4 w-4" />
      New
    </Button>
  );
}

/**
 * The tree (rendered via `<TreeRoot>` with drag-to-reorder + drag-to-nest)
 * plus the modals that read from manager state. Render as the children of
 * the section that hosts `WebsiteManagerActions`.
 */
export function WebsiteManagerBody() {
  const ctx = useWebsiteManager();
  const {
    applyResult,
    canWrite,
    closeWizard,
    displayHost,
    editingItem,
    error,
    items,
    orgSlug,
    pages,
    pending,
    setEditingItem,
    setError,
    startTransition,
    treeNodes,
    wizardDefaultType,
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

      <TreeRoot />

      <PageWizard
        defaultParentId={wizardParentId}
        defaultType={wizardDefaultType}
        displayHost={displayHost}
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
          displayHost={displayHost}
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
// TreeRoot: single DndContext driving both reorder (drop on edges) and nest
// (drop in the middle of a row). Each parent's children get their own
// SortableContext, all under one DndContext so cross-level drags work too.
// ---------------------------------------------------------------------------

type DropMode = "before" | "after" | "nest";

type DragState = {
  activeId: string | null;
  overInfo: { id: string; mode: DropMode } | null;
};

const DragStateContext = React.createContext<DragState>({ activeId: null, overInfo: null });

function useDragState() {
  return React.useContext(DragStateContext);
}

/** Returns true if `candidateId` is `ancestorId` or a descendant of it. */
function isInSubtree(
  itemsById: Map<string, OrgSiteStructureItem>,
  ancestorId: string,
  candidateId: string
): boolean {
  let current: string | null | undefined = candidateId;
  while (current) {
    if (current === ancestorId) return true;
    const item = itemsById.get(current);
    if (!item) return false;
    current = item.parentId;
  }
  return false;
}

function TreeRoot() {
  const { canWrite, treeNodes, items, handleNest, handleReorderRelative } = useWebsiteManager();

  const itemsById = React.useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [overInfo, setOverInfo] = React.useState<DragState["overInfo"]>(null);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      setOverInfo(null);
      return;
    }
    const overRect = over.rect;
    const activeRect = active.rect.current.translated;
    if (!overRect || !activeRect) {
      setOverInfo(null);
      return;
    }

    // Determine drop mode by the active item's vertical center relative to
    // the over row. Top quarter = before, bottom quarter = after, middle =
    // nest under that row.
    const activeCenterY = activeRect.top + activeRect.height / 2;
    const overTop = overRect.top;
    const overHeight = overRect.height;
    const relativeY = (activeCenterY - overTop) / overHeight;

    let mode: DropMode;
    if (relativeY < 0.3) mode = "before";
    else if (relativeY > 0.7) mode = "after";
    else mode = "nest";

    // Reject nesting under a descendant of the active item (would form a cycle).
    if (mode === "nest" && isInSubtree(itemsById, String(active.id), String(over.id))) {
      setOverInfo(null);
      return;
    }

    setOverInfo({ id: String(over.id), mode });
  };

  const reset = () => {
    setActiveId(null);
    setOverInfo(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active } = event;
    if (!overInfo) {
      reset();
      return;
    }
    const activeStr = String(active.id);
    if (activeStr === overInfo.id) {
      reset();
      return;
    }

    if (overInfo.mode === "nest") {
      handleNest(activeStr, overInfo.id);
    } else {
      handleReorderRelative(activeStr, overInfo.id, overInfo.mode);
    }
    reset();
  };

  const dragValue = React.useMemo<DragState>(() => ({ activeId, overInfo }), [activeId, overInfo]);

  if (treeNodes.length === 0) {
    return (
      <div className="rounded-control border bg-surface px-4 py-8 text-center text-sm text-text-muted">
        No items yet. Click <span className="font-semibold text-text">New</span> to add a page, dropdown, or link.
      </div>
    );
  }

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragCancel={reset}
      onDragEnd={canWrite ? handleDragEnd : reset}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      <DragStateContext.Provider value={dragValue}>
        <SiblingGroup nodes={treeNodes} />
      </DragStateContext.Provider>
    </DndContext>
  );
}

// ---------------------------------------------------------------------------
// SiblingGroup: one SortableContext per group of siblings. Recursively
// mounted by TreeRow for each parent's children.
// ---------------------------------------------------------------------------

function SiblingGroup({ nodes }: { nodes: TreeNode[] }) {
  const ids = React.useMemo(() => nodes.map((n) => n.item.id), [nodes]);

  if (nodes.length === 0) return null;

  return (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      <div className="space-y-3">
        {nodes.map((node) => (
          <TreeRow key={node.item.id} node={node} />
        ))}
      </div>
    </SortableContext>
  );
}

// ---------------------------------------------------------------------------
// TreeRow
// ---------------------------------------------------------------------------

type TreeRowProps = {
  node: TreeNode;
};

function TreeRow({ node }: TreeRowProps) {
  const {
    canWrite,
    collapsed,
    handleDelete,
    indent,
    openAdd,
    orgSlug,
    outdent,
    pending,
    setEditingItem,
    toggleCollapse,
    toggleField
  } = useWebsiteManager();

  const { item, children } = node;
  const hasChildren = children.length > 0;
  const isCollapsed = collapsed.has(item.id);

  const sortable = useSortable({ id: item.id, disabled: !canWrite || isLocked(item) });
  const dragState = useDragState();
  const isNestTarget =
    dragState.overInfo?.id === item.id &&
    dragState.overInfo?.mode === "nest" &&
    dragState.activeId !== item.id;
  const isBeingDragged = dragState.activeId === item.id;

  const dragStyle: React.CSSProperties = {
    transform: CSS.Translate.toString(sortable.transform),
    transition: sortable.transition,
    opacity: isBeingDragged ? 0.4 : undefined
  };
  const setNodeRef = sortable.setNodeRef;
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

  const onAddChild = (kind: AddItemKind) => openAdd(kind, item.id);
  const onDelete = () => handleDelete(item);
  const onEdit = () => setEditingItem(item);
  const onIndent = () => indent(item);
  const onOutdent = () => outdent(item);
  const onToggleCollapse = () => toggleCollapse(item.id);
  const onTogglePublished = () => toggleField(item, { isPublished: !item.isPublished });
  const onToggleShowInMenu = () => toggleField(item, { showInMenu: !item.showInMenu });

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

  const leading = canWrite ? (
    <Button
      aria-label="Drag to reorder"
      className={cn("touch-none", locked ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing")}
      disabled={locked}
      iconOnly
      ref={sortable.setActivatorNodeRef as React.Ref<HTMLButtonElement>}
      {...sortable.attributes}
      {...sortable.listeners}
    >
      <GripVertical />
    </Button>
  ) : null;

  // Order: title text → metadata chips → expand/collapse arrow on the far right
  // of the chip row. The chevron is only rendered when the row actually has
  // children — and it sits AFTER the chips so the title text can land flush
  // against the leading edge.
  const chips = (
    <>
      <Badge variant={typeLabel.variant}>{typeLabel.label}</Badge>
      {/* Status chip — clickable, same options + colors as the wizard. */}
      <ChipPicker
        disabled={!canWrite || locked}
        onChange={(value) => toggleField(item, { isPublished: value === "published" })}
        options={PUBLISH_OPTIONS}
        status
        value={item.isPublished ? "published" : "unpublished"}
      />
      {!item.showInMenu ? <Badge variant="neutral">Hidden in nav</Badge> : null}
      {locked ? <Badge variant="neutral">Locked</Badge> : null}
      {hasChildren ? (
        // Sized to match the chip-row baseline (h-5) so it doesn't push the
        // title / meta apart. The default `iconOnly` size (h-8) was making
        // rows-with-children visibly taller than rows-without.
        <Button
          aria-label={isCollapsed ? "Expand" : "Collapse"}
          className="!h-5 !w-5 [&_svg]:!h-3 [&_svg]:!w-3"
          iconOnly
          onClick={onToggleCollapse}
        >
          {isCollapsed ? <ChevronRight /> : <ChevronDown />}
        </Button>
      ) : null}
    </>
  );

  const secondaryActions = (
    <div className="flex items-center gap-0.5">
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
    <div
      className={cn(
        // Nest target highlight — ring + accent border so it's clear that the
        // dragged row will become a child of THIS row on drop, not just be
        // reordered next to it.
        "rounded-control transition-shadow",
        isNestTarget && "ring-2 ring-accent ring-offset-2 ring-offset-canvas"
      )}
      ref={setNodeRef}
      style={dragStyle}
    >
      <RepeaterItem
        body={
          hasChildren && !isCollapsed ? <SiblingGroup nodes={children} /> : null
        }
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
