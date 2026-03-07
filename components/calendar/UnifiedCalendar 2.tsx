"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";

export type UnifiedCalendarView = "month" | "week" | "day";

export type UnifiedCalendarItem = {
  id: string;
  title: string;
  entryType: "event" | "practice" | "game";
  status: "scheduled" | "cancelled";
  startsAtUtc: string;
  endsAtUtc: string;
  timezone: string;
  summary?: string | null;
};

export type UnifiedCalendarQuickAddDraft = {
  title: string;
  startsAtUtc: string;
  endsAtUtc: string;
};

type UnifiedCalendarProps = {
  items: UnifiedCalendarItem[];
  initialView?: UnifiedCalendarView;
  canEdit?: boolean;
  disableWeekCellHover?: boolean;
  onSelectItem?: (itemId: string) => void;
  onCreateRange?: (input: { startsAtUtc: string; endsAtUtc: string }) => void;
  onMoveItem?: (input: { itemId: string; startsAtUtc: string; endsAtUtc: string }) => void;
  onResizeItem?: (input: { itemId: string; endsAtUtc: string }) => void;
  onQuickAdd?: (draft: UnifiedCalendarQuickAddDraft) => void;
  getConflictMessage?: (draft: UnifiedCalendarQuickAddDraft) => string | null;
  headerSlot?: React.ReactNode;
  filterSlot?: React.ReactNode;
  sidePanelSlot?: React.ReactNode;
};

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function endOfDay(value: Date) {
  const next = startOfDay(value);
  next.setDate(next.getDate() + 1);
  return next;
}

function addDays(value: Date, amount: number) {
  const next = new Date(value.getTime());
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeek(value: Date) {
  return addDays(startOfDay(value), -startOfDay(value).getDay());
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function dateKey(value: Date) {
  return `${value.getFullYear()}-${`${value.getMonth() + 1}`.padStart(2, "0")}-${`${value.getDate()}`.padStart(2, "0")}`;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(year, (month || 1) - 1, day || 1);
}

function intersectsDay(startsAtUtc: string, endsAtUtc: string, day: Date) {
  const startsAt = new Date(startsAtUtc);
  const endsAt = new Date(endsAtUtc);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return false;
  }

  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  return startsAt.getTime() < dayEnd.getTime() && endsAt.getTime() > dayStart.getTime();
}

function formatHeading(anchorDate: Date, view: UnifiedCalendarView) {
  if (view === "month") {
    return anchorDate.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric"
    });
  }

  if (view === "week") {
    const weekStart = startOfWeek(anchorDate);
    const weekEnd = addDays(weekStart, 6);
    return `${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`;
  }

  return anchorDate.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function itemDurationMs(item: UnifiedCalendarItem) {
  return new Date(item.endsAtUtc).getTime() - new Date(item.startsAtUtc).getTime();
}

const HOURS = Array.from({ length: 24 }, (_, index) => index);
const WEEK_TIME_GUTTER_WIDTH_PX = 80;
const WEEK_DAY_WIDTH_PX = 180;
const WEEK_HOUR_HEIGHT_PX = 56;
const DRAFT_ITEM_ID = "__calendar_draft__";
const OPTIMISTIC_WINDOW_TTL_MS = 8_000;
const PENDING_CREATE_TTL_MS = 12_000;

type OptimisticWindow = {
  startsAtUtc: string;
  endsAtUtc: string;
  expiresAt: number;
};

type PendingCreateItem = {
  item: UnifiedCalendarItem;
  expiresAt: number;
};

type WeekDragState = {
  kind: "move" | "resize_top" | "resize_bottom";
  itemId: string;
  originalStartsAtUtc: string;
  originalEndsAtUtc: string;
  originClientX: number;
  originClientY: number;
};

