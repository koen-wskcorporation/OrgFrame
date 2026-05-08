"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { Chip } from "@orgframe/ui/primitives/chip";
import { Input } from "@orgframe/ui/primitives/input";
import { Panel } from "@orgframe/ui/primitives/panel";
import { cn } from "@orgframe/ui/primitives/utils";

export type CalendarView = "month" | "week" | "day";

export type CalendarItem = {
  id: string;
  title: string;
  entryType: "event" | "practice" | "game";
  status: "scheduled" | "cancelled";
  startsAtUtc: string;
  endsAtUtc: string;
  timezone: string;
  summary?: string | null;
  teamChips?: string[];
};

export type CalendarQuickAddDraft = {
  title: string;
  startsAtUtc: string;
  endsAtUtc: string;
};

type CalendarProps = {
  items: CalendarItem[];
  initialView?: CalendarView;
  referenceTimezone?: string;
  canEdit?: boolean;
  quickAddUx?: "internal" | "external";
  disableHoverGhost?: boolean;
  className?: string;
  framed?: boolean;
  onSelectItem?: (itemId: string) => void;
  onCreateRange?: (input: { startsAtUtc: string; endsAtUtc: string }) => void;
  onMoveItem?: (input: { itemId: string; startsAtUtc: string; endsAtUtc: string }) => void;
  onResizeItem?: (input: { itemId: string; endsAtUtc: string }) => void;
  onQuickAdd?: (draft: CalendarQuickAddDraft) => void;
  onQuickAddIntent?: (draft: CalendarQuickAddDraft) => void;
  onQuickAddDraftChange?: (draft: CalendarQuickAddDraft & { open: boolean }) => void;
  onCancelCreate?: () => void;
  getConflictMessage?: (draft: CalendarQuickAddDraft) => string | null;
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
  controlsSlot?: React.ReactNode;
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

function todayInTimezone(timezone?: string) {
  const now = new Date();
  const resolvedTimezone = timezone?.trim();
  if (!resolvedTimezone) {
    return startOfDay(now);
  }

  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: resolvedTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    const parts = formatter.formatToParts(now);
    const byType = new Map(parts.map((part) => [part.type, part.value]));
    const year = Number.parseInt(byType.get("year") ?? "", 10);
    const month = Number.parseInt(byType.get("month") ?? "", 10);
    const day = Number.parseInt(byType.get("day") ?? "", 10);
    if (Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day)) {
      return new Date(year, month - 1, day);
    }
  } catch {
    return startOfDay(now);
  }

  return startOfDay(now);
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

function formatHeading(anchorDate: Date, view: CalendarView) {
  if (view === "month") {
    return anchorDate.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric"
    });
  }

  if (view === "week") {
    const monthName = anchorDate.toLocaleDateString(undefined, { month: "long" });
    const currentWeekStart = startOfWeek(anchorDate);
    const currentWeekEnd = addDays(currentWeekStart, 6);
    return `${monthName} Week (${currentWeekStart.getDate()}-${currentWeekEnd.getDate()})`;
  }

  return anchorDate.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function itemDurationMs(item: CalendarItem) {
  return new Date(item.endsAtUtc).getTime() - new Date(item.startsAtUtc).getTime();
}

const HOURS = Array.from({ length: 24 }, (_, index) => index);
const WEEK_TIME_GUTTER_WIDTH_PX = 80;
const WEEK_HEADER_HEIGHT_PX = 40;
const WEEK_HOUR_HEIGHT_PX = 56;
const WEEK_VISIBLE_HOURS = 8;
const WEEK_VISIBLE_DAYS = 7;
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

