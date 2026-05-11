"use client";

import * as React from "react";
import { Grid3X3, GripVertical, List, Search, X } from "lucide-react";
import { IconToggleGroup } from "./icon-toggle-group";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "./utils";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { Input } from "./input";
import { RepeaterItem, type RepeaterItemSpec } from "./repeater-item";
import { Select } from "./select";

export type RepeaterView = "grid" | "list";

export type RepeaterSortOption<TItem> = {
  /** Stable id used for persistence + the `<select>` value. */
  value: string;
  label: string;
  compare: (a: TItem, b: TItem) => number;
};

type RepeaterRenderArgs<TItem> = {
  item: TItem;
  index: number;
  view: RepeaterView;
  /** Selection state for this item, present when `selectable`. */
  selected?: boolean;
  onSelectChange?: (next: boolean) => void;
  /** Drag/reorder hooks, populated when `reorderable` is enabled (list view only). */
  drag?: RepeaterDragHandle;
};

/** Drag/reorder handles passed to consumers when `reorderable` is enabled. */
export type RepeaterDragHandle = {
  /** Attach to the row root element. */
  setNodeRef: (node: HTMLElement | null) => void;
  /** Spread on the row root for transform/transition styles. */
  style: React.CSSProperties;
  /** True while this row is being dragged. */
  isDragging: boolean;
  /** Spread on the drag-handle button to wire pointer/keyboard events. */
  handleProps: React.HTMLAttributes<HTMLElement>;
  /** Pre-styled grip-handle button. Spread `handleProps` if you render your own. */
  Handle: React.ComponentType<{ className?: string; "aria-label"?: string; disabled?: boolean }>;
};

type SelectionToolbarArgs = {
  selectedIds: string[];
  clear: () => void;
};

type RepeaterCommonProps<TItem> = {
  items: TItem[];
  getItemKey?: (item: TItem, index: number) => React.Key;
  getSearchValue: (item: TItem) => string;
  searchPlaceholder?: string;
  /** Shown when `items.length === 0` (the underlying dataset is empty). */
  emptyMessage?: React.ReactNode;
  /** Shown when search filters everything out. Defaults to a message with a "Clear search" button. */
  noResultsMessage?: React.ReactNode;
  initialView?: RepeaterView;
  fixedView?: RepeaterView;
  /** When set, view + sort preferences persist in localStorage under this key. */
  viewKey?: string;
  disableSearch?: boolean;
  disableViewToggle?: boolean;
  /** Optional sort presets. Renders a Select in the toolbar; first option used as default. */
  sortOptions?: RepeaterSortOption<TItem>[];
  defaultSortValue?: string;
  /** Enables a checkbox column + selection toolbar. Requires `getItem` mode (id source). */
  selectable?: boolean;
  /** Called whenever selection changes. Use the args to drive bulk-action UIs. */
  onSelectionChange?: (selectedIds: string[]) => void;
  /** Replaces the default selection toolbar. Receives selected ids + clear fn. */
  selectionToolbar?: (args: SelectionToolbarArgs) => React.ReactNode;
  className?: string;
  toolbarClassName?: string;
  gridClassName?: string;
  /**
   * When provided, REPLACES (rather than appends to) the default `space-y-3`
   * list container class. Pass `"divide-y"` for a full-bleed divided list.
   */
  listClassName?: string;
  /**
   * Enables drag-to-reorder. List view only — grid view stays static. Requires
   * a stable id per item (`getItem` or `getItemId`). Sort/search must be off
   * for drag to be meaningful; the Repeater warns and skips reorder otherwise.
   */
  reorderable?: boolean;
  /**
   * Fires after a successful drop with the new id order (in the same order
   * the items will render). Apply this to your data store, then pass the
   * reordered items back in via `items` on the next render.
   */
  onReorder?: (orderedIds: string[]) => void;
  /**
   * Render-prop for embedding the Repeater inside a section/header surface.
   * Receives the toolbar and the body separately so callers can place the
   * toolbar inline with a `<ManageSection>` header (alongside primary
   * actions) instead of stacked above the list. When omitted, the default
   * vertical stack is used.
   */
  renderShell?: (parts: { toolbar: React.ReactNode; body: React.ReactNode }) => React.ReactNode;
};

