"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, EyeOff, GripVertical, Pencil, Pin, Search, Settings2, X } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { Checkbox } from "@orgframe/ui/primitives/checkbox";
import { Input } from "@orgframe/ui/primitives/input";
import { Popover } from "@orgframe/ui/primitives/popover";
import { Popup } from "@orgframe/ui/primitives/popup";
import { cn } from "./utils";

export type SortDirection = "asc" | "desc";

function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  // Bare <table> — no inner overflow-x-auto wrapper. The DataTable's
  // outer shell is the scroll container (overflow-auto on both axes),
  // so a wrapper here would steal sticky pinning from the thead.
  return <table className={cn("w-full caption-bottom text-sm", className)} {...props} />;
}

function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("bg-surface-muted/80 [&_tr]:border-b", className)} {...props} />;
}

function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b transition-colors hover:bg-surface-muted/60", className)} {...props} />;
}

function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 align-middle text-text", className)} {...props} />;
}

export type DataTableViewConfig = {
  visibleColumnKeys: string[];
  columnOrderKeys: string[];
  pinnedLeftColumnKeys: string[];
  pinnedRightColumnKeys: string[];
  columnWidthsByKey: Record<string, number>;
  sort: {
    columnKey: string | null;
    direction: SortDirection;
  };
  searchQuery: string;
};

export type DataTableColumn<TItem> = {
  key: string;
  label: string;
  renderHeader?: () => ReactNode;
  group?: string;
  pinDefault?: "left" | "right";
  defaultVisible?: boolean;
  sortable?: boolean;
  searchable?: boolean;
  className?: string;
  headerClassName?: string;
  renderCell: (item: TItem, context?: { rowIndex: number; columnIndex: number; isCellSelected: boolean }) => ReactNode;
  renderCopyValue?: (item: TItem) => string;
  renderSortValue?: (item: TItem) => string | number | Date | null | undefined;
  renderSearchValue?: (item: TItem) => string;
};

type DataTablePersistedState = {
  visibleColumnKeys?: unknown;
  columnOrderKeys?: unknown;
  pinnedLeftColumnKeys?: unknown;
  pinnedRightColumnKeys?: unknown;
  columnWidthsByKey?: unknown;
};

type DataTableProps<TItem> = {
  ariaLabel?: string;
  data: TItem[];
  columns: DataTableColumn<TItem>[];
  rowKey: (item: TItem) => string;
  storageKey?: string;
  emptyState: ReactNode;
  searchPlaceholder?: string;
  initialVisibleColumnKeys?: string[];
  defaultSort?: {
    columnKey: string;
    direction?: SortDirection;
  };
  onRowClick?: (item: TItem) => void;
  getRowClassName?: (item: TItem) => string | undefined;
  selectedRowKey?: string | null;
  rowActionsLabel?: string;
  renderRowActions?: (item: TItem) => ReactNode;
  enableCellSelection?: boolean;
  showCellGrid?: boolean;
  onVisibleRowsChange?: (rows: TItem[]) => void;
  viewConfig?: Partial<DataTableViewConfig> | null;
  onConfigChange?: (config: DataTableViewConfig) => void;
  renderToolbarActions?: ReactNode;
  showReadOnlyToggle?: boolean;
  readOnlyMode?: boolean;
  onReadOnlyModeChange?: (nextReadOnlyMode: boolean) => void;
  readOnlyToggleDisabled?: boolean;
  readOnlyDisabledLabel?: string;
  pinRowActions?: boolean;
  onCellClick?: (context: {
    item: TItem;
    rowIndex: number;
    columnIndex: number;
    rowKey: string;
    columnKey: string;
    isActiveCell: boolean;
  }) => void;
};

type CellPoint = {
  rowIndex: number;
  columnIndex: number;
};

type ColumnContextMenuState = {
  columnKey: string;
  anchorPoint: { x: number; y: number };
};

function isLockedSelectionColumn(columnKey: string) {
  return columnKey === "__selected";
}

function normalizeColumnOrder(rawValue: unknown, allColumnKeys: string[]) {
  if (!Array.isArray(rawValue)) {
    return allColumnKeys;
  }

  const allColumnKeySet = new Set(allColumnKeys);
  const recognizedKeys: string[] = [];
  for (const rawKey of rawValue) {
    if (typeof rawKey !== "string") {
      continue;
    }
    if (!allColumnKeySet.has(rawKey) || recognizedKeys.includes(rawKey)) {
      continue;
    }
    recognizedKeys.push(rawKey);
  }
  const missingKeys = allColumnKeys.filter((key) => !recognizedKeys.includes(key));
  const normalized = [...recognizedKeys, ...missingKeys];
  if (!allColumnKeys.includes("__selected")) {
    return normalized;
  }

  const unlocked = normalized.filter((key) => !isLockedSelectionColumn(key));
  return ["__selected", ...unlocked];
}

function normalizeVisibleColumns(rawValue: unknown, allColumnKeys: string[], defaultVisibleColumns: string[]) {
  if (!Array.isArray(rawValue)) {
    return defaultVisibleColumns;
  }

  const allColumnKeySet = new Set(allColumnKeys);
  const normalized: string[] = [];
  for (const rawKey of rawValue) {
    if (typeof rawKey !== "string") {
      continue;
    }
    if (!allColumnKeySet.has(rawKey) || normalized.includes(rawKey)) {
      continue;
    }
    normalized.push(rawKey);
  }
  const withFallback = normalized.length > 0 ? normalized : defaultVisibleColumns;
  if (!allColumnKeys.includes("__selected")) {
    return withFallback;
  }

  const withoutSelection = withFallback.filter((key) => !isLockedSelectionColumn(key));
  return ["__selected", ...withoutSelection];
}

function normalizePinnedColumns(rawValue: unknown, allColumnKeys: string[]) {
  if (!Array.isArray(rawValue)) {
    return [];
  }

  const allColumnKeySet = new Set(allColumnKeys);
  const normalized: string[] = [];
  for (const rawKey of rawValue) {
    if (typeof rawKey !== "string") {
      continue;
    }
    if (!allColumnKeySet.has(rawKey) || normalized.includes(rawKey)) {
      continue;
    }
    normalized.push(rawKey);
  }
  return normalized;
}

function normalizeColumnWidths(rawValue: unknown, allColumnKeys: string[]) {
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return {} as Record<string, number>;
  }

  const allColumnKeySet = new Set(allColumnKeys);
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(rawValue as Record<string, unknown>)) {
    if (!allColumnKeySet.has(key) || typeof value !== "number" || !Number.isFinite(value)) {
      continue;
    }
    result[key] = Math.max(64, Math.round(value));
  }
  return result;
}

function areArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function normalizeSortValue(value: string | number | Date | null | undefined) {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "string") {
    return value.toLowerCase();
  }

  return value ?? "";
}

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest("button, a, input, select, textarea, [role='button']:not(tr), [data-row-action='true'], [data-inline-editor='true']")
  );
}

function hasActiveTextSelection() {
  if (typeof window === "undefined") {
    return false;
  }

  const selection = window.getSelection();
  return Boolean(selection && selection.toString().trim().length > 0);
}

function formatRowSummary(visibleCount: number, totalCount: number) {
  if (visibleCount === totalCount) {
    return `${totalCount.toLocaleString()} ${totalCount === 1 ? "row" : "rows"}`;
  }
  return `${visibleCount.toLocaleString()} of ${totalCount.toLocaleString()} rows`;
}

const headerIconButtonClassName =
  "inline-flex h-7 w-7 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-surface hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-40";

