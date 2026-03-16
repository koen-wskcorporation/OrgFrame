"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@orgframe/ui/ui/button";
import { Input } from "@orgframe/ui/ui/input";
import { Panel } from "@orgframe/ui/ui/panel";
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
  disableHoverGhost?: boolean;
  className?: string;
  framed?: boolean;
  onSelectItem?: (itemId: string) => void;
  onCreateRange?: (input: { startsAtUtc: string; endsAtUtc: string }) => void;
  onMoveItem?: (input: { itemId: string; startsAtUtc: string; endsAtUtc: string }) => void;
  onResizeItem?: (input: { itemId: string; endsAtUtc: string }) => void;
  onQuickAdd?: (draft: UnifiedCalendarQuickAddDraft) => void;
  onQuickAddDraftChange?: (draft: UnifiedCalendarQuickAddDraft & { open: boolean }) => void;
  getConflictMessage?: (draft: UnifiedCalendarQuickAddDraft) => string | null;
  renderQuickAddFields?: (context: {
    title: string;
    startsAtUtc: string;
    endsAtUtc: string;
    setTitle: (value: string) => void;
    setStartsAtUtc: (value: string) => void;
    setEndsAtUtc: (value: string) => void;
    conflictMessage: string | null;
    open: boolean;
  }) => React.ReactNode;
  headerSlot?: React.ReactNode;
  filterSlot?: React.ReactNode;
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
const WEEK_HEADER_HEIGHT_PX = 40;
const WEEK_HOUR_HEIGHT_PX = 56;
const WEEK_VISIBLE_HOURS = 8;
const WEEK_CENTER_HOUR = 12;
const WEEK_WINDOW_DAYS = 21;
const WEEK_WINDOW_CENTER_OFFSET = 7;
const WEEK_SCROLL_BUFFER_DAYS = 2;
const DRAFT_ITEM_ID = "__calendar_draft__";

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
  initialView = "week",
  canEdit = true,
  disableHoverGhost = false,
  className,
  framed = true,
  onSelectItem,
  onCreateRange,
  onMoveItem,
  onResizeItem,
  onQuickAdd,
  onQuickAddDraftChange,
  getConflictMessage,
  renderQuickAddFields,
  headerSlot,
  filterSlot
}: UnifiedCalendarProps) {
  const [view, setView] = useState<UnifiedCalendarView>(initialView);
  const [anchorDate, setAnchorDate] = useState<Date>(() => startOfDay(new Date()));
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());
  const [weekWindowStart, setWeekWindowStart] = useState<Date>(() => addDays(startOfWeek(new Date()), -WEEK_WINDOW_CENTER_OFFSET));
  const [dragCreateStart, setDragCreateStart] = useState<string | null>(null);
  const [dragCreateHover, setDragCreateHover] = useState<string | null>(null);
  const [dragMoveItemId, setDragMoveItemId] = useState<string | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [quickAddStartsAtUtc, setQuickAddStartsAtUtc] = useState(() => startOfDay(new Date()).toISOString());
  const [quickAddEndsAtUtc, setQuickAddEndsAtUtc] = useState(() => endOfDay(new Date()).toISOString());
  const [hoverSlot, setHoverSlot] = useState<{ dayIndex: number; startMinutes: number } | null>(null);
  const [resizeDrag, setResizeDrag] = useState<{
    itemId: string;
    edge: "top" | "bottom";
    originY: number;
    startsAtUtc: string;
    endsAtUtc: string;
  } | null>(null);
  const [resizePreview, setResizePreview] = useState<{
    itemId: string;
    startsAtUtc: string;
    endsAtUtc: string;
  } | null>(null);
  const [resizeSnap, setResizeSnap] = useState<{ label: string; x: number; y: number } | null>(null);
  const weekScrollRef = useRef<HTMLDivElement | null>(null);
  const weekScrollShiftRef = useRef(false);
  const weekScrollResetRef = useRef(false);
  const suppressHoverSlot = quickAddOpen || Boolean(resizeDrag) || Boolean(dragMoveItemId) || disableHoverGhost;

  const monthAnchor = startOfMonth(anchorDate);
  const monthGridStart = startOfWeek(monthAnchor);
  const monthDays = useMemo(() => Array.from({ length: 42 }, (_, index) => addDays(monthGridStart, index)), [monthGridStart]);
  const draftItem = useMemo<UnifiedCalendarItem | null>(() => {
    if (!quickAddOpen) {
      return null;
    }

    return {
      id: DRAFT_ITEM_ID,
      title: quickAddTitle.trim() || "New event",
      entryType: "event",
      status: "scheduled",
      startsAtUtc: quickAddStartsAtUtc,
      endsAtUtc: quickAddEndsAtUtc,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  }, [quickAddEndsAtUtc, quickAddOpen, quickAddStartsAtUtc, quickAddTitle]);
  const displayItems = useMemo(() => (draftItem ? [...items, draftItem] : items), [draftItem, items]);

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

  useEffect(() => {
    if (!onQuickAddDraftChange) {
      return;
    }
    onQuickAddDraftChange({
      title: quickAddTitle,
      startsAtUtc: quickAddStartsAtUtc,
      endsAtUtc: quickAddEndsAtUtc,
      open: quickAddOpen
    });
  }, [onQuickAddDraftChange, quickAddEndsAtUtc, quickAddOpen, quickAddStartsAtUtc, quickAddTitle]);

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

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (view !== "week") {
      return;
    }
    const container = weekScrollRef.current;
    if (!container) {
      return;
    }
    const targetTop = Math.max(0, (WEEK_CENTER_HOUR - WEEK_VISIBLE_HOURS / 2) * WEEK_HOUR_HEIGHT_PX);
    requestAnimationFrame(() => {
      container.scrollTop = targetTop;
    });
  }, [view]);

  useEffect(() => {
    if (view !== "week") {
      return;
    }
    const nextStart = addDays(startOfWeek(anchorDate), -WEEK_WINDOW_CENTER_OFFSET);
    setWeekWindowStart(nextStart);
    const container = weekScrollRef.current;
    if (!container) {
      return;
    }
    const targetLeft = WEEK_DAY_WIDTH_PX * WEEK_WINDOW_CENTER_OFFSET;
    requestAnimationFrame(() => {
      if (weekScrollResetRef.current) {
        weekScrollResetRef.current = false;
        return;
      }
      container.scrollLeft = targetLeft;
    });
  }, [anchorDate, view]);

  function shiftWeekWindow(daysDelta: number) {
    const container = weekScrollRef.current;
    weekScrollShiftRef.current = true;
    weekScrollResetRef.current = true;
    setWeekWindowStart((current) => addDays(current, daysDelta));
    setAnchorDate((current) => addDays(current, daysDelta));
    if (container) {
      container.scrollLeft -= WEEK_DAY_WIDTH_PX * daysDelta;
    }
    requestAnimationFrame(() => {
      weekScrollShiftRef.current = false;
    });
  }

  useEffect(() => {
    if (suppressHoverSlot) {
      setHoverSlot(null);
    }
  }, [suppressHoverSlot]);

  useEffect(() => {
    if (!resizeDrag) {
      setResizePreview(null);
      setResizeSnap(null);
      return;
    }
    const drag = resizeDrag;

    function onMouseMove(event: MouseEvent) {
      const deltaY = event.clientY - drag.originY;
      const rawMinutes = (deltaY / WEEK_HOUR_HEIGHT_PX) * 60;
      const snappedMinutes = Math.round(rawMinutes / 15) * 15;
      const snappedLabel = Math.abs(snappedMinutes) % 60;
      setResizeSnap({
        label: `${snappedLabel}`,
        x: event.clientX + 12,
        y: event.clientY - 12
      });
      if (drag.edge === "top") {
        const currentEnd = new Date(drag.endsAtUtc).getTime();
        const nextStart = new Date(new Date(drag.startsAtUtc).getTime() + snappedMinutes * 60 * 1000).getTime();
        if (nextStart < currentEnd - 15 * 60 * 1000) {
          setResizePreview({
            itemId: drag.itemId,
            startsAtUtc: new Date(nextStart).toISOString(),
            endsAtUtc: drag.endsAtUtc
          });
        }
      }

      if (drag.edge === "bottom") {
        const currentStart = new Date(drag.startsAtUtc).getTime();
        const nextEnd = new Date(new Date(drag.endsAtUtc).getTime() + snappedMinutes * 60 * 1000).getTime();
        if (nextEnd > currentStart + 15 * 60 * 1000) {
          setResizePreview({
            itemId: drag.itemId,
            startsAtUtc: drag.startsAtUtc,
            endsAtUtc: new Date(nextEnd).toISOString()
          });
        }
      }
    }

    function onMouseUp(event: MouseEvent) {
      const deltaY = event.clientY - drag.originY;
      const rawMinutes = (deltaY / WEEK_HOUR_HEIGHT_PX) * 60;
      const snappedMinutes = Math.round(rawMinutes / 15) * 15;

      if (drag.edge === "top" && onMoveItem) {
        const currentEnd = new Date(drag.endsAtUtc).getTime();
        const nextStart = new Date(new Date(drag.startsAtUtc).getTime() + snappedMinutes * 60 * 1000).getTime();
        if (nextStart < currentEnd - 30 * 60 * 1000) {
          onMoveItem({
            itemId: drag.itemId,
            startsAtUtc: new Date(nextStart).toISOString(),
            endsAtUtc: drag.endsAtUtc
          });
        }
      }

      if (drag.edge === "bottom" && onResizeItem) {
        const currentStart = new Date(drag.startsAtUtc).getTime();
        const nextEnd = new Date(new Date(drag.endsAtUtc).getTime() + snappedMinutes * 60 * 1000).getTime();
        if (nextEnd > currentStart + 30 * 60 * 1000) {
          onResizeItem({
            itemId: drag.itemId,
            endsAtUtc: new Date(nextEnd).toISOString()
          });
        }
      }

      setResizeDrag(null);
      setResizePreview(null);
      setResizeSnap(null);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp, { once: true });
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMoveItem, onResizeItem, resizeDrag]);

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

  function selectCalendarItem(itemId: string) {
    if (itemId === DRAFT_ITEM_ID) {
      setQuickAddOpen(true);
      return;
    }
    onSelectItem?.(itemId);
  }

  const rootClasses = framed ? "flex h-full flex-col gap-4 rounded-card border bg-surface p-4 shadow-card" : "flex h-full flex-col gap-4";

  return (
    <div className={cn(rootClasses, className)}>
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
                    const item = items.find((candidate) => candidate.id === dragMoveItemId);
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
                          "truncate rounded-full border border-border/80 bg-surface/95 px-2 py-0.5 text-[10px] font-medium text-text shadow-sm transition-[box-shadow,transform] duration-150 ease-out hover:shadow-card hover:-translate-y-0.5",
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
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              item.entryType === "practice" ? "bg-emerald-400" : item.entryType === "game" ? "bg-sky-400" : "bg-amber-400"
                            )}
                          />
                          {item.title}
                        </span>
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
          className="min-h-0 flex-1 overflow-auto rounded-control border bg-surface scroll-smooth"
          ref={weekScrollRef}
          onScroll={(event) => {
            if (weekScrollShiftRef.current) {
              return;
            }
            const container = event.currentTarget;
            const leftThreshold = WEEK_DAY_WIDTH_PX * WEEK_SCROLL_BUFFER_DAYS;
            const rightThreshold = WEEK_DAY_WIDTH_PX * (WEEK_WINDOW_DAYS - WEEK_WINDOW_CENTER_OFFSET - WEEK_SCROLL_BUFFER_DAYS);
            if (container.scrollLeft < leftThreshold) {
              shiftWeekWindow(-WEEK_WINDOW_CENTER_OFFSET);
            } else if (container.scrollLeft > rightThreshold) {
              shiftWeekWindow(WEEK_WINDOW_CENTER_OFFSET);
            }
          }}
          style={{ height: "100%", maxHeight: `${WEEK_VISIBLE_HOURS * WEEK_HOUR_HEIGHT_PX}px` }}
        >
          {(() => {
            const weekDays = Array.from({ length: WEEK_WINDOW_DAYS }, (_, index) => addDays(weekWindowStart, index));
            const gridWidth = weekDays.length * WEEK_DAY_WIDTH_PX;
            const gridHeight = HOURS.length * WEEK_HOUR_HEIGHT_PX;
            const nowKey = dateKey(currentTime);
            const currentDayIndex = weekDays.findIndex((day) => dateKey(day) === nowKey);
            const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
            const nowTop = (nowMinutes / 60) * WEEK_HOUR_HEIGHT_PX + 1;
            const showNow = currentDayIndex >= 0 && nowTop >= 0 && nowTop <= gridHeight;
            const nowTopWithHeader = nowTop + WEEK_HEADER_HEIGHT_PX;

            const fullWidth = WEEK_TIME_GUTTER_WIDTH_PX + gridWidth;

            return (
              <div className="relative flex w-fit">
                {showNow ? (
                  <div className="pointer-events-none absolute left-0 z-40" style={{ top: `${nowTopWithHeader}px`, width: `${fullWidth}px` }}>
                    <div className="absolute left-0 right-0 h-[2px]" style={{ backgroundColor: "hsl(var(--accent) / 0.18)" }} />
                    <div
                      className="absolute h-[2px]"
                      style={{
                        backgroundColor: "hsl(var(--accent) / 1)",
                        left: `${WEEK_TIME_GUTTER_WIDTH_PX + currentDayIndex * WEEK_DAY_WIDTH_PX}px`,
                        width: `${WEEK_DAY_WIDTH_PX}px`
                      }}
                    />
                    <div
                      className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-border/40 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm"
                      style={{ backgroundColor: "hsl(var(--accent) / 0.9)" }}
                    >
                      {currentTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </div>
                  </div>
                ) : null}
                <div className="sticky left-0 z-20 shrink-0 border-r bg-surface" style={{ width: `${WEEK_TIME_GUTTER_WIDTH_PX}px` }}>
                  <div className="h-10 border-b px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Time</div>
                  <div className="relative" style={{ height: `${gridHeight}px` }}>
                    {HOURS.map((hour) => (
                      <div
                        className="border-b px-2 py-1 text-[11px] font-medium text-text-muted"
                        key={hour}
                        style={{ height: `${WEEK_HOUR_HEIGHT_PX}px` }}
                      >
                        {new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: "numeric" })}
                      </div>
                    ))}
                  </div>
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
                      const minutes = Math.floor((Math.max(0, Math.min(y, gridHeight - 1)) / WEEK_HOUR_HEIGHT_PX) * 60);
                      const snappedStartMinutes = Math.floor(minutes / 30) * 30;
                      const start = new Date(startOfDay(day).getTime() + snappedStartMinutes * 60 * 1000);
                      const end = new Date(start.getTime() + 60 * 60 * 1000);
                      setQuickAddStartsAtUtc(start.toISOString());
                      setQuickAddEndsAtUtc(end.toISOString());
                      setQuickAddTitle("New event");
                      setQuickAddOpen(true);
                      setAnchorDate(day);
                    }}
                    onMouseLeave={() => setHoverSlot(null)}
                    onMouseMove={(event) => {
                      if (!canEdit || suppressHoverSlot) {
                        return;
                      }
                      const rect = event.currentTarget.getBoundingClientRect();
                      const x = event.clientX - rect.left;
                      const y = event.clientY - rect.top;
                      const dayIndex = Math.max(0, Math.min(weekDays.length - 1, Math.floor(x / WEEK_DAY_WIDTH_PX)));
                      const minutes = Math.floor((Math.max(0, Math.min(y, gridHeight - 1)) / WEEK_HOUR_HEIGHT_PX) * 60);
                      const snappedStartMinutes = Math.floor(minutes / 30) * 30;
                      setHoverSlot((current) => {
                        if (current && current.dayIndex === dayIndex && current.startMinutes === snappedStartMinutes) {
                          return current;
                        }
                        return { dayIndex, startMinutes: snappedStartMinutes };
                      });
                    }}
                    style={{ width: `${gridWidth}px`, height: `${gridHeight}px` }}
                  >
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

                    {hoverSlot && canEdit && !suppressHoverSlot ? (
                      <div
                        className="pointer-events-none absolute rounded-control border border-dashed border-border/70 bg-surface/70 shadow-sm"
                        style={{
                          top: `${(hoverSlot.startMinutes / 60) * WEEK_HOUR_HEIGHT_PX + 1}px`,
                          left: `${hoverSlot.dayIndex * WEEK_DAY_WIDTH_PX + 2}px`,
                          width: `${WEEK_DAY_WIDTH_PX - 4}px`,
                          height: `${WEEK_HOUR_HEIGHT_PX - 2}px`
                        }}
                      >
                        <div className="flex h-full items-center justify-center text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                          Add event
                        </div>
                      </div>
                    ) : null}

                    {weekDays.map((day, dayIndex) => {
                      const dayStart = startOfDay(day);
                      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
                      const dayItemList = displayItems.filter((item) => intersectsDay(item.startsAtUtc, item.endsAtUtc, day));

                      return dayItemList.map((item) => {
                        const renderedItem =
                          resizePreview && resizePreview.itemId === item.id
                            ? { ...item, startsAtUtc: resizePreview.startsAtUtc, endsAtUtc: resizePreview.endsAtUtc }
                            : item;
                        const itemStart = new Date(renderedItem.startsAtUtc);
                        const itemEnd = new Date(renderedItem.endsAtUtc);
                        const clampedStartMs = Math.max(itemStart.getTime(), dayStart.getTime());
                        const clampedEndMs = Math.min(itemEnd.getTime(), dayEnd.getTime());
                        const startMinutes = (clampedStartMs - dayStart.getTime()) / (60 * 1000);
                        const endMinutes = (clampedEndMs - dayStart.getTime()) / (60 * 1000);
                        const top = (startMinutes / 60) * WEEK_HOUR_HEIGHT_PX + 1;
                        const height = Math.max(((endMinutes - startMinutes) / 60) * WEEK_HOUR_HEIGHT_PX - 2, 18);
                        const left = dayIndex * WEEK_DAY_WIDTH_PX + 2;
                        const width = WEEK_DAY_WIDTH_PX - 4;

                        return (
                          <button
                            className={cn(
                              "group absolute overflow-hidden rounded-control border border-border/70 bg-surface/95 px-2 py-1 text-left text-[11px] text-text shadow-sm transition-[left,top,height,box-shadow,transform] duration-150 ease-out motion-reduce:transition-none hover:shadow-floating active:scale-[0.98]",
                              item.status === "cancelled" && "line-through opacity-60"
                            )}
                            key={`${dayIndex}-${item.id}`}
                            onClick={() => selectCalendarItem(item.id)}
                            onDoubleClick={(event) => event.stopPropagation()}
                            style={{ top: `${top}px`, left: `${left}px`, width: `${width}px`, height: `${height}px` }}
                            type="button"
                          >
                            {canEdit && onMoveItem ? (
                              <span
                                className="absolute left-1/2 top-0 h-2 w-10 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize rounded-full border border-border/60 bg-surface/95 opacity-0 shadow-sm transition-opacity duration-150 ease-out group-hover:opacity-100"
                                onMouseDown={(event) => {
                                  event.stopPropagation();
                                  setHoverSlot(null);
                                  setResizeDrag({
                                    itemId: item.id,
                                    edge: "top",
                                    originY: event.clientY,
                                    startsAtUtc: renderedItem.startsAtUtc,
                                    endsAtUtc: renderedItem.endsAtUtc
                                  });
                                }}
                              />
                            ) : null}
                            <div className="flex items-center justify-between gap-1">
                              <p className="truncate font-semibold">{item.title}</p>
                              <span
                                className={cn(
                                  "shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                                  item.entryType === "practice"
                                    ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                                    : item.entryType === "game"
                                      ? "border-sky-200 bg-sky-100 text-sky-800"
                                      : "border-amber-200 bg-amber-100 text-amber-800"
                                )}
                              >
                                {item.entryType}
                              </span>
                            </div>
                            <p className="truncate text-[10px] text-text-muted">
                              {new Date(renderedItem.startsAtUtc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                            </p>
                            {canEdit && onResizeItem ? (
                              <span
                                className="absolute left-1/2 bottom-0 h-2 w-10 -translate-x-1/2 translate-y-1/2 cursor-ns-resize rounded-full border border-border/60 bg-surface/95 opacity-0 shadow-sm transition-opacity duration-150 ease-out group-hover:opacity-100"
                                onMouseDown={(event) => {
                                  event.stopPropagation();
                                  setHoverSlot(null);
                                  setResizeDrag({
                                    itemId: item.id,
                                    edge: "bottom",
                                    originY: event.clientY,
                                    startsAtUtc: renderedItem.startsAtUtc,
                                    endsAtUtc: renderedItem.endsAtUtc
                                  });
                                }}
                              />
                            ) : null}
                          </button>
                        );
                      });
                    })}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      ) : null}

      {view === "day" ? (
        <div className="min-h-0 flex-1 space-y-2 overflow-auto">
          {dayItems.length === 0 ? <p className="text-sm text-text-muted">No items scheduled for this day.</p> : null}
          {dayItems.map((item) => (
            <article
              className="rounded-control border bg-surface px-3 py-2 transition-[box-shadow,transform] duration-150 ease-out hover:shadow-card hover:-translate-y-0.5"
              key={item.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <button className="text-left" onClick={() => selectCalendarItem(item.id)} type="button">
                  <p className="text-xs text-text-muted">
                    {new Date(item.startsAtUtc).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} •{" "}
                    {new Date(item.startsAtUtc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} -{" "}
                    {new Date(item.endsAtUtc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        item.entryType === "practice" ? "bg-emerald-400" : item.entryType === "game" ? "bg-sky-400" : "bg-amber-400"
                      )}
                    />
                    <p className="font-semibold text-text">{item.title}</p>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        item.entryType === "practice"
                          ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                          : item.entryType === "game"
                            ? "border-sky-200 bg-sky-100 text-sky-800"
                            : "border-amber-200 bg-amber-100 text-amber-800"
                      )}
                    >
                      {item.entryType}
                    </span>
                  </div>
                </button>

                {canEdit && onResizeItem ? (
                  <div className="inline-flex items-center gap-1 rounded-control border bg-surface p-1">
                    <button
                      className="rounded-control px-2 py-1 text-xs text-text-muted hover:bg-surface-muted"
                      onClick={() => {
                        const nextEnd = new Date(new Date(item.endsAtUtc).getTime() - 30 * 60 * 1000).toISOString();
                        onResizeItem({ itemId: item.id, endsAtUtc: nextEnd });
                      }}
                      type="button"
                    >
                      -15m
                    </button>
                    <button
                      className="rounded-control px-2 py-1 text-xs text-text-muted hover:bg-surface-muted"
                      onClick={() => {
                        const nextEnd = new Date(new Date(item.endsAtUtc).getTime() + 30 * 60 * 1000).toISOString();
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

      {resizeSnap ? (
        <div
          className="pointer-events-none fixed z-50 flex h-7 w-7 items-center justify-center rounded-full border border-border/70 bg-surface/95 text-[11px] font-semibold text-text shadow-sm"
          style={{ left: `${resizeSnap.x}px`, top: `${resizeSnap.y}px` }}
        >
          {resizeSnap.label}
        </div>
      ) : null}
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
                onQuickAdd({
                  title: quickAddTitle.trim(),
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
          {renderQuickAddFields
            ? renderQuickAddFields({
                title: quickAddTitle,
                startsAtUtc: quickAddStartsAtUtc,
                endsAtUtc: quickAddEndsAtUtc,
                setTitle: setQuickAddTitle,
                setStartsAtUtc: setQuickAddStartsAtUtc,
                setEndsAtUtc: setQuickAddEndsAtUtc,
                conflictMessage: quickAddConflict,
                open: quickAddOpen
              })
            : null}
        </div>
      </Panel>
    </div>
  );
}