function toLocalInputValue(isoUtc: string) {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (value: number) => `${value}`.padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputToUtcIso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

export function UnifiedCalendar({
  items,
  initialView = "month",
  canEdit = true,
  disableWeekCellHover = false,
  onSelectItem,
  onCreateRange,
  onMoveItem,
  onResizeItem,
  onQuickAdd,
  getConflictMessage,
  headerSlot,
  filterSlot,
  sidePanelSlot
}: UnifiedCalendarProps) {
  const [view, setView] = useState<UnifiedCalendarView>(initialView);
  const [anchorDate, setAnchorDate] = useState<Date>(() => startOfDay(new Date()));
  const [dragCreateStart, setDragCreateStart] = useState<string | null>(null);
  const [dragCreateHover, setDragCreateHover] = useState<string | null>(null);
  const [dragMoveItemId, setDragMoveItemId] = useState<string | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [quickAddStartsAtUtc, setQuickAddStartsAtUtc] = useState(() => startOfDay(new Date()).toISOString());
  const [quickAddEndsAtUtc, setQuickAddEndsAtUtc] = useState(() => endOfDay(new Date()).toISOString());
  const [hoveredWeekCell, setHoveredWeekCell] = useState<{ dayIndex: number; hourIndex: number } | null>(null);
  const [optimisticWindows, setOptimisticWindows] = useState<Record<string, OptimisticWindow>>({});
  const [pendingCreates, setPendingCreates] = useState<PendingCreateItem[]>([]);
  const [weekDrag, setWeekDrag] = useState<WeekDragState | null>(null);
  const weekScrollRef = useRef<HTMLDivElement | null>(null);
  const weekScrollCenteredRef = useRef(false);

  const monthAnchor = startOfMonth(anchorDate);
  const monthGridStart = startOfWeek(monthAnchor);
  const monthDays = useMemo(() => Array.from({ length: 42 }, (_, index) => addDays(monthGridStart, index)), [monthGridStart]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(anchorDate), index)), [anchorDate]);
  const weekGridWidth = weekDays.length * WEEK_DAY_WIDTH_PX;
  const weekGridHeight = HOURS.length * WEEK_HOUR_HEIGHT_PX;
  const draftOptimisticWindow = optimisticWindows[DRAFT_ITEM_ID];
  const hourLabels = useMemo(() => HOURS.map((hour) => new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: "numeric" })), []);
  const draftItem = useMemo<UnifiedCalendarItem | null>(() => {
    if (!quickAddOpen) {
      return null;
    }

    return {
      id: DRAFT_ITEM_ID,
      title: quickAddTitle.trim() || "New event",
      entryType: "event",
      status: "scheduled",
      startsAtUtc: draftOptimisticWindow?.startsAtUtc ?? quickAddStartsAtUtc,
      endsAtUtc: draftOptimisticWindow?.endsAtUtc ?? quickAddEndsAtUtc,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  }, [draftOptimisticWindow?.endsAtUtc, draftOptimisticWindow?.startsAtUtc, quickAddEndsAtUtc, quickAddOpen, quickAddStartsAtUtc, quickAddTitle]);
  const displayItems = useMemo(() => {
    const mergedItems = items.map((item) => {
      const optimistic = optimisticWindows[item.id];
      if (!optimistic) {
        return item;
      }
      return {
        ...item,
        startsAtUtc: optimistic.startsAtUtc,
        endsAtUtc: optimistic.endsAtUtc
      };
    });

    const nextItems = [...mergedItems, ...pendingCreates.map((entry) => entry.item)];
    if (draftItem) {
      nextItems.push(draftItem);
    }
    return nextItems;
  }, [draftItem, items, optimisticWindows, pendingCreates]);

  const weekItemsByDay = useMemo(() => {
    const map = new Map<string, UnifiedCalendarItem[]>();
    for (const day of weekDays) {
      map.set(dateKey(day), []);
    }

    for (const item of displayItems) {
      for (const day of weekDays) {
        if (!intersectsDay(item.startsAtUtc, item.endsAtUtc, day)) {
          continue;
        }
        const key = dateKey(day);
        const list = map.get(key);
        if (list) {
          list.push(item);
        } else {
          map.set(key, [item]);
        }
      }
    }

    for (const [key, dayItemsForKey] of map.entries()) {
      map.set(
        key,
        dayItemsForKey.sort((left, right) => left.startsAtUtc.localeCompare(right.startsAtUtc))
      );
    }

    return map;
  }, [displayItems, weekDays]);

  const weekPositionedItems = useMemo(() => {
    const positioned: Array<{
      item: UnifiedCalendarItem;
      dayIndex: number;
      top: number;
      left: number;
      width: number;
      height: number;
      startsLabel: string;
      key: string;
    }> = [];

    for (let dayIndex = 0; dayIndex < weekDays.length; dayIndex += 1) {
      const day = weekDays[dayIndex];
      if (!day) {
        continue;
      }
      const dayStart = startOfDay(day);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const dayItemList = weekItemsByDay.get(dateKey(day)) ?? [];

      for (const item of dayItemList) {
        const itemStart = new Date(item.startsAtUtc);
        const itemEnd = new Date(item.endsAtUtc);
        const clampedStartMs = Math.max(itemStart.getTime(), dayStart.getTime());
        const clampedEndMs = Math.min(itemEnd.getTime(), dayEnd.getTime());
        const startMinutes = (clampedStartMs - dayStart.getTime()) / (60 * 1000);
        const endMinutes = (clampedEndMs - dayStart.getTime()) / (60 * 1000);
        const top = (startMinutes / 60) * WEEK_HOUR_HEIGHT_PX + 1;
        const height = Math.max(((endMinutes - startMinutes) / 60) * WEEK_HOUR_HEIGHT_PX - 2, 18);
        const left = dayIndex * WEEK_DAY_WIDTH_PX + 2;
        const width = WEEK_DAY_WIDTH_PX - 4;

        positioned.push({
          item,
          dayIndex,
          top,
          left,
          width,
          height,
          startsLabel: itemStart.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
          key: `${dayIndex}-${item.id}`
        });
      }
    }

    return positioned;
  }, [weekDays, weekItemsByDay]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, UnifiedCalendarItem[]>();

    for (const day of monthDays) {
      const key = dateKey(day);
      map.set(
        key,
        displayItems
          .filter((item) => intersectsDay(item.startsAtUtc, item.endsAtUtc, day))
          .sort((left, right) => left.startsAtUtc.localeCompare(right.startsAtUtc))
      );
    }

    return map;
  }, [displayItems, monthDays]);

  const dayItems = useMemo(() => {
    const selectedDay = startOfDay(anchorDate);
    return displayItems
      .filter((item) => intersectsDay(item.startsAtUtc, item.endsAtUtc, selectedDay))
      .sort((left, right) => left.startsAtUtc.localeCompare(right.startsAtUtc));
  }, [anchorDate, displayItems]);

  const quickAddConflict =
    getConflictMessage && quickAddOpen
      ? getConflictMessage({
          title: quickAddTitle,
          startsAtUtc: quickAddStartsAtUtc,
          endsAtUtc: quickAddEndsAtUtc
        })
      : null;
  const canShowWeekCellHover = !disableWeekCellHover && !quickAddOpen && !weekDrag;

  useEffect(() => {
    if (view !== "week") {
      weekScrollCenteredRef.current = false;
      return;
    }

    if (weekScrollCenteredRef.current) {
      return;
    }

    const node = weekScrollRef.current;
    if (!node) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const noonOffset = 12 * WEEK_HOUR_HEIGHT_PX;
      const centeredTop = Math.max(0, noonOffset - node.clientHeight / 2);
      node.scrollTop = centeredTop;
      weekScrollCenteredRef.current = true;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [view, weekGridHeight]);

  function applyOptimisticWindow(itemId: string, startsAtUtc: string, endsAtUtc: string) {
    setOptimisticWindows((current) => {
      const existing = current[itemId];
      if (existing && existing.startsAtUtc === startsAtUtc && existing.endsAtUtc === endsAtUtc) {
        return current;
      }

      return {
        ...current,
        [itemId]: {
          startsAtUtc,
          endsAtUtc,
          expiresAt: Date.now() + OPTIMISTIC_WINDOW_TTL_MS
        }
      };
    });
  }

  useEffect(() => {
    if (Object.keys(optimisticWindows).length === 0) {
      return;
    }

    const now = Date.now();
    let changed = false;
    const next: Record<string, OptimisticWindow> = {};

    for (const [itemId, optimistic] of Object.entries(optimisticWindows)) {
      if (optimistic.expiresAt <= now) {
        changed = true;
        continue;
      }
      const source = items.find((item) => item.id === itemId);
      if (source && source.startsAtUtc === optimistic.startsAtUtc && source.endsAtUtc === optimistic.endsAtUtc) {
        changed = true;
        continue;
      }
      next[itemId] = optimistic;
    }

    if (changed) {
      setOptimisticWindows(next);
    }
  }, [items, optimisticWindows]);

  useEffect(() => {
    if (pendingCreates.length === 0) {
      return;
    }

    const now = Date.now();
    let changed = false;
    const next = pendingCreates.filter((entry) => {
      if (entry.expiresAt <= now) {
        changed = true;
        return false;
      }

      const matched = items.some((item) => {
        const sameTitle = item.title.trim().toLowerCase() === entry.item.title.trim().toLowerCase();
        if (!sameTitle) {
          return false;
        }
        const startDelta = Math.abs(new Date(item.startsAtUtc).getTime() - new Date(entry.item.startsAtUtc).getTime());
        const endDelta = Math.abs(new Date(item.endsAtUtc).getTime() - new Date(entry.item.endsAtUtc).getTime());
        return startDelta < 60_000 && endDelta < 60_000;
      });

      if (matched) {
        changed = true;
        return false;
      }

      return true;
    });

    if (changed) {
      setPendingCreates(next);
    }
  }, [items, pendingCreates]);

  useEffect(() => {
    if (Object.keys(optimisticWindows).length === 0 && pendingCreates.length === 0) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const now = Date.now();
      setOptimisticWindows((current) => {
        const next: Record<string, OptimisticWindow> = {};
        for (const [itemId, optimistic] of Object.entries(current)) {
          if (optimistic.expiresAt > now) {
            next[itemId] = optimistic;
          }
        }
        return Object.keys(next).length === Object.keys(current).length ? current : next;
      });
      setPendingCreates((current) => {
        const next = current.filter((entry) => entry.expiresAt > now);
        return next.length === current.length ? current : next;
      });
    }, 1_000);

    return () => window.clearInterval(intervalId);
  }, [optimisticWindows, pendingCreates.length]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        const start = startOfDay(anchorDate);
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        setQuickAddStartsAtUtc(start.toISOString());
        setQuickAddEndsAtUtc(end.toISOString());
        setQuickAddTitle("New event");
        setQuickAddOpen(true);
        return;
      }

      if (event.key === "t" || event.key === "T") {
        event.preventDefault();
        setAnchorDate(startOfDay(new Date()));
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setAnchorDate((current) => addDays(current, view === "month" ? -30 : view === "week" ? -7 : -1));
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setAnchorDate((current) => addDays(current, view === "month" ? 30 : view === "week" ? 7 : 1));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [anchorDate, view]);

  function calculateWeekDragWindow(drag: WeekDragState, clientX: number, clientY: number): { startsAtUtc: string; endsAtUtc: string } | null {
    const startMs = new Date(drag.originalStartsAtUtc).getTime();
    const endMs = new Date(drag.originalEndsAtUtc).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
      return null;
    }

    const deltaYMinutes = Math.round((((clientY - drag.originClientY) / WEEK_HOUR_HEIGHT_PX) * 60) / 15) * 15;

    if (drag.kind === "move") {
      const deltaDays = Math.round((clientX - drag.originClientX) / WEEK_DAY_WIDTH_PX);
      const deltaMinutes = deltaYMinutes + deltaDays * 24 * 60;
      const nextStartMs = startMs + deltaMinutes * 60 * 1000;
      const nextEndMs = endMs + deltaMinutes * 60 * 1000;
      return {
        startsAtUtc: new Date(nextStartMs).toISOString(),
        endsAtUtc: new Date(nextEndMs).toISOString()
      };
    }

    if (drag.kind === "resize_top") {
      const nextStartMs = startMs + deltaYMinutes * 60 * 1000;
      if (nextStartMs >= endMs - 15 * 60 * 1000) {
        return null;
      }
      return {
        startsAtUtc: new Date(nextStartMs).toISOString(),
        endsAtUtc: drag.originalEndsAtUtc
      };
    }

    const nextEndMs = endMs + deltaYMinutes * 60 * 1000;
    if (nextEndMs <= startMs + 15 * 60 * 1000) {
      return null;
    }
    return {
      startsAtUtc: drag.originalStartsAtUtc,
      endsAtUtc: new Date(nextEndMs).toISOString()
    };
  }

  useEffect(() => {
    if (!weekDrag) {
      return;
    }

    const drag = weekDrag;
    let latestWindow = {
      startsAtUtc: drag.originalStartsAtUtc,
      endsAtUtc: drag.originalEndsAtUtc
    };
    let rafId = 0;
    let pendingMoveEvent: MouseEvent | null = null;

    const applyFromMouse = (clientX: number, clientY: number) => {
      const nextWindow = calculateWeekDragWindow(drag, clientX, clientY);
      if (!nextWindow) {
        return;
      }
      latestWindow = nextWindow;
      applyOptimisticWindow(drag.itemId, nextWindow.startsAtUtc, nextWindow.endsAtUtc);
      if (drag.itemId === DRAFT_ITEM_ID) {
        setQuickAddStartsAtUtc(nextWindow.startsAtUtc);
        setQuickAddEndsAtUtc(nextWindow.endsAtUtc);
      }
    };

    function onMouseMove(event: MouseEvent) {
      pendingMoveEvent = event;
      if (rafId) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        if (!pendingMoveEvent) {
          return;
        }
        applyFromMouse(pendingMoveEvent.clientX, pendingMoveEvent.clientY);
      });
    }

    function onMouseUp() {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }

      const changed = latestWindow.startsAtUtc !== drag.originalStartsAtUtc || latestWindow.endsAtUtc !== drag.originalEndsAtUtc;
      if (changed) {
        if (drag.itemId === DRAFT_ITEM_ID) {
          setQuickAddStartsAtUtc(latestWindow.startsAtUtc);
          setQuickAddEndsAtUtc(latestWindow.endsAtUtc);
        }

        if ((drag.kind === "move" || drag.kind === "resize_top") && onMoveItem && drag.itemId !== DRAFT_ITEM_ID) {
          onMoveItem({
            itemId: drag.itemId,
            startsAtUtc: latestWindow.startsAtUtc,
            endsAtUtc: latestWindow.endsAtUtc
          });
        }

        if (drag.kind === "resize_bottom" && onResizeItem && drag.itemId !== DRAFT_ITEM_ID) {
          onResizeItem({
            itemId: drag.itemId,
            endsAtUtc: latestWindow.endsAtUtc
          });
        }
      }

      if (drag.itemId === DRAFT_ITEM_ID) {
        setOptimisticWindows((current) => {
          if (!current[DRAFT_ITEM_ID]) {
            return current;
          }
          const { [DRAFT_ITEM_ID]: _removed, ...rest } = current;
          return rest;
        });
      }

      setWeekDrag(null);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp, { once: true });
    document.body.style.userSelect = "none";
    document.body.style.cursor = drag.kind === "move" ? "grabbing" : "ns-resize";
    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.removeProperty("user-select");
      document.body.style.removeProperty("cursor");
    };
  }, [onMoveItem, onResizeItem, weekDrag]);

  function createFromDrag() {
    if (!dragCreateStart || !dragCreateHover || !onCreateRange) {
      setDragCreateStart(null);
      setDragCreateHover(null);
      return;
    }

    const start = parseDateKey(dragCreateStart);
    const end = parseDateKey(dragCreateHover);
    const min = start.getTime() <= end.getTime() ? start : end;
    const max = start.getTime() <= end.getTime() ? end : start;

    onCreateRange({
      startsAtUtc: startOfDay(min).toISOString(),
      endsAtUtc: endOfDay(max).toISOString()
    });

    setDragCreateStart(null);
    setDragCreateHover(null);
  }

  function shiftAnchor(direction: "previous" | "next") {
    const multiplier = direction === "previous" ? -1 : 1;

    if (view === "month") {
      setAnchorDate((current) => new Date(current.getFullYear(), current.getMonth() + multiplier, current.getDate()));
      return;
    }

    if (view === "week") {
      setAnchorDate((current) => addDays(current, 7 * multiplier));
      return;
    }

    setAnchorDate((current) => addDays(current, 1 * multiplier));
  }

  function startWeekDrag(
    event: React.MouseEvent<HTMLElement>,
    item: UnifiedCalendarItem,
    kind: WeekDragState["kind"]
  ) {
    if (event.button !== 0) {
      return;
    }
    if (item.id.startsWith("__pending_create__")) {
      return;
    }
    if (kind === "move" && !onMoveItem) {
      return;
    }
    if (kind === "resize_bottom" && !onResizeItem) {
      return;
    }
    if (kind === "resize_top" && !onMoveItem) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setWeekDrag({
      kind,
      itemId: item.id,
      originalStartsAtUtc: item.startsAtUtc,
      originalEndsAtUtc: item.endsAtUtc,
      originClientX: event.clientX,
      originClientY: event.clientY
    });
  }

  function selectCalendarItem(itemId: string) {
    if (itemId === DRAFT_ITEM_ID || itemId.startsWith("__pending_create__")) {
      setQuickAddOpen(true);
      return;
    }
    onSelectItem?.(itemId);
  }

  return (
    <div className="space-y-4 rounded-card border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1 rounded-control border bg-surface p-1">
          {(["month", "week", "day"] as const).map((candidateView) => (
            <button
              className={cn(
                "rounded-control px-2 py-1 text-xs font-semibold transition-colors",
                view === candidateView ? "bg-surface-muted text-text" : "text-text-muted hover:bg-surface-muted hover:text-text"
              )}
              key={candidateView}
              onClick={() => setView(candidateView)}
              type="button"
            >
              {candidateView}
            </button>
          ))}
        </div>

        <div className="inline-flex items-center gap-1 rounded-control border bg-surface p-1">
          <button className="inline-flex h-8 w-8 items-center justify-center rounded-control hover:bg-surface-muted" onClick={() => shiftAnchor("previous")} type="button">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button className="rounded-control px-2 py-1 text-xs font-semibold text-text-muted hover:bg-surface-muted" onClick={() => setAnchorDate(startOfDay(new Date()))} type="button">
            Today
          </button>
          <button className="inline-flex h-8 w-8 items-center justify-center rounded-control hover:bg-surface-muted" onClick={() => shiftAnchor("next")} type="button">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-text">{formatHeading(anchorDate, view)}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {filterSlot}
          {headerSlot}
          {canEdit ? (
            <Button
              onClick={() => {
                if (!quickAddOpen) {
                  const start = startOfDay(anchorDate);
                  const end = new Date(start.getTime() + 60 * 60 * 1000);
                  setQuickAddStartsAtUtc(start.toISOString());
                  setQuickAddEndsAtUtc(end.toISOString());
                  setQuickAddTitle("New event");
                }
                setQuickAddOpen((current) => !current);
              }}
              type="button"
              variant="secondary"
            >
              <Plus className="h-4 w-4" />
              Quick add
            </Button>
          ) : null}
        </div>
      </div>

      {view === "month" ? (
        <div className="space-y-1">
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
              <p key={weekday}>{weekday}</p>
            ))}
          </div>
          <div
            className="grid grid-cols-7 gap-1"
            onMouseUp={createFromDrag}
            onMouseLeave={() => {
              setDragCreateHover(null);
            }}
          >
            {monthDays.map((day) => {
              const key = dateKey(day);
              const inMonth = day.getMonth() === monthAnchor.getMonth();
              const dayItemList = itemsByDay.get(key) ?? [];
              const selectedRange =
                dragCreateStart && dragCreateHover
                  ? (() => {
                      const start = parseDateKey(dragCreateStart).getTime();
                      const end = parseDateKey(dragCreateHover).getTime();
                      const min = Math.min(start, end);
                      const max = Math.max(start, end);
                      const current = parseDateKey(key).getTime();
                      return current >= min && current <= max;
                    })()
                  : false;

              return (
                <button
                  className={cn(
                    "relative min-h-[96px] rounded-control border p-1.5 text-left transition-colors",
                    inMonth ? "border-border bg-surface" : "border-transparent bg-surface-muted/40 text-text-muted",
                    selectedRange && "border-accent bg-accent/10"
                  )}
                  key={key}
                  onClick={() => setAnchorDate(day)}
                  onDragOver={(event) => {
                    event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (!dragMoveItemId || !onMoveItem) {
                      return;
                    }
                    const item = displayItems.find((candidate) => candidate.id === dragMoveItemId);
                    if (!item) {
                      return;
                    }

                    const duration = itemDurationMs(item);
                    const targetStart = startOfDay(day);
                    const nextStart = targetStart.toISOString();
                    const nextEnd = new Date(targetStart.getTime() + duration).toISOString();

                    onMoveItem({
                      itemId: item.id,
                      startsAtUtc: nextStart,
                      endsAtUtc: nextEnd
                    });
                    applyOptimisticWindow(item.id, nextStart, nextEnd);
                    setDragMoveItemId(null);
                  }}
                  onMouseDown={(event) => {
                    if (!canEdit || !onCreateRange || event.button !== 0) {
                      return;
                    }
                    setDragCreateStart(key);
                    setDragCreateHover(key);
                  }}
                  onMouseEnter={() => {
                    if (dragCreateStart) {
                      setDragCreateHover(key);
                    }
                  }}
                  type="button"
                >
                  <p className="absolute left-1.5 top-1.5 text-xs font-semibold text-text">{day.getDate()}</p>
                  <div className="mt-5 space-y-1">
                    {dayItemList.slice(0, 2).map((item) => (
                      <div
                        className={cn(
                          "truncate rounded-control px-1.5 py-0.5 text-[10px]",
                          item.entryType === "practice"
                            ? "bg-emerald-100 text-emerald-800"
                            : item.entryType === "game"
                              ? "bg-sky-100 text-sky-800"
                              : "bg-amber-100 text-amber-800",
                          item.status === "cancelled" && "line-through opacity-60"
                        )}
                        draggable={Boolean(canEdit && onMoveItem)}
                        key={item.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          selectCalendarItem(item.id);
                        }}
                        onDragStart={() => setDragMoveItemId(item.id)}
                      >
                        {item.title}
                      </div>
                    ))}
                    {dayItemList.length > 2 ? <p className="text-[10px] text-text-muted">+{dayItemList.length - 2} more</p> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {view === "week" ? (
        <div
          className="overflow-auto rounded-control border bg-surface"
          ref={weekScrollRef}
          style={{ height: `${WEEK_HOUR_HEIGHT_PX * 6 + 40}px` }}
        >
          <div className="flex w-fit">
            <div className="sticky left-0 z-20 shrink-0 border-r bg-surface" style={{ width: `${WEEK_TIME_GUTTER_WIDTH_PX}px` }}>
              <div className="h-10 border-b px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Time</div>
              {HOURS.map((hour) => (
                <div
                  className="border-b px-2 py-1 text-[11px] font-medium text-text-muted"
                  key={hour}
                  style={{ height: `${WEEK_HOUR_HEIGHT_PX}px` }}
                >
                  {hourLabels[hour]}
                </div>
              ))}
            </div>

            <div className="shrink-0">
              <div className="sticky top-0 z-10 flex border-b bg-surface">
                {weekDays.map((day) => (
                  <button
                    className="border-r px-2 py-2 text-left text-xs font-semibold text-text hover:bg-surface-muted"
                    key={dateKey(day)}
                    onClick={() => setAnchorDate(day)}
                    style={{ width: `${WEEK_DAY_WIDTH_PX}px`, height: "40px" }}
                    type="button"
                  >
                    {day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                  </button>
                ))}
              </div>

              <div
                className="relative"
                onMouseLeave={() => {
                  if (hoveredWeekCell) {
                    setHoveredWeekCell(null);
                  }
                }}
                onMouseMove={(event) => {
                  if (!canShowWeekCellHover) {
                    if (hoveredWeekCell) {
                      setHoveredWeekCell(null);
                    }
                    return;
                  }
                  const rect = event.currentTarget.getBoundingClientRect();
                  const x = event.clientX - rect.left;
                  const y = event.clientY - rect.top;
                  const dayIndex = Math.floor(x / WEEK_DAY_WIDTH_PX);
                  const hourIndex = Math.floor(y / WEEK_HOUR_HEIGHT_PX);

                  if (dayIndex < 0 || dayIndex >= weekDays.length || hourIndex < 0 || hourIndex >= HOURS.length) {
                    if (hoveredWeekCell) {
                      setHoveredWeekCell(null);
                    }
                    return;
                  }

                  if (!hoveredWeekCell || hoveredWeekCell.dayIndex !== dayIndex || hoveredWeekCell.hourIndex !== hourIndex) {
                    setHoveredWeekCell({ dayIndex, hourIndex });
                  }
                }}
                onDoubleClick={(event) => {
                  if (!canEdit || !onQuickAdd) {
                    return;
                  }
                  const rect = event.currentTarget.getBoundingClientRect();
                  const x = event.clientX - rect.left;
                  const y = event.clientY - rect.top;
                  const dayIndex = Math.max(0, Math.min(weekDays.length - 1, Math.floor(x / WEEK_DAY_WIDTH_PX)));
                  const day = weekDays[dayIndex];
                  if (!day) {
                    return;
                  }
                  const minutes = Math.floor((Math.max(0, Math.min(y, weekGridHeight - 1)) / WEEK_HOUR_HEIGHT_PX) * 60);
                  const snappedStartMinutes = Math.floor(minutes / 15) * 15;
                  const start = new Date(startOfDay(day).getTime() + snappedStartMinutes * 60 * 1000);
                  const end = new Date(start.getTime() + 60 * 60 * 1000);
                  setQuickAddStartsAtUtc(start.toISOString());
                  setQuickAddEndsAtUtc(end.toISOString());
                  setQuickAddTitle("New event");
                  setQuickAddOpen(true);
                  setAnchorDate(day);
                }}
                style={{ width: `${weekGridWidth}px`, height: `${weekGridHeight}px` }}
              >
                {canShowWeekCellHover && hoveredWeekCell ? (
                  <div
                    className="pointer-events-none absolute bg-accent/15"
                    style={{
                      left: `${hoveredWeekCell.dayIndex * WEEK_DAY_WIDTH_PX}px`,
                      top: `${hoveredWeekCell.hourIndex * WEEK_HOUR_HEIGHT_PX}px`,
                      width: `${WEEK_DAY_WIDTH_PX}px`,
                      height: `${WEEK_HOUR_HEIGHT_PX}px`
                    }}
                  />
                ) : null}
                <div className="pointer-events-none absolute inset-0">
                  {HOURS.map((hour) => (
                    <div
                      className="absolute left-0 right-0 border-b"
                      key={`h-${hour}`}
                      style={{ top: `${hour * WEEK_HOUR_HEIGHT_PX}px`, height: `${WEEK_HOUR_HEIGHT_PX}px` }}
                    />
                  ))}
                  <div className="absolute inset-y-0 left-0 flex">
                    {weekDays.map((day) => (
                      <div className="h-full border-r" key={`d-${dateKey(day)}`} style={{ width: `${WEEK_DAY_WIDTH_PX}px` }} />
                    ))}
                  </div>
                </div>

                {weekPositionedItems.map(({ item, key, top, left, width, height, startsLabel }) => (
                  <button
                    className={cn(
                      "absolute overflow-hidden rounded-control px-2 py-1 text-left text-[11px]",
                      item.entryType === "practice"
                        ? "bg-emerald-100 text-emerald-800"
                        : item.entryType === "game"
                          ? "bg-sky-100 text-sky-800"
                          : "bg-amber-100 text-amber-800",
                      item.status === "cancelled" && "line-through opacity-60",
                      canEdit && onMoveItem && !item.id.startsWith("__pending_create__") && item.id !== DRAFT_ITEM_ID && "cursor-grab active:cursor-grabbing"
                    )}
                    key={key}
                    onClick={() => selectCalendarItem(item.id)}
                    onDoubleClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => startWeekDrag(event, item, "move")}
                    style={{ top: `${top}px`, left: `${left}px`, width: `${width}px`, height: `${height}px` }}
                    type="button"
                  >
                    {canEdit && onMoveItem ? (
                      <span
                        className="absolute inset-x-1 top-0 h-1.5 cursor-ns-resize rounded-full"
                        onMouseDown={(event) => {
                          startWeekDrag(event, item, "resize_top");
                        }}
                      />
                    ) : null}
                    <p className="truncate font-semibold">{item.title}</p>
                    <p className="truncate text-[10px]">{startsLabel}</p>
                    {canEdit && onResizeItem ? (
                      <span
                        className="absolute inset-x-1 bottom-0 h-1.5 cursor-ns-resize rounded-full"
                        onMouseDown={(event) => {
                          startWeekDrag(event, item, "resize_bottom");
                        }}
                      />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {view === "day" ? (
        <div className="space-y-2">
          {dayItems.length === 0 ? <p className="text-sm text-text-muted">No items scheduled for this day.</p> : null}
          {dayItems.map((item) => (
            <article className="rounded-control border bg-surface px-3 py-2" key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <button className="text-left" onClick={() => selectCalendarItem(item.id)} type="button">
                  <p className="text-xs text-text-muted">
                    {new Date(item.startsAtUtc).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} •{" "}
                    {new Date(item.startsAtUtc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} -{" "}
                    {new Date(item.endsAtUtc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </p>
                  <p className="font-semibold text-text">{item.title}</p>
                </button>

                {canEdit && onResizeItem ? (
                  <div className="inline-flex items-center gap-1 rounded-control border bg-surface p-1">
                    <button
                      className="rounded-control px-2 py-1 text-xs text-text-muted hover:bg-surface-muted"
                      onClick={() => {
                        const nextEnd = new Date(new Date(item.endsAtUtc).getTime() - 15 * 60 * 1000).toISOString();
                        applyOptimisticWindow(item.id, item.startsAtUtc, nextEnd);
                        onResizeItem({ itemId: item.id, endsAtUtc: nextEnd });
                      }}
                      type="button"
                    >
                      -15m
                    </button>
                    <button
                      className="rounded-control px-2 py-1 text-xs text-text-muted hover:bg-surface-muted"
                      onClick={() => {
                        const nextEnd = new Date(new Date(item.endsAtUtc).getTime() + 15 * 60 * 1000).toISOString();
                        applyOptimisticWindow(item.id, item.startsAtUtc, nextEnd);
                        onResizeItem({ itemId: item.id, endsAtUtc: nextEnd });
                      }}
                      type="button"
                    >
                      +15m
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {sidePanelSlot}
      <Panel
        footer={
          <>
            <Button onClick={() => setQuickAddOpen(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button
              disabled={!quickAddTitle.trim() || Boolean(quickAddConflict) || new Date(quickAddEndsAtUtc).getTime() <= new Date(quickAddStartsAtUtc).getTime()}
              onClick={() => {
                if (!onQuickAdd) {
                  return;
                }
                const title = quickAddTitle.trim();
                setPendingCreates((current) => [
                  ...current,
                  {
                    item: {
                      id: `__pending_create__${Date.now()}`,
                      title,
                      entryType: "event",
                      status: "scheduled",
                      startsAtUtc: quickAddStartsAtUtc,
                      endsAtUtc: quickAddEndsAtUtc,
                      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
                    },
                    expiresAt: Date.now() + PENDING_CREATE_TTL_MS
                  }
                ]);
                onQuickAdd({
                  title,
                  startsAtUtc: quickAddStartsAtUtc,
                  endsAtUtc: quickAddEndsAtUtc
                });
                setQuickAddOpen(false);
              }}
              type="button"
            >
              Create
            </Button>
          </>
        }
        onClose={() => setQuickAddOpen(false)}
        open={quickAddOpen && canEdit}
        subtitle="Double-click a week cell to prefill details. Draft appears on the calendar immediately."
        title="Create event"
      >
        <div className="space-y-3">
          <Input onChange={(event) => setQuickAddTitle(event.target.value)} placeholder="Session title" value={quickAddTitle} />
          <div className="grid gap-2">
            <label className="space-y-1 text-xs text-text-muted">
              <span>Starts</span>
              <Input
                onChange={(event) => {
                  const next = localInputToUtcIso(event.target.value);
                  if (next) {
                    setQuickAddStartsAtUtc(next);
                  }
                }}
                type="datetime-local"
                value={toLocalInputValue(quickAddStartsAtUtc)}
              />
            </label>
            <label className="space-y-1 text-xs text-text-muted">
              <span>Ends</span>
              <Input
                onChange={(event) => {
                  const next = localInputToUtcIso(event.target.value);
                  if (next) {
                    setQuickAddEndsAtUtc(next);
                  }
                }}
                type="datetime-local"
                value={toLocalInputValue(quickAddEndsAtUtc)}
              />
            </label>
          </div>
          {quickAddConflict ? <p className="text-xs text-destructive">{quickAddConflict}</p> : null}
        </div>
      </Panel>
    </div>
  );
}