type RepeaterRenderProps<TItem> = RepeaterCommonProps<TItem> & {
  renderItem: (args: RepeaterRenderArgs<TItem>) => React.ReactNode;
  getItem?: never;
  /** Required when using `selectable` with `renderItem`. Returns each item's selection id. */
  getItemId?: (item: TItem, index: number) => string;
};

type RepeaterSpecProps<TItem> = RepeaterCommonProps<TItem> & {
  /** Map an item to a `RepeaterItemSpec`; the default `<RepeaterItem/>` renderer handles list + card views. */
  getItem: (item: TItem, index: number) => RepeaterItemSpec;
  renderItem?: never;
  getItemId?: never;
};

type RepeaterProps<TItem> = RepeaterRenderProps<TItem> | RepeaterSpecProps<TItem>;

export function Repeater<TItem>(props: RepeaterProps<TItem>) {
  const {
    items,
    getItemKey,
    getSearchValue,
    searchPlaceholder = "Search",
    emptyMessage = "No items yet.",
    noResultsMessage,
    initialView = "grid",
    fixedView,
    viewKey,
    disableSearch = false,
    disableViewToggle = false,
    sortOptions,
    defaultSortValue,
    selectable = false,
    onSelectionChange,
    selectionToolbar,
    className,
    toolbarClassName,
    gridClassName,
    listClassName,
    reorderable = false,
    onReorder,
    renderShell
  } = props;

  const [query, setQuery] = React.useState("");
  const [view, setView] = React.useState<RepeaterView>(fixedView ?? initialView);
  const [sortValue, setSortValue] = React.useState<string>(defaultSortValue ?? sortOptions?.[0]?.value ?? "");
  const [selectedIdsState, setSelectedIdsState] = React.useState<Set<string>>(new Set());

  // Hydrate persisted view + sort once on mount.
  React.useEffect(() => {
    if (!viewKey || typeof window === "undefined") return;
    if (!fixedView) {
      const storedView = window.localStorage.getItem(`repeater-view:${viewKey}`);
      if (storedView === "grid" || storedView === "list") setView(storedView);
    }
    if (sortOptions && sortOptions.length > 0) {
      const storedSort = window.localStorage.getItem(`repeater-sort:${viewKey}`);
      if (storedSort && sortOptions.some((opt) => opt.value === storedSort)) {
        setSortValue(storedSort);
      }
    }
    // Run only on mount; intentionally ignore deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolvedView = fixedView ?? view;

  function handleViewChange(next: RepeaterView) {
    setView(next);
    if (viewKey && typeof window !== "undefined") {
      window.localStorage.setItem(`repeater-view:${viewKey}`, next);
    }
  }

  function handleSortChange(next: string) {
    setSortValue(next);
    if (viewKey && typeof window !== "undefined") {
      window.localStorage.setItem(`repeater-sort:${viewKey}`, next);
    }
  }

  const activeSort = sortOptions?.find((opt) => opt.value === sortValue) ?? null;

  const sortedItems = React.useMemo(() => {
    if (!activeSort) return items;
    return [...items].sort(activeSort.compare);
  }, [items, activeSort]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = React.useMemo(() => {
    if (disableSearch || !normalizedQuery) return sortedItems;
    return sortedItems.filter((item) => getSearchValue(item).toLowerCase().includes(normalizedQuery));
  }, [disableSearch, getSearchValue, sortedItems, normalizedQuery]);

  // Selection helpers --------------------------------------------------------
  const getSelectionId = React.useCallback(
    (item: TItem, index: number): string | null => {
      if (!selectable) return null;
      if ("getItem" in props && props.getItem) return props.getItem(item, index).id;
      if ("getItemId" in props && props.getItemId) return props.getItemId(item, index);
      return null;
    },
    [selectable, props]
  );

  function emitSelection(next: Set<string>) {
    setSelectedIdsState(next);
    onSelectionChange?.(Array.from(next));
  }

  function toggleSelection(id: string, checked: boolean) {
    const next = new Set(selectedIdsState);
    if (checked) next.add(id);
    else next.delete(id);
    emitSelection(next);
  }

  function clearSelection() {
    if (selectedIdsState.size === 0) return;
    emitSelection(new Set());
  }

  const visibleSelectionIds = React.useMemo(() => {
    if (!selectable) return [] as string[];
    const ids: string[] = [];
    filteredItems.forEach((item, index) => {
      const id = getSelectionId(item, index);
      if (id) ids.push(id);
    });
    return ids;
  }, [filteredItems, selectable, getSelectionId]);

  const allVisibleSelected =
    selectable && visibleSelectionIds.length > 0 && visibleSelectionIds.every((id) => selectedIdsState.has(id));
  const someVisibleSelected =
    selectable && visibleSelectionIds.some((id) => selectedIdsState.has(id)) && !allVisibleSelected;

  function toggleSelectAll(checked: boolean) {
    const next = new Set(selectedIdsState);
    if (checked) {
      visibleSelectionIds.forEach((id) => next.add(id));
    } else {
      visibleSelectionIds.forEach((id) => next.delete(id));
    }
    emitSelection(next);
  }

  // Render helpers -----------------------------------------------------------
  const getReorderItemId = React.useCallback(
    (item: TItem, index: number): string | null => {
      if ("getItem" in props && props.getItem) return props.getItem(item, index).id;
      if ("getItemId" in props && props.getItemId) return props.getItemId(item, index);
      return null;
    },
    [props]
  );

  const renderOne = (item: TItem, index: number, drag?: RepeaterDragHandle) => {
    const id = getSelectionId(item, index);
    const selected = id ? selectedIdsState.has(id) : undefined;
    const onSelectChange = id ? (next: boolean) => toggleSelection(id, next) : undefined;

    if ("renderItem" in props && props.renderItem) {
      return props.renderItem({ item, index, view: resolvedView, selected, onSelectChange, drag });
    }
    const spec = (props as RepeaterSpecProps<TItem>).getItem(item, index);
    return (
      <RepeaterItem
        {...spec}
        view={resolvedView}
        {...(selectable ? { selected: Boolean(selected), onSelectChange } : {})}
      />
    );
  };

  const resolveKey = (item: TItem, index: number): React.Key => {
    if (getItemKey) return getItemKey(item, index);
    if ("getItem" in props && props.getItem) return props.getItem(item, index).id;
    return index;
  };

  const showSearch = !disableSearch;
  const showViewToggle = !disableViewToggle && !fixedView;
  const showSort = Boolean(sortOptions && sortOptions.length > 0);
  const showToolbar = showSearch || showViewToggle || showSort;
  const isEmpty = items.length === 0;
  const isFilteredEmpty = !isEmpty && filteredItems.length === 0;
  const selectedIds = Array.from(selectedIdsState);
  const showSelectionToolbar = selectable && selectedIds.length > 0;

  const toolbarNode = showToolbar ? (
    <div className={cn("ui-repeater-toolbar flex flex-wrap items-center gap-2", toolbarClassName)}>
      {showSearch ? (
        <div className="ui-repeater-search relative">
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <Input
            className="pl-8"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            value={query}
          />
        </div>
      ) : null}

      {showViewToggle ? (
        <IconToggleGroup
          ariaLabel="Choose repeater view"
          onChange={handleViewChange}
          options={[
            { value: "list", icon: List, label: "List view" },
            { value: "grid", icon: Grid3X3, label: "Card view" }
          ]}
          value={resolvedView}
        />
      ) : null}

      {showSort ? (
        <div className="ml-auto">
          <Select
            aria-label="Sort by"
            onChange={(event) => handleSortChange(event.target.value)}
            options={sortOptions!.map((opt) => ({ value: opt.value, label: `Sort: ${opt.label}` }))}
            value={sortValue}
          />
        </div>
      ) : null}
    </div>
  ) : null;

  const selectionToolbarNode = showSelectionToolbar ? (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border bg-surface-muted/65 px-4 py-2 text-sm">
      <div className="flex items-center gap-3">
        <Checkbox
          aria-label={allVisibleSelected ? "Deselect all" : "Select all visible"}
          checked={allVisibleSelected}
          indeterminate={someVisibleSelected}
          onCheckedChange={(next) => toggleSelectAll(next)}
        />
        <span className="font-semibold">{selectedIds.length} selected</span>
      </div>
      <div className="flex items-center gap-2">
        {selectionToolbar ? selectionToolbar({ selectedIds, clear: clearSelection }) : null}
        <Button onClick={clearSelection} size="sm" type="button" variant="ghost">
          <X aria-hidden className="h-4 w-4" />
          Clear
        </Button>
      </div>
    </div>
  ) : null;

  const bodyNode = isEmpty ? (
    <p className="rounded-card border border-dashed px-4 py-5 text-sm text-text-muted">{emptyMessage}</p>
  ) : isFilteredEmpty ? (
    noResultsMessage ?? (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-dashed px-4 py-5 text-sm text-text-muted">
        <span>No items match &quot;{query}&quot;.</span>
        <Button onClick={() => setQuery("")} size="sm" type="button" variant="ghost">
          Clear search
        </Button>
      </div>
    )
  ) : reorderable && resolvedView === "list" ? (
    <ReorderableList<TItem>
      flushOnNarrow={disableViewToggle}
      getItemId={getReorderItemId}
      items={filteredItems}
      listClassName={listClassName}
      onReorder={onReorder}
      renderOne={renderOne}
      resolveKey={resolveKey}
    />
  ) : (
    <div
      className={cn(
        resolvedView === "grid"
          ? cn("ui-card-grid", gridClassName)
          : cn(
              "space-y-3",
              // When the caller has locked the view to list (`disableViewToggle`),
              // collapse the per-row chrome on narrow viewports for the
              // conventional flush mobile list. See `.ui-list-flush-on-narrow`
              // in globals.css.
              disableViewToggle && "ui-list-flush-on-narrow",
              listClassName
            )
      )}
    >
      {filteredItems.map((item, index) => (
        <React.Fragment key={resolveKey(item, index)}>{renderOne(item, index)}</React.Fragment>
      ))}
    </div>
  );

  if (renderShell) {
    return (
      <>
        {renderShell({
          toolbar: toolbarNode,
          body: (
            <div className={cn("space-y-3", className)}>
              {selectionToolbarNode}
              {bodyNode}
            </div>
          )
        })}
      </>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {toolbarNode}
      {selectionToolbarNode}
      {bodyNode}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reorderable list (list view + drag/drop)
// ---------------------------------------------------------------------------

type ReorderableListProps<TItem> = {
  items: TItem[];
  getItemId: (item: TItem, index: number) => string | null;
  onReorder?: (orderedIds: string[]) => void;
  renderOne: (item: TItem, index: number, drag?: RepeaterDragHandle) => React.ReactNode;
  resolveKey: (item: TItem, index: number) => React.Key;
  listClassName?: string;
  flushOnNarrow?: boolean;
};

function ReorderableList<TItem>({
  items,
  getItemId,
  onReorder,
  renderOne,
  resolveKey,
  listClassName,
  flushOnNarrow
}: ReorderableListProps<TItem>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const ids = React.useMemo(() => {
    const out: string[] = [];
    items.forEach((item, index) => {
      const id = getItemId(item, index);
      if (id != null) out.push(id);
    });
    return out;
  }, [items, getItemId]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder?.(arrayMove(ids, oldIndex, newIndex));
  };

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd} sensors={sensors}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className={cn("space-y-3", flushOnNarrow && "ui-list-flush-on-narrow", listClassName)}>
          {items.map((item, index) => {
            const id = getItemId(item, index);
            if (id == null) {
              return <React.Fragment key={resolveKey(item, index)}>{renderOne(item, index)}</React.Fragment>;
            }
            return (
              <SortableRow id={id} key={resolveKey(item, index)}>
                {(drag) => renderOne(item, index, drag)}
              </SortableRow>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  children
}: {
  id: string;
  children: (drag: RepeaterDragHandle) => React.ReactNode;
}) {
  const { attributes, listeners, isDragging, setNodeRef, transform, transition } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1
  };
  const handleProps: React.HTMLAttributes<HTMLElement> = {
    ...(attributes as React.HTMLAttributes<HTMLElement>),
    ...(listeners as React.HTMLAttributes<HTMLElement>)
  };
  const Handle = React.useCallback(
    ({ className, "aria-label": ariaLabel = "Drag to reorder", disabled }: { className?: string; "aria-label"?: string; disabled?: boolean }) => (
      <button
        aria-label={ariaLabel}
        className={cn(
          "inline-flex h-7 w-5 cursor-grab items-center justify-center text-text-muted transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-30",
          className
        )}
        disabled={disabled}
        type="button"
        {...handleProps}
      >
        <GripVertical aria-hidden className="h-4 w-4" />
      </button>
    ),
    [handleProps]
  );
  return <>{children({ setNodeRef, style, isDragging, handleProps, Handle })}</>;
}