type SortableHeaderCellProps = {
  columnKey: string;
  label: string;
  renderHeader?: () => ReactNode;
  sortable: boolean;
  isSorted: boolean;
  sortDirection: SortDirection;
  headerClassName?: string;
  cellStyle?: CSSProperties;
  pinnedClassName?: string;
  onMount?: (node: HTMLTableCellElement | null) => void;
  onResizeStart: (columnKey: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onSortToggle: (columnKey: string) => void;
  onContextMenu?: (columnKey: string, event: MouseEvent<HTMLTableCellElement>) => void;
  canReorder: boolean;
};

function SortableHeaderCell({
  columnKey,
  label,
  renderHeader,
  sortable,
  isSorted,
  sortDirection,
  headerClassName,
  cellStyle,
  pinnedClassName,
  onMount,
  onResizeStart,
  onSortToggle,
  onContextMenu,
  canReorder
}: SortableHeaderCellProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: columnKey,
    disabled: !canReorder
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...cellStyle,
    zIndex: isDragging ? 20 : undefined,
    position: isDragging ? "relative" : undefined
  };

  return (
    <th
      className={cn(
        "group relative h-12 px-3 text-left align-middle text-[12px] font-semibold md:px-4",
        isDragging ? "bg-surface ring-1 ring-border" : undefined,
        pinnedClassName,
        headerClassName
      )}
      aria-sort={sortable && isSorted ? (sortDirection === "asc" ? "ascending" : "descending") : undefined}
      ref={(node) => {
        setNodeRef(node);
        onMount?.(node);
      }}
      onContextMenu={
        onContextMenu
          ? (event) => {
              onContextMenu(columnKey, event);
            }
          : undefined
      }
      style={style}
      title="Right-click for column options"
    >
      <div className="relative flex min-w-0 items-center justify-between gap-2 pr-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {canReorder ? (
            <button
              aria-label={`Drag ${label} column`}
              className={cn(headerIconButtonClassName, "h-6 w-6 shrink-0 opacity-35 group-hover:opacity-100 group-focus-within:opacity-100")}
              title={`Drag ${label} column`}
              type="button"
              {...attributes}
              {...listeners}
            >
              <GripVertical aria-hidden className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {sortable ? (
            <button
              aria-label={isSorted ? `Sort ${label} (${sortDirection === "asc" ? "ascending" : "descending"})` : `Sort ${label}`}
              className="inline-flex min-w-0 items-center gap-1 rounded-control px-1 py-0.5 text-left text-[12px] font-semibold tracking-wide text-text transition-colors hover:bg-surface-muted/60 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
              onClick={() => onSortToggle(columnKey)}
              title={isSorted ? `Sorted ${sortDirection === "asc" ? "ascending" : "descending"}` : "Sort"}
              type="button"
            >
              <span className="truncate">{label}</span>
              {isSorted ? (
                sortDirection === "asc" ? (
                  <ArrowUp aria-hidden className="h-3.5 w-3.5 shrink-0 text-text" />
                ) : (
                  <ArrowDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-text" />
                )
              ) : (
                <ArrowUpDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-text-muted/70" />
              )}
            </button>
          ) : renderHeader ? (
            <div className="min-w-0">{renderHeader()}</div>
          ) : (
            <span className="block truncate whitespace-nowrap text-[12px] font-semibold tracking-wide text-text">{label}</span>
          )}
        </div>
      </div>
      <button
        aria-label={`Resize ${label} column`}
        className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none rounded-r-control bg-transparent transition-colors hover:bg-accent/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        data-resize-handle="true"
        onPointerDown={(event) => onResizeStart(columnKey, event)}
        title={`Resize ${label}`}
        type="button"
      />
    </th>
  );
}

