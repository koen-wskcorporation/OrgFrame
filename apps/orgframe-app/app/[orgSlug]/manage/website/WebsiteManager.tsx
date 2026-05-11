"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  X
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  type SortingStrategy
} from "@dnd-kit/sortable";
import { cn } from "@orgframe/ui/primitives/utils";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Chip } from "@orgframe/ui/primitives/chip";
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

/**
 * One row as rendered in the flat list. `lines` describes the diagram-line
 * column at each indentation level: lines[i] for i in [0, depth] is "does the
 * level-i ancestor (or self at i=depth) have a sibling below this row?". The
 * renderer uses this to decide where to draw vertical continuation lines and
 * where to draw the elbow connector.
 */
type FlatRow = {
  item: OrgSiteStructureItem;
  depth: number;
  hasChildren: boolean;
  lines: boolean[];
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
 * Flatten the tree into rows for rendering. Skips children of collapsed
 * parents. Produces the per-row `lines` array used by the diagram renderer.
 */
function flattenTree(nodes: TreeNode[], collapsed: Set<string>): FlatRow[] {
  const out: FlatRow[] = [];
  const walk = (siblings: TreeNode[], ancestorLines: boolean[]) => {
    siblings.forEach((node, index) => {
      const hasNextSibling = index < siblings.length - 1;
      const lines = [...ancestorLines, hasNextSibling];
      out.push({
        item: node.item,
        depth: ancestorLines.length,
        hasChildren: node.children.length > 0,
        lines
      });
      if (node.children.length > 0 && !collapsed.has(node.item.id)) {
        walk(node.children, lines);
      }
    });
  };
  walk(nodes, []);
  return out;
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
 * Single "+ New" button. Slots into a `<Section actions={…}>` so it
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
          onDelete={async () => {
            const target = editingItem;
            await ctx.handleDelete(target);
            setEditingItem(null);
          }}
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
        onDelete={async () => {
          if (!editingItem) return;
          await ctx.handleDelete(editingItem);
          setEditingItem(null);
        }}
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

/**
 * Sortable strategy that explicitly does NOT shift items as the user drags.
 * verticalListSortingStrategy auto-translates rows to "preview" reorder, but
 * that interferes with the cursor-position-on-row math we use to detect nest
 * intent (the over row's rect moves out from under the cursor). Without a
 * shift, the rows stay put — the active item still translates with the
 * cursor (handled by useDraggable, not the strategy) and the cursor lands
 * exactly where the user expects.
 */
const noShiftStrategy: SortingStrategy = () => null;

/**
 * Plain closest-centre collision. With `<DragOverlay>` the original active
 * row stays at its real layout position (it does NOT translate to follow the
 * cursor), so it can never tie or "win" against the target row at distance
 * zero. The target row directly under the cursor is unambiguously closest.
 */
const collisionDetectionForTree: CollisionDetection = closestCenter;

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
  const { canWrite, collapsed, treeNodes, items, handleNest, handleReorderRelative } =
    useWebsiteManager();

  const itemsById = React.useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items]
  );

  // Single flat list of rendered rows. Hides descendants of collapsed parents.
  const flatRows = React.useMemo(() => flattenTree(treeNodes, collapsed), [treeNodes, collapsed]);
  const flatIds = React.useMemo(() => flatRows.map((r) => r.item.id), [flatRows]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [overInfo, setOverInfo] = React.useState<DragState["overInfo"]>(null);
  // The ref mirrors `overInfo` so `handleDragEnd` can read the very latest
  // value without depending on whether React has committed the render that
  // followed the last `handleDragOver`. State drives the visual feedback;
  // the ref drives the drop dispatch.
  const overInfoRef = React.useRef<DragState["overInfo"]>(null);
  const setOver = (next: DragState["overInfo"]) => {
    overInfoRef.current = next;
    setOverInfo(next);
  };

  const handleDragStart = (event: DragStartEvent) => {
    overInfoRef.current = null;
    setActiveId(String(event.active.id));
    setOverInfo(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over, activatorEvent, delta } = event;
    if (!over || active.id === over.id) {
      setOver(null);
      return;
    }
    const overRect = over.rect;
    if (!overRect) {
      setOver(null);
      return;
    }

    // Resolve the actual pointer Y. The collision detector picked `over`
    // based on the cursor already; we use the same coordinate for the
    // before/nest/after split so the feedback the user sees matches where
    // they're actually pointing.
    let pointerY: number | null = null;
    const ev = activatorEvent as PointerEvent | MouseEvent | null;
    if (ev && typeof ev.clientY === "number") {
      pointerY = ev.clientY + delta.y;
    } else {
      const r = active.rect.current.translated;
      if (r) pointerY = r.top + r.height / 2;
    }
    if (pointerY === null) {
      setOver(null);
      return;
    }

    // Generous middle band (20%–80%) so the user doesn't have to bullseye
    // the row's exact centre to nest. Top/bottom 20% is reorder-before /
    // reorder-after.
    const relativeY = (pointerY - overRect.top) / overRect.height;
    let mode: DropMode;
    if (relativeY < 0.2) mode = "before";
    else if (relativeY > 0.8) mode = "after";
    else mode = "nest";

    // Reject nesting under a descendant of the active (would create a cycle).
    if (mode === "nest" && isInSubtree(itemsById, String(active.id), String(over.id))) {
      setOver(null);
      return;
    }

    setOver({ id: String(over.id), mode });
  };

  const reset = () => {
    overInfoRef.current = null;
    setActiveId(null);
    setOverInfo(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active } = event;
    // Read from the ref — `overInfo` state may not have committed yet for
    // the final pointermove that preceded this drop.
    const finalOver = overInfoRef.current;
    if (!finalOver) {
      reset();
      return;
    }
    const activeStr = String(active.id);
    if (activeStr === finalOver.id) {
      reset();
      return;
    }

    if (finalOver.mode === "nest") {
      handleNest(activeStr, finalOver.id);
    } else {
      handleReorderRelative(activeStr, finalOver.id, finalOver.mode);
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

  // The row currently being dragged — used by <DragOverlay> to render a
  // floating preview that follows the cursor, so the original row can stay
  // pinned at its layout position (which keeps collision detection clean).
  const activeRow = activeId ? flatRows.find((r) => r.item.id === activeId) ?? null : null;

  return (
    <DndContext
      collisionDetection={collisionDetectionForTree}
      onDragCancel={reset}
      onDragEnd={canWrite ? handleDragEnd : reset}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      <DragStateContext.Provider value={dragValue}>
        <SortableContext items={flatIds} strategy={noShiftStrategy}>
          {/* Tight spacing between rows so the diagram lines on the left
              read as nearly-continuous tree connectors. */}
          <div className="space-y-1">
            {flatRows.map((row) => (
              <TreeRow key={row.item.id} row={row} />
            ))}
          </div>
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {activeRow ? <DragPreview row={activeRow} /> : null}
        </DragOverlay>
      </DragStateContext.Provider>
    </DndContext>
  );
}

/**
 * Floating preview shown by `<DragOverlay>` while a row is being dragged.
 * A non-interactive snapshot of the row — just enough to make it obvious
 * what's moving with the cursor.
 */
function DragPreview({ row }: { row: FlatRow }) {
  const { item } = row;
  const typeLabel = rowTypeLabel(item);
  return (
    <div className="rounded-control border border-accent bg-surface px-4 py-3 shadow-floating ring-2 ring-accent/30">
      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text">
        <span className="truncate">{item.title}</span>
        <Chip status={false} variant={typeLabel.variant}>
          {typeLabel.label}
        </Chip>
      </div>
      {item.urlPath ? (
        <div className="mt-1 text-xs text-text-muted">{item.urlPath}</div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TreeRow
// ---------------------------------------------------------------------------

const INDENT_PX = 24;

type TreeRowProps = {
  row: FlatRow;
};

function TreeRow({ row }: TreeRowProps) {
  const router = useRouter();
  const {
    canWrite,
    collapsed,
    handleDelete,
    orgSlug,
    pending,
    setEditingItem,
    toggleCollapse,
    toggleField
  } = useWebsiteManager();

  const { item, depth, hasChildren, lines } = row;
  const isTopLevel = depth === 0;
  const isCollapsed = collapsed.has(item.id);

  const sortable = useSortable({ id: item.id, disabled: !canWrite || isLocked(item) });
  const dragState = useDragState();
  const targetMode =
    dragState.overInfo?.id === item.id && dragState.activeId !== item.id
      ? dragState.overInfo.mode
      : null;
  const isNestTarget = targetMode === "nest";
  const isBeforeTarget = targetMode === "before";
  const isAfterTarget = targetMode === "after";
  const isBeingDragged = dragState.activeId === item.id;

  // No transform here — `<DragOverlay>` renders the moving preview. The
  // original row stays at its layout position so collision detection sees
  // it as a static droppable, distinct from any potential drop target.
  const dragStyle: React.CSSProperties = {
    opacity: isBeingDragged ? 0.35 : undefined
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
  const onDelete = () => handleDelete(item);
  // "Manage" opens the wizard panel for settings (was the old Edit behavior).
  const onManage = () => setEditingItem(item);
  // "Edit" navigates to the live page. The user can open the editor from the
  // page itself via the existing "Edit page" button in the org header — we
  // intentionally don't auto-flip into edit mode on arrival.
  const onEdit = () => {
    if (!editorHref) return;
    router.push(editorHref);
  };
  const onToggleCollapse = () => toggleCollapse(item.id);
  const onToggleShowInMenu = () => toggleField(item, { showInMenu: !item.showInMenu });

  const titleText = editorHref ? (
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

  // The collapse/expand toggle is offered only on top-level parents (depth 0
  // with children). Deeper sub-trees are always visible — their structure is
  // shown via the diagram lines on the left.
  const showCollapseToggle = isTopLevel && hasChildren;
  const titleNode = (
    <span className="inline-flex min-w-0 items-center gap-2">
      {titleText}
      {showCollapseToggle ? (
        <Button
          aria-label={isCollapsed ? "Expand" : "Collapse"}
          className="!h-5 !w-5 flex-none [&_svg]:!h-3 [&_svg]:!w-3"
          iconOnly
          onClick={onToggleCollapse}
        >
          {isCollapsed ? <ChevronRight /> : <ChevronDown />}
        </Button>
      ) : null}
    </span>
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

  // Status chip is always the leftmost chip — it's the most actionable piece
  // of metadata, and uniform positioning makes it scannable across rows.
  const chips = (
    <>
      <Chip
        status
        picker={{
          disabled: !canWrite || locked,
          onChange: (value) => toggleField(item, { isPublished: value === "published" }),
          options: PUBLISH_OPTIONS,
          value: item.isPublished ? "published" : "unpublished"
        }}
      />
      <Chip status={false} variant={typeLabel.variant}>
        {typeLabel.label}
      </Chip>
      {!item.showInMenu ? (
        <Chip status={false} variant="neutral">
          Hidden in nav
        </Chip>
      ) : null}
      {locked ? (
        <Chip status={false} variant="neutral">
          Locked
        </Chip>
      ) : null}
    </>
  );

  // Order, left-to-right: Show/Hide → Edit → Manage. Delete now lives inside
  // the Manage panel (in the wizard's Visibility step / dialog footer) — it's
  // a destructive action and doesn't belong in the row's quick-actions.
  const secondaryActions = (
    <div className="flex items-center gap-2">
      <Button
        disabled={!canWrite || pending || locked}
        onClick={onToggleShowInMenu}
        size="sm"
        variant="ghost"
      >
        {item.showInMenu ? <Eye /> : <EyeOff />}
        {item.showInMenu ? "Hide" : "Show"}
      </Button>
    </div>
  );

  const primaryAction = (
    <div className="flex items-center gap-2">
      {editorHref ? (
        <Button intent="edit" disabled={!canWrite || locked} onClick={onEdit} size="sm" variant="secondary">Edit</Button>
      ) : null}
      <Button intent="manage" disabled={!canWrite || locked} onClick={onManage} size="sm" variant="secondary">Manage</Button>
    </div>
  );

  return (
    <div
      className={cn(
        "relative rounded-control transition-colors",
        // Nest target highlight — recolour the row's own border to the org
        // accent and tint its background. Done by reaching into the inner
        // `.ui-list-row` element via Tailwind's arbitrary-variant syntax so
        // the highlight wraps the actual visual card, not just an offset
        // outline outside it.
        isNestTarget &&
          "[&_.ui-list-row]:!border-accent [&_.ui-list-row]:!ring-2 [&_.ui-list-row]:!ring-accent [&_.ui-list-row]:!bg-accent/5"
      )}
      ref={setNodeRef}
      style={dragStyle}
    >
      {/* Before / after drop indicators — a thick accent line on the relevant
          edge. Absolute-positioned so they don't shift the row layout. */}
      {isBeforeTarget ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-0.5 h-1 rounded-full bg-accent"
        />
      ) : null}
      {isAfterTarget ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -bottom-0.5 h-1 rounded-full bg-accent"
        />
      ) : null}
      <div className="flex items-stretch">
        <DiagramLines lines={lines} />
        <div className="min-w-0 flex-1">
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
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diagram lines — the "│" / "├─" / "└─" tree connectors drawn to the left of
// each non-root row.
// ---------------------------------------------------------------------------

type DiagramCellKind = "empty" | "vertical" | "connector-mid" | "connector-end";

function DiagramLines({ lines }: { lines: boolean[] }) {
  const depth = lines.length - 1;
  if (depth === 0) return null;

  const cells: DiagramCellKind[] = [];
  for (let i = 0; i < depth; i += 1) {
    if (i < depth - 1) {
      // Ancestor column: vertical line continues through this row only if the
      // ancestor at level i+1 has another sibling below the current row.
      cells.push(lines[i + 1] ? "vertical" : "empty");
    } else {
      // Connector cell for the current row's level.
      cells.push(lines[depth] ? "connector-mid" : "connector-end");
    }
  }

  return (
    <div aria-hidden className="flex flex-none">
      {cells.map((kind, i) => (
        <DiagramCell key={i} kind={kind} />
      ))}
    </div>
  );
}

function DiagramCell({ kind }: { kind: DiagramCellKind }) {
  const baseStyle: React.CSSProperties = { width: INDENT_PX };
  if (kind === "empty") {
    return <div className="self-stretch" style={baseStyle} />;
  }
  return (
    <div className="relative self-stretch" style={baseStyle}>
      {/* Top half vertical (always shown for non-empty cells). */}
      <div className="absolute left-1/2 top-0 h-1/2 w-px -translate-x-1/2 bg-border" />
      {/* Bottom half vertical: through-vertical or "more siblings below". */}
      {(kind === "vertical" || kind === "connector-mid") && (
        <div className="absolute left-1/2 top-1/2 h-1/2 w-px -translate-x-1/2 bg-border" />
      )}
      {/* Horizontal stub: connects the connector elbow to the row content. */}
      {(kind === "connector-mid" || kind === "connector-end") && (
        <div className="absolute left-1/2 top-1/2 h-px w-1/2 bg-border" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit dialog
// ---------------------------------------------------------------------------

type EditDialogProps = {
  item: OrgSiteStructureItem | null;
  onClose: () => void;
  onDelete: () => void | Promise<void>;
  onResult: (res: WebsiteManagerActionResult) => void;
  orgSlug: string;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
};

function EditItemDialog({
  item,
  initialPages,
  onClose,
  onDelete,
  onResult,
  orgSlug,
  pending,
  startTransition
}: EditDialogProps & { initialPages: OrgManagePage[] }) {
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
        <div className="flex items-center gap-2">
          <Button intent="delete" disabled={pending} onClick={onDelete} size="sm" variant="danger">Delete</Button>
          <div className="ml-auto flex items-center gap-2">
            <Button intent="cancel" onClick={onClose} size="sm" variant="ghost">Cancel</Button>
            <Button intent="save" disabled={pending || !title.trim()} onClick={submit} size="sm">Save</Button>
          </div>
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
