"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, EyeOff, GripVertical, Pencil, Pin, Search, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SortDirection = "asc" | "desc";

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

type LastCellClick = {
  rowKey: string;
  columnKey: string;
  at: number;
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

  return Boolean(target.closest("button, a, input, select, textarea, [role='button'], [data-row-action='true'], [data-inline-editor='true']"));
}

function hasActiveTextSelection() {
  if (typeof window === "undefined") {
    return false;
  }

  const selection = window.getSelection();
  return Boolean(selection && selection.toString().trim().length > 0);
}

type SortableHeaderCellProps = {
  columnKey: string;
  label: string;
  sortable: boolean;
  canHide: boolean;
  isSorted: boolean;
  sortDirection: SortDirection;
  headerClassName?: string;
  cellStyle?: CSSProperties;
  pinnedClassName?: string;
  onMount?: (node: HTMLTableCellElement | null) => void;
  onResizeStart: (columnKey: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onHide: (columnKey: string) => void;
  onSortToggle: (columnKey: string) => void;
  pinAction: "pin-left" | "pin-right" | "unpin-left" | "unpin-right" | null;
  onPinAction: (columnKey: string, action: "pin-left" | "pin-right" | "unpin-left" | "unpin-right") => void;
  canReorder: boolean;
  showActions: boolean;
};

function SortableHeaderCell({
  columnKey,
  label,
  sortable,
  canHide,
  isSorted,
  sortDirection,
  headerClassName,
  cellStyle,
  pinnedClassName,
  onMount,
  onResizeStart,
  onHide,
  onSortToggle,
  pinAction,
  onPinAction,
  canReorder,
  showActions
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
        "relative h-11 px-4 text-left align-middle text-[12px] font-semibold text-text-muted",
        isDragging ? "bg-surface ring-1 ring-border" : undefined,
        pinnedClassName,
        headerClassName
      )}
      ref={(node) => {
        setNodeRef(node);
        onMount?.(node);
      }}
      style={style}
    >
      <div className="relative min-w-0">
        <div className="flex min-w-0 items-center gap-1">
          {canReorder ? (
            <button
              aria-label={`Drag ${label} column`}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-text-muted hover:bg-surface hover:text-text"
              type="button"
              {...attributes}
              {...listeners}
            >
              <GripVertical aria-hidden className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <span className="pointer-events-none block whitespace-nowrap text-[12px] font-semibold text-text-muted">{label}</span>
        </div>
        {showActions ? (
          <div className="absolute right-0 top-1/2 -translate-y-1/2">
            <span aria-hidden className="absolute inset-0 rounded-control bg-surface-muted/90" />
            <div className="relative flex items-center gap-1 pl-1">
            {sortable ? (
              <button
                aria-label={`Sort ${label}`}
                className="inline-flex h-6 w-6 items-center justify-center rounded-control text-text-muted hover:bg-surface hover:text-text"
                onClick={() => onSortToggle(columnKey)}
                type="button"
              >
                {isSorted ? (
                  sortDirection === "asc" ? (
                    <ArrowUp aria-hidden className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowDown aria-hidden className="h-3.5 w-3.5" />
                  )
                ) : (
                  <ArrowUpDown aria-hidden className="h-3.5 w-3.5 opacity-60" />
                )}
              </button>
            ) : null}
            <button
              aria-label={`Hide ${label}`}
              className="inline-flex h-6 w-6 items-center justify-center rounded-control text-text-muted hover:bg-surface hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canHide}
              onClick={() => onHide(columnKey)}
              type="button"
            >
              <EyeOff aria-hidden className="h-3.5 w-3.5" />
            </button>
            {pinAction ? (
              <button
                aria-label={pinAction.startsWith("unpin") ? `Unpin ${label}` : `Pin ${label}`}
                className={cn(
                  "inline-flex h-6 w-6 items-center justify-center rounded-control text-text-muted hover:bg-surface hover:text-text",
                  pinAction.startsWith("unpin") ? "text-text" : undefined
                )}
                onClick={() => onPinAction(columnKey, pinAction)}
                type="button"
              >
                <Pin aria-hidden className="h-3.5 w-3.5" />
              </button>
            ) : null}
            </div>
          </div>
        ) : null}
      </div>
      <button
        aria-label={`Resize ${label} column`}
        className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none"
        data-resize-handle="true"
        onPointerDown={(event) => onResizeStart(columnKey, event)}
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
  const lastCellClickRef = useRef<LastCellClick | null>(null);
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
    const nextPoint: CellPoint = { rowIndex, columnIndex };
    const now = Date.now();
    const previousClick = lastCellClickRef.current;
    const isAlreadyActiveCell =
      Boolean(previousClick) &&
      previousClick?.rowKey === key &&
      previousClick?.columnKey === columnKey &&
      now - previousClick.at < 1500;

    if (enableCellSelection) {
      tableShellRef.current?.focus();

      if ((event.shiftKey || event.ctrlKey || event.metaKey) && selectionAnchor) {
        setSelectionFocus(nextPoint);
      } else if (!isAlreadyActiveCell) {
        setSelectionAnchor(nextPoint);
        setSelectionFocus(nextPoint);
      }
    }

    lastCellClickRef.current = {
      rowKey: key,
      columnKey,
      at: now
    };

    onCellClick?.({
      item,
      rowIndex,
      columnIndex,
      rowKey: key,
      columnKey,
      isActiveCell: isAlreadyActiveCell
    });
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

  return (
    <>
      <div
        className="overflow-hidden rounded-control border border-border/80 bg-surface"
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
        <div className="flex flex-col gap-3 border-b border-border/80 bg-surface-muted/35 p-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input
              className="pl-9"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={searchPlaceholder}
              value={searchQuery}
            />
          </div>

          <div className="flex items-center gap-2">
            <p className="text-xs text-text-muted">
              {filteredAndSortedRows.length} of {data.length}
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
            <Button
              onClick={() => {
                setColumnOrderKeys(allColumnKeys);
                setVisibleColumnKeys(defaultVisibleColumns);
                setPinnedLeftColumnKeys(defaultPinnedLeftColumns);
                setPinnedRightColumnKeys(defaultPinnedRightColumns);
                setColumnWidthOverrides({});
                setSortColumnKey(defaultSort?.columnKey ?? null);
                setSortDirection(defaultSort?.direction ?? "asc");
              }}
              size="sm"
              variant="ghost"
            >
              Reset
            </Button>
          </div>
        </div>

        {isHydrated ? (
          <DndContext collisionDetection={closestCenter} id={dndContextId} onDragEnd={handleInlineHeaderReorder} sensors={sensors}>
            <Table
              aria-label={ariaLabel}
              className={cn(
                "w-max table-auto border-separate border-spacing-0 [&_th]:w-auto [&_th]:whitespace-nowrap [&_th]:select-text [&_td]:w-auto [&_td]:whitespace-nowrap [&_td]:select-text [&_td]:bg-surface",
                showCellGrid
                  ? "[&_th]:border-b [&_th]:border-r [&_th]:border-border [&_th:first-child]:border-l [&_td]:border-b [&_td]:border-r [&_td]:border-border [&_td:first-child]:border-l"
                  : undefined
              )}
            >
              <TableHeader className="sticky top-0 z-10 bg-surface-muted/90 backdrop-blur supports-[backdrop-filter]:bg-surface-muted/75">
                <SortableContext
                  items={visibleColumns.filter((column) => !isLockedSelectionColumn(column.key)).map((column) => column.key)}
                  strategy={horizontalListSortingStrategy}
                >
                  <TableRow>
                    {visibleColumns.map((column) => (
                      <SortableHeaderCell
                        canHide={canHideColumn(column.key)}
                        cellStyle={getPinnedColumnCellStyle(column.key)}
                        columnKey={column.key}
                        headerClassName={column.headerClassName}
                        isSorted={sortColumnKey === column.key}
                        key={column.key}
                        label={column.label}
                        onHide={handleHideColumn}
                        onMount={(node) => setHeaderCellRef(column.key, node)}
                        onPinAction={handleHeaderPinAction}
                        onResizeStart={handleColumnResizeStart}
                        onSortToggle={handleSortToggle}
                        pinAction={getPinActionForColumn(column.key)}
                        canReorder={!isLockedSelectionColumn(column.key)}
                        showActions={!isLockedSelectionColumn(column.key)}
                        pinnedClassName={getPinnedColumnCellClass(column.key)}
                        sortDirection={sortDirection}
                        sortable={Boolean(column.sortable)}
                      />
                    ))}
                    {renderRowActions ? (
                      <th
                        className={cn("h-11 px-4 text-right align-middle text-[12px] font-semibold text-text-muted", rowActionsPinnedClassName)}
                        ref={(node) => setHeaderCellRef("__actions", node)}
                      >
                        {rowActionsLabel}
                      </th>
                    ) : null}
                  </TableRow>
                </SortableContext>
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
                          onRowClick ? "cursor-pointer" : undefined,
                          isSelected ? "bg-surface-muted/60" : undefined,
                          getRowClassName?.(item)
                        )}
                        key={key}
                        onClick={(event) => {
                          if (!onRowClick || isInteractiveTarget(event.target) || hasActiveTextSelection()) {
                            return;
                          }

                          onRowClick(item);
                        }}
                        onKeyDown={(event) => {
                          if (!onRowClick || isInteractiveTarget(event.target) || hasActiveTextSelection()) {
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
                              "overflow-hidden",
                              getPinnedColumnCellClass(column.key),
                              enableCellSelection ? "cursor-cell" : undefined,
                              isCellInSelection(rowIndex, columnIndex) ? "bg-accent/20" : undefined,
                              selectionFocus?.rowIndex === rowIndex && selectionFocus?.columnIndex === columnIndex ? "ring-1 ring-inset ring-accent" : undefined
                            )}
                            key={column.key}
                            onClick={(event) => handleCellClick(event, rowIndex, columnIndex, item, key, column.key)}
                            style={getPinnedColumnCellStyle(column.key)}
                          >
                            {column.renderCell(item, {
                              rowIndex,
                              columnIndex,
                              isCellSelected: isCellInSelection(rowIndex, columnIndex)
                            })}
                          </TableCell>
                        ))}
                        {renderRowActions ? (
                          <TableCell className={cn("w-1 whitespace-nowrap text-right", isSelected ? "bg-accent/10" : "bg-surface", "overflow-hidden", rowActionsPinnedClassName)}>
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
              "w-max table-auto border-separate border-spacing-0 [&_th]:w-auto [&_th]:whitespace-nowrap [&_th]:select-text [&_td]:w-auto [&_td]:whitespace-nowrap [&_td]:select-text [&_td]:bg-surface",
              showCellGrid
                ? "[&_th]:border-b [&_th]:border-r [&_th]:border-border [&_th:first-child]:border-l [&_td]:border-b [&_td]:border-r [&_td]:border-border [&_td:first-child]:border-l"
                : undefined
            )}
          >
            <TableHeader className="sticky top-0 z-10 bg-surface-muted/90 backdrop-blur supports-[backdrop-filter]:bg-surface-muted/75">
              <TableRow>
                {visibleColumns.map((column) => (
                  <th
                    className={cn(
                      "relative h-11 px-4 text-left align-middle text-[12px] font-semibold text-text-muted",
                      column.headerClassName,
                      getPinnedColumnCellClass(column.key)
                    )}
                    key={column.key}
                    ref={(node) => setHeaderCellRef(column.key, node)}
                    style={getPinnedColumnCellStyle(column.key)}
                  >
                    <div className="relative min-w-0">
                      <div className="flex min-w-0 items-center gap-1">
                        {!isLockedSelectionColumn(column.key) ? (
                          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-text-muted">
                            <GripVertical aria-hidden className="h-3.5 w-3.5" />
                          </span>
                        ) : null}
                        <span className="pointer-events-none block whitespace-nowrap text-[12px] font-semibold text-text-muted">
                          {column.label}
                        </span>
                      </div>
                      {!isLockedSelectionColumn(column.key) ? (
                        <div className="absolute right-0 top-1/2 -translate-y-1/2">
                          <span aria-hidden className="absolute inset-0 rounded-control bg-surface-muted/90" />
                          <div className="relative flex items-center gap-1 pl-1">
                          {column.sortable ? (
                            <button
                              aria-label={`Sort ${column.label}`}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-control text-text-muted hover:bg-surface hover:text-text"
                              onClick={() => handleSortToggle(column.key)}
                              type="button"
                            >
                              {sortColumnKey === column.key ? (
                                sortDirection === "asc" ? (
                                  <ArrowUp aria-hidden className="h-3.5 w-3.5" />
                                ) : (
                                  <ArrowDown aria-hidden className="h-3.5 w-3.5" />
                                )
                              ) : (
                                <ArrowUpDown aria-hidden className="h-3.5 w-3.5 opacity-60" />
                              )}
                            </button>
                          ) : null}
                          {getPinActionForColumn(column.key) ? (
                            <button
                              aria-label={
                                getPinActionForColumn(column.key)?.startsWith("unpin")
                                  ? `Unpin ${column.label}`
                                  : `Pin ${column.label}`
                              }
                              className={cn(
                                "inline-flex h-6 w-6 items-center justify-center rounded-control text-text-muted hover:bg-surface hover:text-text",
                                getPinActionForColumn(column.key)?.startsWith("unpin") ? "text-text" : undefined
                              )}
                              onClick={() => {
                                const action = getPinActionForColumn(column.key);
                                if (action) {
                                  handleHeaderPinAction(column.key, action);
                                }
                              }}
                              type="button"
                            >
                              <Pin aria-hidden className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          <button
                            aria-label={`Hide ${column.label}`}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-control text-text-muted hover:bg-surface hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={!canHideColumn(column.key)}
                            onClick={() => handleHideColumn(column.key)}
                            type="button"
                          >
                            <EyeOff aria-hidden className="h-3.5 w-3.5" />
                          </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <button
                      aria-label={`Resize ${column.label} column`}
                      className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none"
                      data-resize-handle="true"
                      onPointerDown={(event) => handleColumnResizeStart(column.key, event)}
                      type="button"
                    />
                  </th>
                ))}
                {renderRowActions ? (
                  <th
                    className={cn("h-11 px-4 text-right align-middle text-[12px] font-semibold text-text-muted", rowActionsPinnedClassName)}
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
                        onRowClick ? "cursor-pointer" : undefined,
                        isSelected ? "bg-surface-muted/60" : undefined,
                        getRowClassName?.(item)
                      )}
                      key={key}
                      onClick={(event) => {
                        if (!onRowClick || isInteractiveTarget(event.target) || hasActiveTextSelection()) {
                          return;
                        }

                        onRowClick(item);
                      }}
                      onKeyDown={(event) => {
                        if (!onRowClick || isInteractiveTarget(event.target) || hasActiveTextSelection()) {
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
                            "overflow-hidden",
                            getPinnedColumnCellClass(column.key),
                            enableCellSelection ? "cursor-cell" : undefined,
                            isCellInSelection(rowIndex, columnIndex) ? "bg-accent/20" : undefined,
                            selectionFocus?.rowIndex === rowIndex && selectionFocus?.columnIndex === columnIndex ? "ring-1 ring-inset ring-accent" : undefined
                          )}
                          key={column.key}
                          onClick={(event) => handleCellClick(event, rowIndex, columnIndex, item, key, column.key)}
                          style={getPinnedColumnCellStyle(column.key)}
                        >
                          {column.renderCell(item, {
                            rowIndex,
                            columnIndex,
                            isCellSelected: isCellInSelection(rowIndex, columnIndex)
                          })}
                        </TableCell>
                      ))}
                      {renderRowActions ? (
                        <TableCell className={cn("w-1 whitespace-nowrap text-right", isSelected ? "bg-accent/10" : "bg-surface", "overflow-hidden", rowActionsPinnedClassName)}>
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

      <Panel
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
        subtitle="Show or hide columns. Drag headers inline to reorder."
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
                      "flex items-center justify-between gap-3 rounded-control border bg-surface px-3 py-2 text-sm",
                      !checked && !isLocked ? "opacity-80" : undefined
                    )}
                    key={column.key}
                  >
                    <span>{column.label}</span>
                    <div className="flex items-center gap-2">
                      <Button
                        disabled={disablePinLeft}
                        onClick={() => handleColumnPinLeftToggle(column.key)}
                        size="sm"
                        variant={pinnedLeft ? "secondary" : "ghost"}
                      >
                        L
                      </Button>
                      <Button
                        disabled={disablePinRight}
                        onClick={() => handleColumnPinRightToggle(column.key)}
                        size="sm"
                        variant={pinnedRight ? "secondary" : "ghost"}
                      >
                        R
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
      </Panel>
    </>
  );
}