export function DataTable<TItem>({
  ariaLabel,
  data,
  columns,
  rowKey,
  storageKey,
  emptyState,
  searchPlaceholder = "Search...",
  initialVisibleColumnKeys,
  defaultSort,
  onRowClick,
  getRowClassName,
  selectedRowKey,
  rowActionsLabel = "Actions",
  renderRowActions,
  enableCellSelection = false,
  showCellGrid = false,
  onVisibleRowsChange,
  viewConfig,
  onConfigChange,
  renderToolbarActions,
  showReadOnlyToggle = false,
  readOnlyMode = true,
  onReadOnlyModeChange,
  readOnlyToggleDisabled = false,
  readOnlyDisabledLabel,
  pinRowActions = true,
  onCellClick
}: DataTableProps<TItem>) {
  const [isHydrated, setIsHydrated] = useState(false);
  const dndContextId = useId();
  const [searchQuery, setSearchQuery] = useState("");
  const [isColumnsDialogOpen, setIsColumnsDialogOpen] = useState(false);
  const [columnContextMenu, setColumnContextMenu] = useState<ColumnContextMenuState | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  const allColumnKeys = useMemo(() => columns.map((column) => column.key), [columns]);

  const defaultVisibleColumns = useMemo(() => {
    if (initialVisibleColumnKeys && initialVisibleColumnKeys.length > 0) {
      const normalized = allColumnKeys.filter((key) => initialVisibleColumnKeys.includes(key));
      return normalized.length > 0 ? normalized : allColumnKeys;
    }

    const fromColumns = columns.filter((column) => column.defaultVisible !== false).map((column) => column.key);
    return fromColumns.length > 0 ? fromColumns : allColumnKeys;
  }, [allColumnKeys, columns, initialVisibleColumnKeys]);

  const defaultPinnedLeftColumns = useMemo(
    () => columns.filter((column) => column.pinDefault === "left").map((column) => column.key),
    [columns]
  );
  const defaultPinnedRightColumns = useMemo(
    () => columns.filter((column) => column.pinDefault === "right").map((column) => column.key),
    [columns]
  );

  const [columnOrderKeys, setColumnOrderKeys] = useState<string[]>(allColumnKeys);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>(defaultVisibleColumns);
  const [pinnedLeftColumnKeys, setPinnedLeftColumnKeys] = useState<string[]>(defaultPinnedLeftColumns);
  const [pinnedRightColumnKeys, setPinnedRightColumnKeys] = useState<string[]>(defaultPinnedRightColumns);
  const [sortColumnKey, setSortColumnKey] = useState<string | null>(defaultSort?.columnKey ?? null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultSort?.direction ?? "asc");
  const [columnWidthOverrides, setColumnWidthOverrides] = useState<Record<string, number>>({});
  const [selectionAnchor, setSelectionAnchor] = useState<CellPoint | null>(null);
  const [selectionFocus, setSelectionFocus] = useState<CellPoint | null>(null);
  const tableShellRef = useRef<HTMLDivElement | null>(null);
  const columnWidthByKeyRef = useRef<Record<string, number>>({});
  const headerCellRefByKey = useRef<Record<string, HTMLTableCellElement | null>>({});
  const resizeObserverByKey = useRef<Record<string, ResizeObserver | null>>({});
  const [columnWidthVersion, setColumnWidthVersion] = useState(0);
  const appliedViewConfigSignatureRef = useRef<string | null>(null);
  const loadedStorageKeyRef = useRef<string | null>(null);
  const activeResizeRef = useRef<{
    columnKey: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const columnByKey = useMemo(() => new Map(columns.map((column) => [column.key, column])), [columns]);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    setColumnOrderKeys((current) => {
      const next = normalizeColumnOrder(current, allColumnKeys);
      return areArraysEqual(current, next) ? current : next;
    });
    setVisibleColumnKeys((current) => {
      const next = normalizeVisibleColumns(current, allColumnKeys, defaultVisibleColumns);
      return areArraysEqual(current, next) ? current : next;
    });
    setPinnedLeftColumnKeys((current) => {
      const next = normalizePinnedColumns(current, allColumnKeys);
      return areArraysEqual(current, next) ? current : next;
    });
    setPinnedRightColumnKeys((current) => {
      const next = normalizePinnedColumns(current, allColumnKeys);
      return areArraysEqual(current, next) ? current : next;
    });
    setColumnWidthOverrides((current) => normalizeColumnWidths(current, allColumnKeys));
  }, [allColumnKeys, defaultVisibleColumns]);

  useEffect(() => {
    if (!storageKey || viewConfig) {
      loadedStorageKeyRef.current = null;
      return;
    }

    if (loadedStorageKeyRef.current === storageKey) {
      return;
    }
    loadedStorageKeyRef.current = storageKey;

    try {
      const storedRaw = window.localStorage.getItem(storageKey);
      if (!storedRaw) {
        return;
      }

      const parsed = JSON.parse(storedRaw) as DataTablePersistedState;

      setColumnOrderKeys(normalizeColumnOrder(parsed.columnOrderKeys, allColumnKeys));
      setVisibleColumnKeys(normalizeVisibleColumns(parsed.visibleColumnKeys, allColumnKeys, defaultVisibleColumns));
      setPinnedLeftColumnKeys(normalizePinnedColumns(parsed.pinnedLeftColumnKeys, allColumnKeys));
      setPinnedRightColumnKeys(normalizePinnedColumns(parsed.pinnedRightColumnKeys, allColumnKeys));
      setColumnWidthOverrides(normalizeColumnWidths(parsed.columnWidthsByKey, allColumnKeys));
    } catch {
      setColumnOrderKeys(allColumnKeys);
      setVisibleColumnKeys(defaultVisibleColumns);
      setPinnedLeftColumnKeys(defaultPinnedLeftColumns);
      setPinnedRightColumnKeys(defaultPinnedRightColumns);
      setColumnWidthOverrides({});
    }
  }, [allColumnKeys, defaultPinnedLeftColumns, defaultPinnedRightColumns, defaultVisibleColumns, storageKey, viewConfig]);

  useEffect(() => {
    if (!storageKey) {
      return;
    }

    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          visibleColumnKeys,
          columnOrderKeys,
          pinnedLeftColumnKeys,
          pinnedRightColumnKeys,
          columnWidthsByKey: columnWidthOverrides
        })
      );
    } catch {
      // Ignore localStorage failures.
    }
  }, [columnOrderKeys, columnWidthOverrides, pinnedLeftColumnKeys, pinnedRightColumnKeys, storageKey, visibleColumnKeys]);

  const viewConfigSignature = useMemo(() => JSON.stringify(viewConfig ?? null), [viewConfig]);

  useEffect(() => {
    if (!viewConfig) {
      appliedViewConfigSignatureRef.current = null;
      return;
    }

    if (appliedViewConfigSignatureRef.current === viewConfigSignature) {
      return;
    }
    appliedViewConfigSignatureRef.current = viewConfigSignature;

    setColumnOrderKeys(normalizeColumnOrder(viewConfig.columnOrderKeys, allColumnKeys));
    setVisibleColumnKeys(normalizeVisibleColumns(viewConfig.visibleColumnKeys, allColumnKeys, defaultVisibleColumns));
    setPinnedLeftColumnKeys(
      Array.isArray(viewConfig.pinnedLeftColumnKeys)
        ? normalizePinnedColumns(viewConfig.pinnedLeftColumnKeys, allColumnKeys)
        : defaultPinnedLeftColumns
    );
    setPinnedRightColumnKeys(
      Array.isArray(viewConfig.pinnedRightColumnKeys)
        ? normalizePinnedColumns(viewConfig.pinnedRightColumnKeys, allColumnKeys)
        : defaultPinnedRightColumns
    );
    setColumnWidthOverrides(normalizeColumnWidths(viewConfig.columnWidthsByKey, allColumnKeys));

    if (viewConfig.sort) {
      const requestedKey = typeof viewConfig.sort.columnKey === "string" ? viewConfig.sort.columnKey : null;
      const nextSortKey = requestedKey && allColumnKeys.includes(requestedKey) ? requestedKey : null;
      setSortColumnKey(nextSortKey);
      setSortDirection(viewConfig.sort.direction === "desc" ? "desc" : "asc");
    } else {
      setSortColumnKey(defaultSort?.columnKey ?? null);
      setSortDirection(defaultSort?.direction ?? "asc");
    }

    setSearchQuery(typeof viewConfig.searchQuery === "string" ? viewConfig.searchQuery : "");
  }, [
    allColumnKeys,
    defaultPinnedLeftColumns,
    defaultPinnedRightColumns,
    defaultSort?.columnKey,
    defaultSort?.direction,
    defaultVisibleColumns,
    viewConfig,
    viewConfigSignature
  ]);

  const orderedColumns = useMemo(() => {
    return columnOrderKeys.map((key) => columnByKey.get(key)).filter((column): column is DataTableColumn<TItem> => Boolean(column));
  }, [columnByKey, columnOrderKeys]);

  const orderedColumnGroups = useMemo(() => {
    const grouped = new Map<string, DataTableColumn<TItem>[]>();

    orderedColumns.forEach((column) => {
      const groupLabel = column.group ?? "Columns";
      const current = grouped.get(groupLabel) ?? [];
      current.push(column);
      grouped.set(groupLabel, current);
    });

    return Array.from(grouped.entries());
  }, [orderedColumns]);

  const visibleColumns = useMemo(() => {
    return orderedColumns.filter((column) => visibleColumnKeys.includes(column.key));
  }, [orderedColumns, visibleColumnKeys]);

  const visibleColumnIndexByKey = useMemo(
    () => new Map(visibleColumns.map((column, index) => [column.key, index])),
    [visibleColumns]
  );

  const effectivePinnedLeftColumnKeys = useMemo(() => {
    const wanted = new Set(pinnedLeftColumnKeys);
    const next: string[] = [];

    for (const column of visibleColumns) {
      if (!wanted.has(column.key)) {
        break;
      }
      next.push(column.key);
    }

    return next;
  }, [pinnedLeftColumnKeys, visibleColumns]);

  const effectivePinnedRightColumnKeys = useMemo(() => {
    const wanted = new Set(pinnedRightColumnKeys);
    const leftPinnedSet = new Set(effectivePinnedLeftColumnKeys);
    const next: string[] = [];

    for (let index = visibleColumns.length - 1; index >= 0; index -= 1) {
      const key = visibleColumns[index]?.key;
      if (!key || leftPinnedSet.has(key) || !wanted.has(key)) {
        break;
      }
      next.unshift(key);
    }

    return next;
  }, [effectivePinnedLeftColumnKeys, pinnedRightColumnKeys, visibleColumns]);

  const effectivePinnedLeftSet = useMemo(() => new Set(effectivePinnedLeftColumnKeys), [effectivePinnedLeftColumnKeys]);
  const effectivePinnedRightSet = useMemo(() => new Set(effectivePinnedRightColumnKeys), [effectivePinnedRightColumnKeys]);

  useLayoutEffect(() => {
    onConfigChange?.({
      visibleColumnKeys,
      columnOrderKeys,
      pinnedLeftColumnKeys: effectivePinnedLeftColumnKeys,
      pinnedRightColumnKeys: effectivePinnedRightColumnKeys,
      columnWidthsByKey: columnWidthOverrides,
      sort: {
        columnKey: sortColumnKey,
        direction: sortDirection
      },
      searchQuery
    });
  }, [
    columnOrderKeys,
    effectivePinnedLeftColumnKeys,
    effectivePinnedRightColumnKeys,
    onConfigChange,
    searchQuery,
    sortColumnKey,
    sortDirection,
    visibleColumnKeys,
    columnWidthOverrides
  ]);

  const rowActionsPinned = Boolean(renderRowActions && pinRowActions);

  function getLeftPinCandidateIndex() {
    return effectivePinnedLeftColumnKeys.length;
  }

  function getRightPinCandidateIndex() {
    if (rowActionsPinned) {
      return visibleColumns.length - 1 - effectivePinnedRightColumnKeys.length;
    }

    return visibleColumns.length - 1 - effectivePinnedRightColumnKeys.length;
  }

  function canPinLeft(columnKey: string) {
    if (effectivePinnedLeftSet.has(columnKey)) {
      return true;
    }

    const index = visibleColumnIndexByKey.get(columnKey);
    if (typeof index !== "number") {
      return false;
    }

    return index === 0 || index === getLeftPinCandidateIndex();
  }

  function canPinRight(columnKey: string) {
    if (effectivePinnedRightSet.has(columnKey)) {
      return true;
    }

    const index = visibleColumnIndexByKey.get(columnKey);
    if (typeof index !== "number") {
      return false;
    }

    return index === getRightPinCandidateIndex();
  }

  function canUnpinLeft(columnKey: string) {
    if (!effectivePinnedLeftSet.has(columnKey)) {
      return false;
    }

    return effectivePinnedLeftColumnKeys[effectivePinnedLeftColumnKeys.length - 1] === columnKey;
  }

  function canUnpinRight(columnKey: string) {
    if (!effectivePinnedRightSet.has(columnKey)) {
      return false;
    }

    return effectivePinnedRightColumnKeys[0] === columnKey;
  }

  const searchableColumns = useMemo(() => {
    const explicitSearchable = orderedColumns.filter((column) => column.searchable !== false);
    return explicitSearchable.length > 0 ? explicitSearchable : orderedColumns;
  }, [orderedColumns]);

  useEffect(() => {
    if (sortColumnKey && !visibleColumnKeys.includes(sortColumnKey)) {
      setSortColumnKey(null);
    }
  }, [sortColumnKey, visibleColumnKeys]);

  const filteredAndSortedRows = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const filteredRows = normalizedQuery
      ? data.filter((item) => {
          const composedSearch = searchableColumns
            .map((column) => {
              if (column.renderSearchValue) {
                return column.renderSearchValue(item);
              }

              if (column.renderSortValue) {
                return String(column.renderSortValue(item) ?? "");
              }

              return "";
            })
            .join(" ")
            .toLowerCase();

          return composedSearch.includes(normalizedQuery);
        })
      : data;

    const sortColumn = sortColumnKey ? columnByKey.get(sortColumnKey) : null;
    if (!sortColumn?.sortable) {
      return filteredRows;
    }

    const directionFactor = sortDirection === "asc" ? 1 : -1;

    return [...filteredRows].sort((left, right) => {
      const leftValue = normalizeSortValue(sortColumn.renderSortValue?.(left));
      const rightValue = normalizeSortValue(sortColumn.renderSortValue?.(right));

      if (leftValue < rightValue) {
        return -1 * directionFactor;
      }

      if (leftValue > rightValue) {
        return 1 * directionFactor;
      }

      return 0;
    });
  }, [columnByKey, data, searchQuery, searchableColumns, sortColumnKey, sortDirection]);

  useEffect(() => {
    onVisibleRowsChange?.(filteredAndSortedRows);
  }, [filteredAndSortedRows, onVisibleRowsChange]);

  useEffect(() => {
    if (!enableCellSelection) {
      return;
    }

    if (!selectionAnchor || !selectionFocus) {
      return;
    }

    const maxRowIndex = Math.max(0, filteredAndSortedRows.length - 1);
    const maxColumnIndex = Math.max(0, visibleColumns.length - 1);
    const clamp = (point: CellPoint): CellPoint => ({
      rowIndex: Math.max(0, Math.min(point.rowIndex, maxRowIndex)),
      columnIndex: Math.max(0, Math.min(point.columnIndex, maxColumnIndex))
    });
    const clampedAnchor = clamp(selectionAnchor);
    const clampedFocus = clamp(selectionFocus);

    if (clampedAnchor.rowIndex !== selectionAnchor.rowIndex || clampedAnchor.columnIndex !== selectionAnchor.columnIndex) {
      setSelectionAnchor(clampedAnchor);
    }

    if (clampedFocus.rowIndex !== selectionFocus.rowIndex || clampedFocus.columnIndex !== selectionFocus.columnIndex) {
      setSelectionFocus(clampedFocus);
    }
  }, [enableCellSelection, filteredAndSortedRows.length, selectionAnchor, selectionFocus, visibleColumns.length]);

  function normalizeCopyValue(value: string | number | Date | null | undefined) {
    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value === null || value === undefined) {
      return "";
    }

    return String(value);
  }

  function getCellCopyValue(item: TItem, column: DataTableColumn<TItem>) {
    if (column.renderCopyValue) {
      return column.renderCopyValue(item);
    }

    if (column.renderSearchValue) {
      return column.renderSearchValue(item);
    }

    if (column.renderSortValue) {
      return normalizeCopyValue(column.renderSortValue(item));
    }

    return "";
  }

  function getSelectionBounds(anchor: CellPoint, focus: CellPoint) {
    return {
      minRow: Math.min(anchor.rowIndex, focus.rowIndex),
      maxRow: Math.max(anchor.rowIndex, focus.rowIndex),
      minColumn: Math.min(anchor.columnIndex, focus.columnIndex),
      maxColumn: Math.max(anchor.columnIndex, focus.columnIndex)
    };
  }

  function isCellInSelection(rowIndex: number, columnIndex: number) {
    if (!enableCellSelection || !selectionAnchor || !selectionFocus) {
      return false;
    }

    const bounds = getSelectionBounds(selectionAnchor, selectionFocus);
    return rowIndex >= bounds.minRow && rowIndex <= bounds.maxRow && columnIndex >= bounds.minColumn && columnIndex <= bounds.maxColumn;
  }

  const selectionBounds = useMemo(() => {
    if (!enableCellSelection || !selectionAnchor || !selectionFocus) {
      return null;
    }
    return getSelectionBounds(selectionAnchor, selectionFocus);
  }, [enableCellSelection, selectionAnchor, selectionFocus]);

  function getCellSelectionOverlayStyle(rowIndex: number, columnIndex: number): CSSProperties | undefined {
    if (!selectionBounds) {
      return undefined;
    }

    const inSelection =
      rowIndex >= selectionBounds.minRow &&
      rowIndex <= selectionBounds.maxRow &&
      columnIndex >= selectionBounds.minColumn &&
      columnIndex <= selectionBounds.maxColumn;
    if (!inSelection) {
      return undefined;
    }

    const isTop = rowIndex === selectionBounds.minRow;
    const isBottom = rowIndex === selectionBounds.maxRow;
    const isLeft = columnIndex === selectionBounds.minColumn;
    const isRight = columnIndex === selectionBounds.maxColumn;
    const hasEdge = isTop || isBottom || isLeft || isRight;
    if (!hasEdge) {
      return undefined;
    }

    const dashedHorizontal = "repeating-linear-gradient(90deg, hsl(var(--accent) / 0.95) 0 7px, transparent 7px 12px)";
    const dashedVertical = "repeating-linear-gradient(180deg, hsl(var(--accent) / 0.95) 0 7px, transparent 7px 12px)";
    const transparent = "linear-gradient(transparent, transparent)";

    return {
      backgroundImage: [isTop ? dashedHorizontal : transparent, isBottom ? dashedHorizontal : transparent, isLeft ? dashedVertical : transparent, isRight ? dashedVertical : transparent].join(", "),
      backgroundSize: "100% 2px, 100% 2px, 2px 100%, 2px 100%",
      backgroundPosition: "0 0, 0 100%, 0 0, 100% 0",
      backgroundRepeat: "repeat-x, repeat-x, repeat-y, repeat-y",
      animation: "datatable-marching-ants 0.7s linear infinite"
    };
  }

  function getCellStyle(rowIndex: number, columnIndex: number, columnKey: string): CSSProperties | undefined {
    const pinnedStyle = getPinnedColumnCellStyle(columnKey);
    const selectionOverlayStyle = getCellSelectionOverlayStyle(rowIndex, columnIndex);
    if (!pinnedStyle) {
      return selectionOverlayStyle;
    }
    if (!selectionOverlayStyle) {
      return pinnedStyle;
    }
    return {
      ...pinnedStyle,
      ...selectionOverlayStyle
    };
  }

  function copySelectionToClipboard() {
    if (!enableCellSelection || !selectionAnchor || !selectionFocus) {
      return;
    }

    const bounds = getSelectionBounds(selectionAnchor, selectionFocus);
    const lines: string[] = [];

    for (let rowIndex = bounds.minRow; rowIndex <= bounds.maxRow; rowIndex += 1) {
      const row = filteredAndSortedRows[rowIndex];
      if (!row) {
        continue;
      }

      const values: string[] = [];
      for (let columnIndex = bounds.minColumn; columnIndex <= bounds.maxColumn; columnIndex += 1) {
        const column = visibleColumns[columnIndex];
        if (!column) {
          continue;
        }

        const rawValue = getCellCopyValue(row, column);
        values.push(rawValue.replace(/\t/g, " ").replace(/\r?\n/g, " "));
      }

      lines.push(values.join("\t"));
    }

    const payload = lines.join("\n");
    if (!payload) {
      return;
    }

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(payload);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = payload;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  function handleCellClick(
    event: MouseEvent<HTMLTableCellElement>,
    rowIndex: number,
    columnIndex: number,
    item: TItem,
    key: string,
    columnKey: string
  ) {
    if (enableCellSelection && !isInteractiveTarget(event.target)) {
      event.stopPropagation();
    }

    const nextPoint: CellPoint = { rowIndex, columnIndex };
    const isAlreadyActiveCell =
      Boolean(selectionFocus) &&
      selectionFocus?.rowIndex === rowIndex &&
      selectionFocus?.columnIndex === columnIndex &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey;

    if (enableCellSelection) {
      tableShellRef.current?.focus();

      if (event.shiftKey && selectionAnchor) {
        setSelectionFocus(nextPoint);
      } else {
        setSelectionAnchor(nextPoint);
        setSelectionFocus(nextPoint);
      }
    }

    onCellClick?.({
      item,
      rowIndex,
      columnIndex,
      rowKey: key,
      columnKey,
      isActiveCell: isAlreadyActiveCell
    });
  }

  function suppressNativeTextSelection(event: MouseEvent<HTMLTableElement>) {
    if (!enableCellSelection || isInteractiveTarget(event.target)) {
      return;
    }
    event.preventDefault();
  }

  function handleColumnToggle(columnKey: string, nextChecked: boolean) {
    if (isLockedSelectionColumn(columnKey)) {
      return;
    }

    setVisibleColumnKeys((current) => {
      const withChange = nextChecked ? [...current, columnKey] : current.filter((key) => key !== columnKey);
      const normalized = allColumnKeys.filter((key) => withChange.includes(key));
      return normalized.length > 0 ? normalized : [columnKey];
    });
  }

  function canHideColumn(columnKey: string) {
    if (isLockedSelectionColumn(columnKey)) {
      return false;
    }
    return visibleColumnKeys.includes(columnKey) && visibleColumnKeys.length > 1;
  }

  function handleHideColumn(columnKey: string) {
    if (!canHideColumn(columnKey)) {
      return;
    }

    setVisibleColumnKeys((current) => current.filter((key) => key !== columnKey));
    setPinnedLeftColumnKeys((current) => current.filter((key) => key !== columnKey));
    setPinnedRightColumnKeys((current) => current.filter((key) => key !== columnKey));
  }

  function handleColumnPinLeftToggle(columnKey: string) {
    if (effectivePinnedLeftSet.has(columnKey)) {
      if (!canUnpinLeft(columnKey)) {
        return;
      }

      setPinnedLeftColumnKeys((current) => current.filter((key) => key !== columnKey));
      return;
    }

    if (!canPinLeft(columnKey)) {
      return;
    }

    setPinnedRightColumnKeys((current) => current.filter((key) => key !== columnKey));
    setPinnedLeftColumnKeys((current) => [...current.filter((key) => key !== columnKey), columnKey]);
  }

  function handleColumnPinRightToggle(columnKey: string) {
    if (effectivePinnedRightSet.has(columnKey)) {
      if (!canUnpinRight(columnKey)) {
        return;
      }

      setPinnedRightColumnKeys((current) => current.filter((key) => key !== columnKey));
      return;
    }

    if (!canPinRight(columnKey)) {
      return;
    }

    setPinnedLeftColumnKeys((current) => current.filter((key) => key !== columnKey));
    setPinnedRightColumnKeys((current) => [...current.filter((key) => key !== columnKey), columnKey]);
  }

  function getPinActionForColumn(columnKey: string): "pin-left" | "pin-right" | "unpin-left" | "unpin-right" | null {
    if (effectivePinnedLeftSet.has(columnKey)) {
      return canUnpinLeft(columnKey) ? "unpin-left" : null;
    }

    if (effectivePinnedRightSet.has(columnKey)) {
      return canUnpinRight(columnKey) ? "unpin-right" : null;
    }

    const allowLeft = canPinLeft(columnKey);
    const allowRight = canPinRight(columnKey);

    if (allowLeft && allowRight) {
      return "pin-left";
    }

    if (allowLeft) {
      return "pin-left";
    }

    if (allowRight) {
      return "pin-right";
    }

    return null;
  }

  function handleHeaderContextMenu(columnKey: string, event: MouseEvent<HTMLTableCellElement>) {
    event.preventDefault();

    if (isLockedSelectionColumn(columnKey)) {
      setColumnContextMenu(null);
      return;
    }
    setColumnContextMenu({
      columnKey,
      anchorPoint: {
        x: event.clientX,
        y: event.clientY
      }
    });
  }

  function handleHeaderPinAction(columnKey: string, action: "pin-left" | "pin-right" | "unpin-left" | "unpin-right") {
    if (action === "pin-left" || action === "unpin-left") {
      handleColumnPinLeftToggle(columnKey);
      return;
    }

    handleColumnPinRightToggle(columnKey);
  }

  function handleSortToggle(columnKey: string) {
    if (sortColumnKey !== columnKey) {
      setSortColumnKey(columnKey);
      setSortDirection("asc");
      return;
    }

    setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
  }

  function handleColumnResizeStart(columnKey: string, event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    const headerCell = headerCellRefByKey.current[columnKey];
    if (!headerCell) {
      return;
    }

    const startWidth = Math.max(64, Math.round(headerCell.getBoundingClientRect().width));
    activeResizeRef.current = {
      columnKey,
      startX: event.clientX,
      startWidth
    };

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const activeResize = activeResizeRef.current;
      if (!activeResize) {
        return;
      }

      const delta = moveEvent.clientX - activeResize.startX;
      const nextWidth = Math.max(64, Math.round(activeResize.startWidth + delta));
      setColumnWidthOverrides((current) => {
        if (current[activeResize.columnKey] === nextWidth) {
          return current;
        }
        return {
          ...current,
          [activeResize.columnKey]: nextWidth
        };
      });
    };

    const handlePointerUp = () => {
      activeResizeRef.current = null;
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  function handleInlineHeaderReorder(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;

    if (!overId || activeId === overId || isLockedSelectionColumn(activeId) || isLockedSelectionColumn(overId)) {
      return;
    }

    setColumnOrderKeys((current) => {
      const visibleKeysInOrder = current.filter((key) => visibleColumnKeys.includes(key) && !isLockedSelectionColumn(key));
      const oldIndex = visibleKeysInOrder.indexOf(activeId);
      const newIndex = visibleKeysInOrder.indexOf(overId);

      if (oldIndex < 0 || newIndex < 0) {
        return current;
      }

      const reorderedVisibleKeys = arrayMove(visibleKeysInOrder, oldIndex, newIndex);
      let visibleCursor = 0;

      return current.map((key) => {
        if (!visibleColumnKeys.includes(key) || isLockedSelectionColumn(key)) {
          return key;
        }

        const nextKey = reorderedVisibleKeys[visibleCursor];
        visibleCursor += 1;
        return nextKey;
      });
    });
  }

  function setHeaderCellRef(key: string, node: HTMLTableCellElement | null) {
    const current = headerCellRefByKey.current[key];
    if (current === node) {
      return;
    }

    const observer = resizeObserverByKey.current[key];
    if (observer) {
      observer.disconnect();
      resizeObserverByKey.current[key] = null;
    }

    headerCellRefByKey.current[key] = node;
    if (!node) {
      return;
    }

    const updateWidth = () => {
      const nextWidth = Math.max(0, Math.round(node.getBoundingClientRect().width));
      if (columnWidthByKeyRef.current[key] === nextWidth) {
        return;
      }
      columnWidthByKeyRef.current[key] = nextWidth;
      setColumnWidthVersion((currentVersion) => currentVersion + 1);
    };

    updateWidth();
    if (typeof ResizeObserver !== "undefined") {
      const nextObserver = new ResizeObserver(() => updateWidth());
      nextObserver.observe(node);
      resizeObserverByKey.current[key] = nextObserver;
    }
  }

  useEffect(
    () => () => {
      Object.values(resizeObserverByKey.current).forEach((observer) => observer?.disconnect());
    },
    []
  );

  const leftPinnedOffsetByKey = useMemo(() => {
    void columnWidthVersion;

    let offset = 0;
    const next = new Map<string, number>();
    for (const key of effectivePinnedLeftColumnKeys) {
      next.set(key, offset);
      offset += columnWidthByKeyRef.current[key] ?? 0;
    }
    return next;
  }, [columnWidthVersion, effectivePinnedLeftColumnKeys]);

  const rightPinnedOffsetByKey = useMemo(() => {
    void columnWidthVersion;

    let offset = rowActionsPinned ? (columnWidthByKeyRef.current.__actions ?? 0) : 0;
    const next = new Map<string, number>();
    for (let index = effectivePinnedRightColumnKeys.length - 1; index >= 0; index -= 1) {
      const key = effectivePinnedRightColumnKeys[index];
      if (!key) {
        continue;
      }
      next.set(key, offset);
      offset += columnWidthByKeyRef.current[key] ?? 0;
    }
    return next;
  }, [columnWidthVersion, effectivePinnedRightColumnKeys, rowActionsPinned]);

  function getPinnedColumnCellClass(columnKey: string) {
    if (effectivePinnedLeftSet.has(columnKey) || effectivePinnedRightSet.has(columnKey)) {
      return "sticky z-[6] bg-surface";
    }

    return undefined;
  }

  function getPinnedColumnCellStyle(columnKey: string): CSSProperties | undefined {
    const widthOverride = columnWidthOverrides[columnKey];
    const widthStyle =
      typeof widthOverride === "number"
        ? {
            width: `${widthOverride}px`,
            minWidth: `${widthOverride}px`,
            maxWidth: `${widthOverride}px`
          }
        : undefined;

    if (effectivePinnedLeftSet.has(columnKey)) {
      return {
        ...(widthStyle ?? {}),
        left: `${leftPinnedOffsetByKey.get(columnKey) ?? 0}px`
      };
    }

    if (effectivePinnedRightSet.has(columnKey)) {
      return {
        ...(widthStyle ?? {}),
        right: `${rightPinnedOffsetByKey.get(columnKey) ?? 0}px`
      };
    }

    return widthStyle;
  }

  const rowActionsPinnedClassName = rowActionsPinned ? "sticky right-0 z-[7] bg-surface" : undefined;
  const normalizedSearchQuery = searchQuery.trim();
  const hasActiveSearch = normalizedSearchQuery.length > 0;
  const rowSummary = formatRowSummary(filteredAndSortedRows.length, data.length);
  const hasCustomColumnLayout =
    !areArraysEqual(columnOrderKeys, allColumnKeys) ||
    !areArraysEqual(visibleColumnKeys, defaultVisibleColumns) ||
    !areArraysEqual(pinnedLeftColumnKeys, defaultPinnedLeftColumns) ||
    !areArraysEqual(pinnedRightColumnKeys, defaultPinnedRightColumns) ||
    Object.keys(columnWidthOverrides).length > 0;
  const hasCustomSort = sortColumnKey !== (defaultSort?.columnKey ?? null) || sortDirection !== (defaultSort?.direction ?? "asc");
  const hasActiveCustomizations = hasActiveSearch || hasCustomColumnLayout || hasCustomSort;
  const contextMenuColumnKey = columnContextMenu?.columnKey ?? null;
  const contextMenuColumn = contextMenuColumnKey ? columnByKey.get(contextMenuColumnKey) ?? null : null;
  const contextMenuCanHide = contextMenuColumnKey ? canHideColumn(contextMenuColumnKey) : false;
  const contextMenuPinAction = contextMenuColumnKey ? getPinActionForColumn(contextMenuColumnKey) : null;
  const tableGridClass = showCellGrid
    ? "[&_th]:border-b [&_th]:border-border/75 [&_td]:border-b [&_td]:border-border/60 [&_th:not(:last-child)]:border-r [&_th:not(:last-child)]:border-border/60 [&_td:not(:last-child)]:border-r [&_td:not(:last-child)]:border-border/50"
    : "[&_th]:border-b [&_th]:border-border/65 [&_td]:border-b [&_td]:border-border/45 [&_th:not(:last-child)]:border-r [&_th:not(:last-child)]:border-border/45 [&_td:not(:last-child)]:border-r [&_td:not(:last-child)]:border-border/30";

  function resetTableView() {
    setColumnOrderKeys(allColumnKeys);
    setVisibleColumnKeys(defaultVisibleColumns);
    setPinnedLeftColumnKeys(defaultPinnedLeftColumns);
    setPinnedRightColumnKeys(defaultPinnedRightColumns);
    setColumnWidthOverrides({});
    setSortColumnKey(defaultSort?.columnKey ?? null);
    setSortDirection(defaultSort?.direction ?? "asc");
    setSearchQuery("");
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <style>{`
        @keyframes datatable-marching-ants {
          to {
            background-position: 12px 0, -12px 100%, 0 -12px, 100% 12px;
          }
        }
      `}</style>
      <div className="mb-3 flex items-center gap-3 overflow-x-auto pb-1">
        <div className="relative w-[16rem] shrink-0 md:w-[20rem]">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <Input
            className="h-10 rounded-full border-border/80 bg-surface pl-9 pr-9 text-[15px]"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={searchPlaceholder}
            value={searchQuery}
          />
          {hasActiveSearch ? (
            <button
              aria-label="Clear search"
              className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setSearchQuery("")}
              title="Clear search"
              type="button"
            >
              <X aria-hidden className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap">
          <p aria-live="polite" className="mr-1 text-xs font-medium text-text-muted">
            {rowSummary}
          </p>
          {showReadOnlyToggle ? (
            <Button
              disabled={readOnlyToggleDisabled}
              onClick={() => onReadOnlyModeChange?.(!readOnlyMode)}
              size="sm"
              variant={readOnlyMode ? "ghost" : "secondary"}
            >
              {readOnlyMode ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
              {readOnlyToggleDisabled && readOnlyDisabledLabel
                ? readOnlyDisabledLabel
                : readOnlyMode
                  ? "Read only"
                  : "Editing enabled"}
            </Button>
          ) : null}
          {renderToolbarActions}
          <Button onClick={() => setIsColumnsDialogOpen(true)} size="sm" variant="secondary">
            <Settings2 aria-hidden className="h-3.5 w-3.5" />
            Columns
          </Button>
          <Button disabled={!hasActiveCustomizations} onClick={resetTableView} size="sm" variant="ghost">
            Reset
          </Button>
        </div>
      </div>

      <div
        // Component-owned scroll: this shell fills the available height
        // (its parent CardContent is `app-card-fill__content` = flex 1
        // with min-height:0) and overflows on BOTH axes. The thead's
        // `sticky top-0` then pins to the shell's top edge.
        className="flex-1 min-h-0 overflow-auto rounded-control border border-border/80 bg-surface"
        onKeyDown={(event) => {
          if (!enableCellSelection || isInteractiveTarget(event.target)) {
            return;
          }

          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
            event.preventDefault();
            copySelectionToClipboard();
          }
        }}
        ref={tableShellRef}
        tabIndex={enableCellSelection ? 0 : -1}
      >

        {isHydrated ? (
          <DndContext collisionDetection={closestCenter} id={dndContextId} onDragEnd={handleInlineHeaderReorder} sensors={sensors}>
            <Table
              aria-label={ariaLabel}
              className={cn(
                "min-w-full w-max table-auto border-separate border-spacing-0 [&_th]:w-auto [&_th]:whitespace-nowrap [&_th]:select-text [&_td]:w-auto [&_td]:bg-surface [&_td]:align-top",
                enableCellSelection ? "[&_td]:select-none" : "[&_td]:select-text",
                tableGridClass
              )}
              onMouseDownCapture={suppressNativeTextSelection}
            >
              <TableHeader className="sticky top-0 z-[5] border-b border-border bg-surface-muted/95 backdrop-blur supports-[backdrop-filter]:bg-surface-muted/80">
                <TableRow className="bg-transparent hover:bg-transparent">
                  <SortableContext
                    items={visibleColumns.filter((column) => !isLockedSelectionColumn(column.key)).map((column) => column.key)}
                    strategy={horizontalListSortingStrategy}
                  >
                    {visibleColumns.map((column) => (
                      <SortableHeaderCell
                        cellStyle={getPinnedColumnCellStyle(column.key)}
                        columnKey={column.key}
                        headerClassName={column.headerClassName}
                        isSorted={sortColumnKey === column.key}
                        key={column.key}
                        label={column.label}
                        renderHeader={column.renderHeader}
                        onMount={(node) => setHeaderCellRef(column.key, node)}
                        onContextMenu={handleHeaderContextMenu}
                        onResizeStart={handleColumnResizeStart}
                        onSortToggle={handleSortToggle}
                        canReorder={!isLockedSelectionColumn(column.key)}
                        pinnedClassName={getPinnedColumnCellClass(column.key)}
                        sortDirection={sortDirection}
                        sortable={Boolean(column.sortable)}
                      />
                    ))}
                    {renderRowActions ? (
                      <th
                        className={cn("h-12 px-3 text-right align-middle text-[12px] font-semibold tracking-wide text-text md:px-4", rowActionsPinnedClassName)}
                        ref={(node) => setHeaderCellRef("__actions", node)}
                      >
                        {rowActionsLabel}
                      </th>
                    ) : null}
                  </SortableContext>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedRows.length === 0 ? (
                  <TableRow>
                    <TableCell className="py-10 text-center text-text-muted" colSpan={visibleColumns.length + (renderRowActions ? 1 : 0)}>
                      {emptyState}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAndSortedRows.map((item, rowIndex) => {
                    const key = rowKey(item);
                    const isSelected = selectedRowKey === key;

                    return (
                      <TableRow
                        className={cn(
                          onRowClick ? "cursor-pointer focus-within:bg-surface-muted/35" : undefined,
                          isSelected ? "bg-surface-muted/55" : undefined,
                          getRowClassName?.(item)
                        )}
                        key={key}
                        onClick={(event) => {
                          if (enableCellSelection || !onRowClick || isInteractiveTarget(event.target) || hasActiveTextSelection()) {
                            return;
                          }

                          onRowClick(item);
                        }}
                        onKeyDown={(event) => {
                          if (enableCellSelection || !onRowClick || isInteractiveTarget(event.target) || hasActiveTextSelection()) {
                            return;
                          }

                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onRowClick(item);
                          }
                        }}
                        role={onRowClick ? "button" : undefined}
                        tabIndex={onRowClick ? 0 : undefined}
                      >
                        {visibleColumns.map((column, columnIndex) => (
                          <TableCell
                            className={cn(
                              column.className,
                              isSelected ? "bg-accent/10" : "bg-surface",
                              "overflow-hidden px-3 py-3.5 md:px-4",
                              getPinnedColumnCellClass(column.key),
                              enableCellSelection ? "cursor-cell" : undefined,
                              isCellInSelection(rowIndex, columnIndex) ? "relative bg-accent/20" : undefined,
                              selectionFocus?.rowIndex === rowIndex && selectionFocus?.columnIndex === columnIndex ? "ring-2 ring-inset ring-accent" : undefined
                            )}
                            key={column.key}
                            onMouseDown={(event) => {
                              if (!enableCellSelection || isInteractiveTarget(event.target)) {
                                return;
                              }
                              event.preventDefault();
                              handleCellClick(event, rowIndex, columnIndex, item, key, column.key);
                            }}
                            style={getCellStyle(rowIndex, columnIndex, column.key)}
                          >
                            {column.renderCell(item, {
                              rowIndex,
                              columnIndex,
                              isCellSelected: isCellInSelection(rowIndex, columnIndex)
                            })}
                          </TableCell>
                        ))}
                      {renderRowActions ? (
                          <TableCell
                            className={cn(
                              "w-1 whitespace-nowrap px-3 py-3.5 text-right md:px-4",
                              isSelected ? "bg-accent/10" : "bg-surface",
                              "overflow-hidden",
                              rowActionsPinnedClassName
                            )}
                          >
                            <div className="inline-flex items-center gap-1" data-row-action="true">
                              {renderRowActions(item)}
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </DndContext>
        ) : (
          <Table
            aria-label={ariaLabel}
            className={cn(
              "min-w-full w-max table-auto border-separate border-spacing-0 [&_th]:w-auto [&_th]:whitespace-nowrap [&_th]:select-text [&_td]:w-auto [&_td]:bg-surface [&_td]:align-top",
              enableCellSelection ? "[&_td]:select-none" : "[&_td]:select-text",
              tableGridClass
            )}
            onMouseDownCapture={suppressNativeTextSelection}
          >
            <TableHeader className="sticky top-0 z-10 border-b border-border bg-surface-muted/95 backdrop-blur supports-[backdrop-filter]:bg-surface-muted/80">
              <TableRow>
                {visibleColumns.map((column) => (
                  <th
                    className={cn(
                      "group relative h-12 px-3 text-left align-middle text-[12px] font-semibold md:px-4",
                      column.headerClassName,
                      getPinnedColumnCellClass(column.key)
                    )}
                    aria-sort={column.sortable && sortColumnKey === column.key ? (sortDirection === "asc" ? "ascending" : "descending") : undefined}
                    key={column.key}
                    onContextMenu={(event) => handleHeaderContextMenu(column.key, event)}
                    ref={(node) => setHeaderCellRef(column.key, node)}
                    style={getPinnedColumnCellStyle(column.key)}
                    title="Right-click for column options"
                  >
                    <div className="relative flex min-w-0 items-center justify-between gap-2 pr-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {!isLockedSelectionColumn(column.key) ? (
                          <span className={cn(headerIconButtonClassName, "h-6 w-6 shrink-0 opacity-35 group-hover:opacity-100")}>
                            <GripVertical aria-hidden className="h-3.5 w-3.5" />
                          </span>
                        ) : null}
                        {column.sortable ? (
                          <button
                            aria-label={sortColumnKey === column.key ? `Sort ${column.label} (${sortDirection === "asc" ? "ascending" : "descending"})` : `Sort ${column.label}`}
                            className="inline-flex min-w-0 items-center gap-1 rounded-control px-1 py-0.5 text-left text-[12px] font-semibold tracking-wide text-text transition-colors hover:bg-surface-muted/60 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
                            onClick={() => handleSortToggle(column.key)}
                            title={sortColumnKey === column.key ? `Sorted ${sortDirection === "asc" ? "ascending" : "descending"}` : "Sort"}
                            type="button"
                          >
                            <span className="truncate">{column.label}</span>
                            {sortColumnKey === column.key ? (
                              sortDirection === "asc" ? (
                                <ArrowUp aria-hidden className="h-3.5 w-3.5 shrink-0 text-text" />
                              ) : (
                                <ArrowDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-text" />
                              )
                            ) : (
                              <ArrowUpDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-text-muted/70" />
                            )}
                          </button>
                        ) : column.renderHeader ? (
                          <div className="min-w-0">{column.renderHeader()}</div>
                        ) : (
                          <span className="block truncate whitespace-nowrap text-[12px] font-semibold tracking-wide text-text">{column.label}</span>
                        )}
                      </div>
                    </div>
                    <button
                      aria-label={`Resize ${column.label} column`}
                      className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none rounded-r-control bg-transparent transition-colors hover:bg-accent/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      data-resize-handle="true"
                      onPointerDown={(event) => handleColumnResizeStart(column.key, event)}
                      title={`Resize ${column.label}`}
                      type="button"
                    />
                  </th>
                ))}
                {renderRowActions ? (
                  <th
                    className={cn("h-12 px-3 text-right align-middle text-[12px] font-semibold tracking-wide text-text md:px-4", rowActionsPinnedClassName)}
                    ref={(node) => setHeaderCellRef("__actions", node)}
                  >
                    {rowActionsLabel}
                  </th>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedRows.length === 0 ? (
                <TableRow>
                  <TableCell className="py-10 text-center text-text-muted" colSpan={visibleColumns.length + (renderRowActions ? 1 : 0)}>
                    {emptyState}
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedRows.map((item, rowIndex) => {
                  const key = rowKey(item);
                  const isSelected = selectedRowKey === key;

                  return (
                    <TableRow
                      className={cn(
                        onRowClick ? "cursor-pointer focus-within:bg-surface-muted/35" : undefined,
                        isSelected ? "bg-surface-muted/55" : undefined,
                        getRowClassName?.(item)
                      )}
                      key={key}
                      onClick={(event) => {
                        if (enableCellSelection || !onRowClick || isInteractiveTarget(event.target) || hasActiveTextSelection()) {
                          return;
                        }

                        onRowClick(item);
                      }}
                      onKeyDown={(event) => {
                        if (enableCellSelection || !onRowClick || isInteractiveTarget(event.target) || hasActiveTextSelection()) {
                          return;
                        }

                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onRowClick(item);
                        }
                      }}
                      role={onRowClick ? "button" : undefined}
                      tabIndex={onRowClick ? 0 : undefined}
                    >
                      {visibleColumns.map((column, columnIndex) => (
                        <TableCell
                          className={cn(
                            column.className,
                            isSelected ? "bg-accent/10" : "bg-surface",
                            "overflow-hidden px-3 py-3.5 md:px-4",
                            getPinnedColumnCellClass(column.key),
                            enableCellSelection ? "cursor-cell" : undefined,
                            isCellInSelection(rowIndex, columnIndex) ? "relative bg-accent/20" : undefined,
                            selectionFocus?.rowIndex === rowIndex && selectionFocus?.columnIndex === columnIndex ? "ring-2 ring-inset ring-accent" : undefined
                          )}
                          key={column.key}
                          onMouseDown={(event) => {
                            if (!enableCellSelection || isInteractiveTarget(event.target)) {
                              return;
                            }
                            event.preventDefault();
                            handleCellClick(event, rowIndex, columnIndex, item, key, column.key);
                          }}
                          style={getCellStyle(rowIndex, columnIndex, column.key)}
                        >
                          {column.renderCell(item, {
                            rowIndex,
                            columnIndex,
                            isCellSelected: isCellInSelection(rowIndex, columnIndex)
                          })}
                        </TableCell>
                      ))}
                      {renderRowActions ? (
                        <TableCell
                          className={cn(
                            "w-1 whitespace-nowrap px-3 py-3.5 text-right md:px-4",
                            isSelected ? "bg-accent/10" : "bg-surface",
                            "overflow-hidden",
                            rowActionsPinnedClassName
                          )}
                        >
                          <div className="inline-flex items-center gap-1" data-row-action="true">
                            {renderRowActions(item)}
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <Popover
        anchorPoint={columnContextMenu?.anchorPoint ?? null}
        className="w-56 p-1"
        onClose={() => setColumnContextMenu(null)}
        open={Boolean(columnContextMenu && contextMenuColumn)}
        placement="bottom-start"
      >
        {contextMenuColumn ? (
          <div className="space-y-1">
            <p className="truncate px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{contextMenuColumn.label}</p>
            {contextMenuColumn.sortable ? (
              <>
                <button
                  className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm text-text transition-colors hover:bg-surface-muted"
                  onClick={() => {
                    setSortColumnKey(contextMenuColumn.key);
                    setSortDirection("asc");
                    setColumnContextMenu(null);
                  }}
                  type="button"
                >
                  <ArrowUp aria-hidden className="h-3.5 w-3.5" />
                  Sort ascending
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm text-text transition-colors hover:bg-surface-muted"
                  onClick={() => {
                    setSortColumnKey(contextMenuColumn.key);
                    setSortDirection("desc");
                    setColumnContextMenu(null);
                  }}
                  type="button"
                >
                  <ArrowDown aria-hidden className="h-3.5 w-3.5" />
                  Sort descending
                </button>
              </>
            ) : null}
            {contextMenuPinAction ? (
              <button
                className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm text-text transition-colors hover:bg-surface-muted"
                onClick={() => {
                  handleHeaderPinAction(contextMenuColumn.key, contextMenuPinAction);
                  setColumnContextMenu(null);
                }}
                type="button"
              >
                <Pin aria-hidden className="h-3.5 w-3.5" />
                {contextMenuPinAction.startsWith("unpin")
                  ? "Unpin column"
                  : contextMenuPinAction === "pin-right"
                    ? "Pin right"
                    : "Pin left"}
              </button>
            ) : null}
            <button
              className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm text-text transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!contextMenuCanHide}
              onClick={() => {
                if (contextMenuCanHide) {
                  handleHideColumn(contextMenuColumn.key);
                }
                setColumnContextMenu(null);
              }}
              type="button"
            >
              <EyeOff aria-hidden className="h-3.5 w-3.5" />
              Hide column
            </button>
          </div>
        ) : null}
      </Popover>

      <Popup
        footer={
          <>
            <Button
              onClick={() => {
                setColumnOrderKeys(allColumnKeys);
                setVisibleColumnKeys(defaultVisibleColumns);
                setPinnedLeftColumnKeys(defaultPinnedLeftColumns);
                setPinnedRightColumnKeys(defaultPinnedRightColumns);
                setColumnWidthOverrides({});
              }}
              variant="ghost"
            >
              Reset defaults
            </Button>
            <Button onClick={() => setIsColumnsDialogOpen(false)} variant="secondary">
              Done
            </Button>
          </>
        }
        onClose={() => setIsColumnsDialogOpen(false)}
        open={isColumnsDialogOpen}
        size="lg"
        subtitle="Show or hide columns. Drag headers inline to reorder. Sort from each column label."
        title="Table columns"
      >
        <div className="space-y-4">
          {orderedColumnGroups.map(([groupLabel, groupColumns]) => (
            <section className="space-y-2" key={groupLabel}>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{groupLabel}</p>
              {groupColumns.map((column) => {
                const checked = visibleColumnKeys.includes(column.key);
                const isLocked = isLockedSelectionColumn(column.key);
                const pinnedLeft = effectivePinnedLeftSet.has(column.key);
                const pinnedRight = effectivePinnedRightSet.has(column.key);
                const disablePinLeft = !checked || (!pinnedLeft && !canPinLeft(column.key)) || (pinnedLeft && !canUnpinLeft(column.key));
                const disablePinRight = !checked || (!pinnedRight && !canPinRight(column.key)) || (pinnedRight && !canUnpinRight(column.key));

                return (
                  <div
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-control border border-border/80 bg-surface px-3 py-2.5 text-sm",
                      !checked && !isLocked ? "opacity-80" : undefined
                    )}
                    key={column.key}
                  >
                    <span className="font-medium text-text">{column.label}</span>
                    <div className="flex items-center gap-2">
                      <Button
                        aria-label={`Pin ${column.label} left`}
                        disabled={disablePinLeft}
                        onClick={() => handleColumnPinLeftToggle(column.key)}
                        size="sm"
                        variant={pinnedLeft ? "secondary" : "ghost"}
                        title={pinnedLeft ? `Unpin ${column.label} from left` : `Pin ${column.label} left`}
                      >
                        <Pin aria-hidden className="h-3.5 w-3.5" />
                        Left
                      </Button>
                      <Button
                        aria-label={`Pin ${column.label} right`}
                        disabled={disablePinRight}
                        onClick={() => handleColumnPinRightToggle(column.key)}
                        size="sm"
                        variant={pinnedRight ? "secondary" : "ghost"}
                        title={pinnedRight ? `Unpin ${column.label} from right` : `Pin ${column.label} right`}
                      >
                        <Pin aria-hidden className="h-3.5 w-3.5" />
                        Right
                      </Button>
                      <Checkbox
                        checked={isLocked ? true : checked}
                        disabled={isLocked}
                        onChange={(event) => handleColumnToggle(column.key, event.target.checked)}
                      />
                    </div>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      </Popup>
    </div>
  );
}