function formatResizeBoundaryLabel(timestampMs: number) {
  return new Date(timestampMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

export function Calendar({
  items,
  initialView = "week",
  referenceTimezone,
  canEdit = true,
  quickAddUx = "internal",
  disableHoverGhost = false,
  className,
  framed = true,
  onSelectItem,
  onCreateRange,
  onMoveItem,
  onResizeItem,
  onQuickAdd,
  onQuickAddIntent,
  onQuickAddDraftChange,
  onCancelCreate,
  getConflictMessage,
  renderQuickAddFields,
  headerSlot,
  filterSlot,
  controlsSlot
}: CalendarProps) {
  const [view, setView] = useState<CalendarView>(initialView);
  const [anchorDate, setAnchorDate] = useState<Date>(() => todayInTimezone(referenceTimezone));
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());
  const [dragMoveItemId, setDragMoveItemId] = useState<string | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [quickAddStartsAtUtc, setQuickAddStartsAtUtc] = useState(() => startOfDay(todayInTimezone(referenceTimezone)).toISOString());
  const [quickAddEndsAtUtc, setQuickAddEndsAtUtc] = useState(() => endOfDay(todayInTimezone(referenceTimezone)).toISOString());
  const [hoverSlot, setHoverSlot] = useState<{ dayIndex: number; startMinutes: number } | null>(null);
  const [monthHoverDayKey, setMonthHoverDayKey] = useState<string | null>(null);
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
  const [weekEnterZoomState, setWeekEnterZoomState] = useState<"idle" | "preparing" | "animating">("idle");
  const [dayEnterZoomState, setDayEnterZoomState] = useState<"idle" | "preparing" | "animating">("idle");
  const weekScrollRef = useRef<HTMLDivElement | null>(null);
  const suppressHoverSlot = quickAddOpen || Boolean(resizeDrag) || Boolean(dragMoveItemId) || disableHoverGhost;

  function focusWeekFromMonth(day: Date) {
    if (quickAddOpen) {
      setQuickAddOpen(false);
    }
    onCancelCreate?.();
    setAnchorDate(day);
    setView("week");
    setWeekEnterZoomState("preparing");
  }

  function focusDayFromWeek(day: Date) {
    if (quickAddOpen) {
      setQuickAddOpen(false);
    }
    onCancelCreate?.();
    setAnchorDate(day);
    setView("day");
    setDayEnterZoomState("preparing");
  }

  function buildDefaultQuickAddDraft(anchor: Date) {
    const start = startOfDay(anchor);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return {
      title: "New event",
      startsAtUtc: start.toISOString(),
      endsAtUtc: end.toISOString()
    };
  }

  const monthAnchor = startOfMonth(anchorDate);
  const monthGridStart = startOfWeek(monthAnchor);
  const monthDays = useMemo(() => Array.from({ length: 42 }, (_, index) => addDays(monthGridStart, index)), [monthGridStart]);
  const draftItem = useMemo<CalendarItem | null>(() => {
    if (quickAddUx !== "internal" || !quickAddOpen) {
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
  const hasInteractiveDraft = quickAddUx === "internal" && quickAddOpen && Boolean(draftItem);

  function moveCalendarItem(input: { itemId: string; startsAtUtc: string; endsAtUtc: string }) {
    if (input.itemId === DRAFT_ITEM_ID && hasInteractiveDraft) {
      setQuickAddStartsAtUtc(input.startsAtUtc);
      setQuickAddEndsAtUtc(input.endsAtUtc);
      return;
    }
    onMoveItem?.(input);
  }

  function resizeCalendarItem(input: { itemId: string; endsAtUtc: string }) {
    if (input.itemId === DRAFT_ITEM_ID && hasInteractiveDraft) {
      setQuickAddEndsAtUtc(input.endsAtUtc);
      return;
    }
    onResizeItem?.(input);
  }

  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();

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

  const quickAddConflict =
    getConflictMessage && quickAddOpen
      ? getConflictMessage({
          title: quickAddTitle,
          startsAtUtc: quickAddStartsAtUtc,
          endsAtUtc: quickAddEndsAtUtc
        })
      : null;

  useEffect(() => {
    if (quickAddUx !== "internal" || !onQuickAddDraftChange) {
      return;
    }
    onQuickAddDraftChange({
      title: quickAddTitle,
      startsAtUtc: quickAddStartsAtUtc,
      endsAtUtc: quickAddEndsAtUtc,
      open: quickAddOpen
    });
  }, [onQuickAddDraftChange, quickAddEndsAtUtc, quickAddOpen, quickAddStartsAtUtc, quickAddTitle, quickAddUx]);

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return true;
      }
      if (target.isContentEditable) {
        return true;
      }
      // Catch composed paths through shadow DOM / custom controls.
      return Boolean(target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']"));
    }

    function onKeyDown(event: KeyboardEvent) {
      // Don't hijack typing inside form controls or when the user is using a
      // modifier shortcut (e.g. Cmd+T to open a browser tab).
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        if (quickAddUx === "external") {
          onQuickAddIntent?.(buildDefaultQuickAddDraft(anchorDate));
        } else {
          const start = startOfDay(anchorDate);
          const end = new Date(start.getTime() + 60 * 60 * 1000);
          setQuickAddStartsAtUtc(start.toISOString());
          setQuickAddEndsAtUtc(end.toISOString());
          setQuickAddTitle("New event");
          setQuickAddOpen(true);
        }
        return;
      }

      if (event.key === "t" || event.key === "T") {
        event.preventDefault();
        setAnchorDate(todayInTimezone(referenceTimezone));
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
  }, [anchorDate, onQuickAddIntent, quickAddUx, referenceTimezone, view]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (view !== "week" && view !== "day") {
      return;
    }
    const container = weekScrollRef.current;
    if (!container) {
      return;
    }
    requestAnimationFrame(() => {
      const weekGridBody = container.querySelector<HTMLElement>("[data-week-grid-body='true']");
      if (!weekGridBody) {
        return;
      }
      const now = new Date();
      const minutesIntoDay = now.getHours() * 60 + now.getMinutes();
      const relevantOffsetPx = (minutesIntoDay / 60) * WEEK_HOUR_HEIGHT_PX;
      const gridStartOffsetPx = weekGridBody.offsetTop;
      const targetTop = Math.max(0, gridStartOffsetPx + relevantOffsetPx - container.clientHeight / 2);
      container.scrollTop = targetTop;
    });
  }, [view]);

  useEffect(() => {
    if (view !== "week" || weekEnterZoomState !== "preparing") {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      setWeekEnterZoomState("animating");
    });
    const timeout = window.setTimeout(() => {
      setWeekEnterZoomState("idle");
    }, 240);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeout);
    };
  }, [view, weekEnterZoomState]);

  useEffect(() => {
    if (view !== "day" || dayEnterZoomState !== "preparing") {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      setDayEnterZoomState("animating");
    });
    const timeout = window.setTimeout(() => {
      setDayEnterZoomState("idle");
    }, 240);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeout);
    };
  }, [dayEnterZoomState, view]);

  useEffect(() => {
    if (suppressHoverSlot) {
      setHoverSlot(null);
      setMonthHoverDayKey(null);
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
      let nextBoundaryMs: number | null = null;
      if (drag.edge === "top") {
        const currentEnd = new Date(drag.endsAtUtc).getTime();
        const nextStart = new Date(new Date(drag.startsAtUtc).getTime() + snappedMinutes * 60 * 1000).getTime();
        if (nextStart < currentEnd - 15 * 60 * 1000) {
          nextBoundaryMs = nextStart;
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
          nextBoundaryMs = nextEnd;
          setResizePreview({
            itemId: drag.itemId,
            startsAtUtc: drag.startsAtUtc,
            endsAtUtc: new Date(nextEnd).toISOString()
          });
        }
      }

      if (nextBoundaryMs !== null) {
        setResizeSnap({
          label: formatResizeBoundaryLabel(nextBoundaryMs),
          x: event.clientX + 12,
          y: event.clientY - 12
        });
      } else {
        setResizeSnap(null);
      }
    }

    function onMouseUp(event: MouseEvent) {
      const deltaY = event.clientY - drag.originY;
      const rawMinutes = (deltaY / WEEK_HOUR_HEIGHT_PX) * 60;
      const snappedMinutes = Math.round(rawMinutes / 15) * 15;

      if (drag.edge === "top") {
        const currentEnd = new Date(drag.endsAtUtc).getTime();
        const nextStart = new Date(new Date(drag.startsAtUtc).getTime() + snappedMinutes * 60 * 1000).getTime();
        if (nextStart < currentEnd - 30 * 60 * 1000) {
          moveCalendarItem({
            itemId: drag.itemId,
            startsAtUtc: new Date(nextStart).toISOString(),
            endsAtUtc: drag.endsAtUtc
          });
        }
      }

      if (drag.edge === "bottom") {
        const currentStart = new Date(drag.startsAtUtc).getTime();
        const nextEnd = new Date(new Date(drag.endsAtUtc).getTime() + snappedMinutes * 60 * 1000).getTime();
        if (nextEnd > currentStart + 30 * 60 * 1000) {
          resizeCalendarItem({
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
  }, [moveCalendarItem, resizeCalendarItem, resizeDrag]);

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

  const rootClasses = framed ? "flex h-full min-h-0 flex-col gap-4 rounded-card border bg-surface p-4 shadow-card" : "flex h-full min-h-0 flex-col gap-4";

  return (
    <div className={cn(rootClasses, className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex h-10 items-center gap-1 rounded-full border border-border bg-surface p-1 shadow-sm">
          <button className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-muted" onClick={() => shiftAnchor("previous")} type="button">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button className="inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold text-text-muted hover:bg-surface-muted" onClick={() => setAnchorDate(todayInTimezone(referenceTimezone))} type="button">
            Today
          </button>
          <button className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-muted" onClick={() => shiftAnchor("next")} type="button">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex h-10 items-center gap-1 rounded-full border border-border bg-surface p-1 shadow-sm">
            {(["month", "week", "day"] as const).map((candidateView) => (
              <button
                className={cn(
                  "inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold capitalize transition-colors",
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
          {filterSlot}
          {controlsSlot}
          {headerSlot}
          {canEdit ? (
            <Button
              onClick={() => {
                if (quickAddUx === "external") {
                  onQuickAddIntent?.(buildDefaultQuickAddDraft(anchorDate));
                  return;
                }
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

      <h2 className="text-base font-semibold text-text">{formatHeading(anchorDate, view)}</h2>

      {view === "month" ? (
        <div className="min-h-0 flex-1 overflow-auto rounded-control border border-border bg-surface">
          <div className="sticky top-0 z-10 grid grid-cols-7 border-b bg-surface">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
              <p className="border-r border-border px-2 py-2 text-left text-xs font-semibold text-text last:border-r-0" key={weekday}>
                {weekday}
              </p>
            ))}
          </div>
          <div className="grid grid-cols-7 bg-surface" onMouseLeave={() => setMonthHoverDayKey(null)}>
            {monthDays.map((day, dayIndex) => {
              const key = dateKey(day);
              const inMonth = day.getMonth() === monthAnchor.getMonth();
              const dayItemList = itemsByDay.get(key) ?? [];
              const showHoverGhost = monthHoverDayKey === key && canEdit && !suppressHoverSlot;

              return (
                <button
                  className={cn(
                    "relative min-h-[96px] border-b border-r border-border p-1.5 text-left transition-colors",
                    dayIndex % 7 === 6 && "border-r-0",
                    inMonth ? "bg-surface" : "bg-surface-muted/40 text-text-muted"
                  )}
                  key={key}
                  onClick={() => focusWeekFromMonth(day)}
                  onMouseEnter={() => {
                    if (!suppressHoverSlot && canEdit) {
                      setMonthHoverDayKey(key);
                    }
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (!dragMoveItemId || !canEdit) {
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

                    moveCalendarItem({
                      itemId: item.id,
                      startsAtUtc: nextStart,
                      endsAtUtc: nextEnd
                    });
                    setDragMoveItemId(null);
                  }}
                  type="button"
                >
                  <p className="absolute left-1.5 top-1.5 text-xs font-semibold text-text">{day.getDate()}</p>
                  <div className="mt-5 overflow-hidden">
                    {showHoverGhost ? (
                      <div className="mb-0 border-t border-dashed border-border/70 bg-surface/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                        Add event
                      </div>
                    ) : null}
                    {dayItemList.slice(0, 2).map((item) => (
                      <div
                        className={cn(
                          "border-t border-border/80 bg-surface px-2 py-1 text-[10px] font-medium text-text first:border-t-0",
                          item.status === "cancelled" && "line-through opacity-60"
                        )}
                        draggable={Boolean(canEdit && (onMoveItem || (hasInteractiveDraft && item.id === DRAFT_ITEM_ID)))}
                        key={item.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          selectCalendarItem(item.id);
                        }}
                        onDragStart={() => setDragMoveItemId(item.id)}
                      >
                        <span className="inline-flex max-w-full items-center gap-1.5">
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              item.entryType === "practice" ? "bg-emerald-400" : item.entryType === "game" ? "bg-sky-400" : "bg-amber-400"
                            )}
                          />
                          <span className="truncate">{item.title}</span>
                        </span>
                        {item.teamChips && item.teamChips.length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {item.teamChips.map((teamChip, index) => (
                              <span
                                className="inline-flex max-w-full items-center border border-border/70 bg-surface-muted/70 px-1 py-0.5 text-[9px] font-semibold text-text"
                                key={`${item.id}-team-chip-month-${index}-${teamChip}`}
                              >
                                <span className="truncate">{teamChip}</span>
                              </span>
                            ))}
                          </div>
                        ) : null}
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
          className={cn(
            "min-h-0 flex-1 overflow-auto rounded-control border bg-surface transition-[transform,opacity] duration-200 ease-out will-change-transform",
            weekEnterZoomState === "preparing" ? "scale-[0.965] opacity-70" : "scale-100 opacity-100"
          )}
          ref={weekScrollRef}
          style={{ height: "100%" }}
        >
          {(() => {
            const weekDays = Array.from({ length: WEEK_VISIBLE_DAYS }, (_, index) => addDays(startOfWeek(anchorDate), index));
            const gridHeight = HOURS.length * WEEK_HOUR_HEIGHT_PX;
            const nowKey = dateKey(currentTime);
            const currentDayIndex = weekDays.findIndex((day) => dateKey(day) === nowKey);
            const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
            const nowTop = (nowMinutes / 60) * WEEK_HOUR_HEIGHT_PX + 1;
            const showNow = currentDayIndex >= 0 && nowTop >= 0 && nowTop <= gridHeight;
            const nowTopWithHeader = nowTop + WEEK_HEADER_HEIGHT_PX;
            const dayWidthPercent = 100 / WEEK_VISIBLE_DAYS;

            return (
              <div className="relative flex min-w-0">
                {showNow ? (
                  <div className="pointer-events-none absolute left-0 right-0 z-40" style={{ top: `${nowTopWithHeader}px` }}>
                    <div className="absolute left-0 right-0 h-[2px]" style={{ backgroundColor: "hsl(var(--accent) / 0.18)" }} />
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

                <div className="min-w-0 flex-1">
                  <div className="sticky top-0 z-10 grid grid-cols-7 border-b bg-surface">
                    {weekDays.map((day) => (
                      <button
                        className="flex items-center justify-between border-r px-2 py-2 text-left text-xs font-semibold text-text hover:bg-surface-muted last:border-r-0"
                        key={dateKey(day)}
                        onClick={() => focusDayFromWeek(day)}
                        style={{ height: "40px" }}
                        type="button"
                      >
                        <span>{day.toLocaleDateString(undefined, { weekday: "short" })}</span>
                        <span
                          className={cn(
                            "inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold",
                            dateKey(day) === nowKey ? "bg-accent text-accent-foreground" : "bg-surface-muted text-text"
                          )}
                        >
                          {day.getDate()}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div
                    className="relative"
                    data-week-grid-body="true"
                    onDoubleClick={(event) => {
                      if (!canEdit || (quickAddUx === "internal" ? !onQuickAdd : !onQuickAddIntent)) {
                        return;
                      }
                      const rect = event.currentTarget.getBoundingClientRect();
                      const x = event.clientX - rect.left;
                      const y = event.clientY - rect.top;
                      const dayIndex = Math.max(0, Math.min(weekDays.length - 1, Math.floor((x / rect.width) * weekDays.length)));
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
                      if (quickAddUx === "external") {
                        onQuickAddIntent?.({
                          title: "New event",
                          startsAtUtc: start.toISOString(),
                          endsAtUtc: end.toISOString()
                        });
                      } else {
                        setQuickAddOpen(true);
                      }
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
                      const dayIndex = Math.max(0, Math.min(weekDays.length - 1, Math.floor((x / rect.width) * weekDays.length)));
                      const minutes = Math.floor((Math.max(0, Math.min(y, gridHeight - 1)) / WEEK_HOUR_HEIGHT_PX) * 60);
                      const snappedStartMinutes = Math.floor(minutes / 30) * 30;
                      setHoverSlot((current) => {
                        if (current && current.dayIndex === dayIndex && current.startMinutes === snappedStartMinutes) {
                          return current;
                        }
                        return { dayIndex, startMinutes: snappedStartMinutes };
                      });
                    }}
                    style={{ height: `${gridHeight}px` }}
                  >
                    <div className="pointer-events-none absolute inset-0">
                      {HOURS.map((hour) => (
                        <div
                          className="absolute left-0 right-0 border-b"
                          key={`h-${hour}`}
                          style={{ top: `${hour * WEEK_HOUR_HEIGHT_PX}px`, height: `${WEEK_HOUR_HEIGHT_PX}px` }}
                        />
                      ))}
                      <div className="absolute inset-y-0 left-0 right-0 grid grid-cols-7">
                        {weekDays.map((day) => (
                          <div className="h-full border-r last:border-r-0" key={`d-${dateKey(day)}`} />
                        ))}
                      </div>
                    </div>

                    {hoverSlot && canEdit && !suppressHoverSlot ? (
                      <div
                        className="pointer-events-none absolute rounded-control border border-dashed border-border/70 bg-surface/70 shadow-sm"
                        style={{
                          top: `${(hoverSlot.startMinutes / 60) * WEEK_HOUR_HEIGHT_PX + 1}px`,
                          left: `calc(${hoverSlot.dayIndex * dayWidthPercent}% + 2px)`,
                          width: `calc(${dayWidthPercent}% - 4px)`,
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
                        const left = `calc(${dayIndex * dayWidthPercent}% + 2px)`;
                        const width = `calc(${dayWidthPercent}% - 4px)`;

                        const showDraftHandles = hasInteractiveDraft && item.id === DRAFT_ITEM_ID;

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
                            {canEdit && (onMoveItem || showDraftHandles) ? (
                              <span
                                className={cn(
                                  "absolute left-1/2 top-0 h-2 w-10 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize rounded-full border border-border/60 bg-surface/95 shadow-sm transition-opacity duration-150 ease-out",
                                  showDraftHandles ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                )}
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
                              <Chip
                                color={item.entryType === "practice" ? "green" : item.entryType === "game" ? "neutral" : "yellow"}
                              >
                                {item.entryType}
                              </Chip>
                            </div>
                            {item.teamChips && item.teamChips.length > 0 ? (
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                {item.teamChips.map((teamChip, index) => (
                                  <Chip className="max-w-full normal-case tracking-normal" color="neutral" key={`${item.id}-team-chip-${index}-${teamChip}`}>
                                    <span className="truncate">{teamChip}</span>
                                  </Chip>
                                ))}
                              </div>
                            ) : null}
                            <p className="truncate text-[10px] text-text-muted">
                              {new Date(renderedItem.startsAtUtc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                            </p>
                            {canEdit && (onResizeItem || showDraftHandles) ? (
                              <span
                                className={cn(
                                  "absolute left-1/2 bottom-0 h-2 w-10 -translate-x-1/2 translate-y-1/2 cursor-ns-resize rounded-full border border-border/60 bg-surface/95 shadow-sm transition-opacity duration-150 ease-out",
                                  showDraftHandles ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                )}
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
        <div
          className={cn(
            "min-h-0 flex-1 overflow-auto rounded-control border bg-surface transition-[transform,opacity] duration-200 ease-out will-change-transform",
            dayEnterZoomState === "preparing" ? "scale-[0.975] opacity-70" : "scale-100 opacity-100"
          )}
          ref={weekScrollRef}
          style={{ height: "100%" }}
        >
          {(() => {
            const day = startOfDay(anchorDate);
            const dayKey = dateKey(day);
            const gridHeight = HOURS.length * WEEK_HOUR_HEIGHT_PX;
            const nowKey = dateKey(currentTime);
            const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
            const nowTop = (nowMinutes / 60) * WEEK_HOUR_HEIGHT_PX + 1;
            const showNow = dayKey === nowKey && nowTop >= 0 && nowTop <= gridHeight;
            const nowTopWithHeader = nowTop + WEEK_HEADER_HEIGHT_PX;
            const dayItemList = displayItems.filter((item) => intersectsDay(item.startsAtUtc, item.endsAtUtc, day));

            return (
              <div className="relative flex min-w-0">
                {showNow ? (
                  <div className="pointer-events-none absolute left-0 right-0 z-40" style={{ top: `${nowTopWithHeader}px` }}>
                    <div className="absolute left-0 right-0 h-[2px]" style={{ backgroundColor: "hsl(var(--accent) / 0.18)" }} />
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
                      <div className="border-b px-2 py-1 text-[11px] font-medium text-text-muted" key={hour} style={{ height: `${WEEK_HOUR_HEIGHT_PX}px` }}>
                        {new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: "numeric" })}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="sticky top-0 z-10 grid grid-cols-1 border-b bg-surface">
                    <button
                      className="flex items-center justify-between px-2 py-2 text-left text-xs font-semibold text-text hover:bg-surface-muted"
                      onClick={() => setAnchorDate(day)}
                      style={{ height: "40px" }}
                      type="button"
                    >
                      <span>{day.toLocaleDateString(undefined, { weekday: "short" })}</span>
                      <span
                        className={cn(
                          "inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold",
                          dayKey === nowKey ? "bg-accent text-accent-foreground" : "bg-surface-muted text-text"
                        )}
                      >
                        {day.getDate()}
                      </span>
                    </button>
                  </div>

                  <div
                    className="relative"
                    data-week-grid-body="true"
                    onDoubleClick={(event) => {
                      if (!canEdit || (quickAddUx === "internal" ? !onQuickAdd : !onQuickAddIntent)) {
                        return;
                      }
                      const rect = event.currentTarget.getBoundingClientRect();
                      const y = event.clientY - rect.top;
                      const minutes = Math.floor((Math.max(0, Math.min(y, gridHeight - 1)) / WEEK_HOUR_HEIGHT_PX) * 60);
                      const snappedStartMinutes = Math.floor(minutes / 30) * 30;
                      const start = new Date(startOfDay(day).getTime() + snappedStartMinutes * 60 * 1000);
                      const end = new Date(start.getTime() + 60 * 60 * 1000);
                      setQuickAddStartsAtUtc(start.toISOString());
                      setQuickAddEndsAtUtc(end.toISOString());
                      setQuickAddTitle("New event");
                      if (quickAddUx === "external") {
                        onQuickAddIntent?.({ title: "New event", startsAtUtc: start.toISOString(), endsAtUtc: end.toISOString() });
                      } else {
                        setQuickAddOpen(true);
                      }
                    }}
                    onMouseLeave={() => setHoverSlot(null)}
                    onMouseMove={(event) => {
                      if (!canEdit || suppressHoverSlot) {
                        return;
                      }
                      const rect = event.currentTarget.getBoundingClientRect();
                      const y = event.clientY - rect.top;
                      const minutes = Math.floor((Math.max(0, Math.min(y, gridHeight - 1)) / WEEK_HOUR_HEIGHT_PX) * 60);
                      const snappedStartMinutes = Math.floor(minutes / 30) * 30;
                      setHoverSlot((current) => {
                        if (current && current.dayIndex === 0 && current.startMinutes === snappedStartMinutes) {
                          return current;
                        }
                        return { dayIndex: 0, startMinutes: snappedStartMinutes };
                      });
                    }}
                    style={{ height: `${gridHeight}px` }}
                  >
                    <div className="pointer-events-none absolute inset-0">
                      {HOURS.map((hour) => (
                        <div className="absolute left-0 right-0 border-b" key={`day-h-${hour}`} style={{ top: `${hour * WEEK_HOUR_HEIGHT_PX}px`, height: `${WEEK_HOUR_HEIGHT_PX}px` }} />
                      ))}
                    </div>

                    {hoverSlot && canEdit && !suppressHoverSlot ? (
                      <div
                        className="pointer-events-none absolute rounded-control border border-dashed border-border/70 bg-surface/70 shadow-sm"
                        style={{ top: `${(hoverSlot.startMinutes / 60) * WEEK_HOUR_HEIGHT_PX + 1}px`, left: "2px", width: "calc(100% - 4px)", height: `${WEEK_HOUR_HEIGHT_PX - 2}px` }}
                      >
                        <div className="flex h-full items-center justify-center text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                          Add event
                        </div>
                      </div>
                    ) : null}

                    {dayItemList.map((item) => {
                      const renderedItem =
                        resizePreview && resizePreview.itemId === item.id
                          ? { ...item, startsAtUtc: resizePreview.startsAtUtc, endsAtUtc: resizePreview.endsAtUtc }
                          : item;
                      const dayStart = startOfDay(day);
                      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
                      const itemStart = new Date(renderedItem.startsAtUtc);
                      const itemEnd = new Date(renderedItem.endsAtUtc);
                      const clampedStartMs = Math.max(itemStart.getTime(), dayStart.getTime());
                      const clampedEndMs = Math.min(itemEnd.getTime(), dayEnd.getTime());
                      const startMinutes = (clampedStartMs - dayStart.getTime()) / (60 * 1000);
                      const endMinutes = (clampedEndMs - dayStart.getTime()) / (60 * 1000);
                      const top = (startMinutes / 60) * WEEK_HOUR_HEIGHT_PX + 1;
                      const height = Math.max(((endMinutes - startMinutes) / 60) * WEEK_HOUR_HEIGHT_PX - 2, 18);
                      const showDraftHandles = hasInteractiveDraft && item.id === DRAFT_ITEM_ID;

                      return (
                        <button
                          className={cn(
                            "group absolute overflow-hidden rounded-control border border-border/70 bg-surface/95 px-2 py-1 text-left text-[11px] text-text shadow-sm transition-[left,top,height,box-shadow,transform] duration-150 ease-out motion-reduce:transition-none hover:shadow-floating active:scale-[0.98]",
                            item.status === "cancelled" && "line-through opacity-60"
                          )}
                          key={`day-grid-${item.id}`}
                          onClick={() => selectCalendarItem(item.id)}
                          onDoubleClick={(event) => event.stopPropagation()}
                          style={{ top: `${top}px`, left: "2px", width: "calc(100% - 4px)", height: `${height}px` }}
                          type="button"
                        >
                          {canEdit && (onMoveItem || showDraftHandles) ? (
                            <span
                              className={cn(
                                "absolute left-1/2 top-0 h-2 w-10 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize rounded-full border border-border/60 bg-surface/95 shadow-sm transition-opacity duration-150 ease-out",
                                showDraftHandles ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                              )}
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
                            <Chip
                              color={item.entryType === "practice" ? "green" : item.entryType === "game" ? "neutral" : "yellow"}
                            >
                              {item.entryType}
                            </Chip>
                          </div>
                          {item.teamChips && item.teamChips.length > 0 ? (
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              {item.teamChips.map((teamChip, index) => (
                                <Chip className="max-w-full normal-case tracking-normal" color="neutral" key={`${item.id}-team-chip-day-grid-${index}-${teamChip}`}>
                                  <span className="truncate">{teamChip}</span>
                                </Chip>
                              ))}
                            </div>
                          ) : null}
                          <p className="truncate text-[10px] text-text-muted">
                            {new Date(renderedItem.startsAtUtc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          </p>
                          {canEdit && (onResizeItem || showDraftHandles) ? (
                            <span
                              className={cn(
                                "absolute left-1/2 bottom-0 h-2 w-10 -translate-x-1/2 translate-y-1/2 cursor-ns-resize rounded-full border border-border/60 bg-surface/95 shadow-sm transition-opacity duration-150 ease-out",
                                showDraftHandles ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                              )}
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
                    })}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      ) : null}

      {resizeSnap ? (
        <Chip
          className="pointer-events-none fixed z-50 shadow-sm"
          color="neutral"
          style={{ left: `${resizeSnap.x}px`, top: `${resizeSnap.y}px` }}
        >
          {resizeSnap.label}
        </Chip>
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
        open={quickAddUx === "internal" && quickAddOpen && canEdit}
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
