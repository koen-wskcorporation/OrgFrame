"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { ProgramOccurrence } from "@/modules/programs/types";

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const selectionModeItems = [
  { value: "single", label: "Single" },
  { value: "multiple", label: "Multiple" },
  { value: "range", label: "Range" }
] as const;

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(year, (month || 1) - 1, day || 1);
}

function getMonthDays(monthAnchor: Date) {
  const year = monthAnchor.getFullYear();
  const month = monthAnchor.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const totalDays = lastDay.getDate();
  const leadingEmpty = firstDay.getDay();
  const trailingEmpty = (7 - ((leadingEmpty + totalDays) % 7)) % 7;
  const cells: Array<{ key: string; inMonth: boolean; date: Date }> = [];

  for (let i = leadingEmpty; i > 0; i -= 1) {
    const date = new Date(year, month, 1 - i);
    cells.push({ key: toDateKey(date), inMonth: false, date });
  }
  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(year, month, day);
    cells.push({ key: toDateKey(date), inMonth: true, date });
  }
  for (let i = 1; i <= trailingEmpty; i += 1) {
    const date = new Date(year, month + 1, i);
    cells.push({ key: toDateKey(date), inMonth: false, date });
  }

  return cells;
}

function rangeKeys(a: string, b: string): Set<string> {
  const start = parseDateKey(a);
  const end = parseDateKey(b);
  const min = start.getTime() <= end.getTime() ? start : end;
  const max = start.getTime() <= end.getTime() ? end : start;
  const keys = new Set<string>();
  const cursor = new Date(min.getTime());
  while (cursor.getTime() <= max.getTime()) {
    keys.add(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

type ScheduleCalendarProps = {
  monthAnchor: Date;
  selectedDates: Set<string>;
  selectionMode: CalendarSelectionMode;
  occurrences: ProgramOccurrence[];
  onMonthChange: (next: Date) => void;
  onSelectionModeChange: (next: CalendarSelectionMode) => void;
  onSelectDate: (dateKey: string) => void;
  onSelectRange: (startDateKey: string, endDateKey: string) => void;
  onEditOccurrence: (occurrenceId: string) => void;
};

export type CalendarSelectionMode = "single" | "multiple" | "range";

export function ScheduleCalendar({
  monthAnchor,
  selectedDates,
  selectionMode,
  occurrences,
  onMonthChange,
  onSelectionModeChange,
  onSelectDate,
  onSelectRange,
  onEditOccurrence
}: ScheduleCalendarProps) {
  const [dragStartKey, setDragStartKey] = useState<string | null>(null);
  const [dragHoverKey, setDragHoverKey] = useState<string | null>(null);

  const cells = useMemo(() => getMonthDays(monthAnchor), [monthAnchor]);
  const occurrenceByDate = useMemo(() => {
    const map = new Map<string, ProgramOccurrence[]>();
    for (const occurrence of occurrences) {
      const current = map.get(occurrence.localDate) ?? [];
      current.push(occurrence);
      map.set(occurrence.localDate, current);
    }
    return map;
  }, [occurrences]);
  const dragRange = dragStartKey && dragHoverKey ? rangeKeys(dragStartKey, dragHoverKey) : null;

  return (
    <div className="space-y-3 rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <button
          aria-label="Previous month"
          className="rounded-control border border-border bg-surface px-2 py-1 text-text-muted hover:bg-surface-muted hover:text-text"
          onClick={() => onMonthChange(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() - 1, 1))}
          type="button"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold text-text">
          {monthAnchor.toLocaleString(undefined, {
            month: "long",
            year: "numeric"
          })}
        </p>
        <button
          aria-label="Next month"
          className="rounded-control border border-border bg-surface px-2 py-1 text-text-muted hover:bg-surface-muted hover:text-text"
          onClick={() => onMonthChange(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1))}
          type="button"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="inline-flex items-center gap-2 rounded-control border border-border bg-surface p-1">
        <span className="pl-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Selection type</span>
        {selectionModeItems.map((item) => {
          const active = selectionMode === item.value;
          return (
            <button
              className={cn(
                "rounded-control px-2 py-1 text-xs font-semibold transition-colors",
                active ? "bg-surface-muted text-text" : "text-text-muted hover:bg-surface-muted hover:text-text"
              )}
              key={item.value}
              onClick={() => onSelectionModeChange(item.value)}
              type="button"
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-text-muted">
        {weekdayLabels.map((label) => (
          <p key={label}>{label}</p>
        ))}
      </div>

      <div
        className="grid grid-cols-7 gap-1"
        onMouseLeave={() => {
          setDragHoverKey(null);
        }}
      >
        {cells.map((cell) => {
          const dayOccurrences = occurrenceByDate.get(cell.key) ?? [];
          const selected = selectedDates.has(cell.key) || (dragRange ? dragRange.has(cell.key) : false);
          const badgeText =
            dayOccurrences.length === 0
              ? null
              : dayOccurrences.length === 1
                ? dayOccurrences[0].localStartTime
                  ? `${dayOccurrences[0].localStartTime}-${dayOccurrences[0].localEndTime ?? ""}`.replace(/-$/, "")
                  : "1 session"
                : `${dayOccurrences.length} sessions`;

          return (
            <button
              className={cn(
                "min-h-[74px] rounded-control border p-1.5 text-left transition-colors",
                cell.inMonth ? "border-border bg-surface" : "border-transparent bg-surface-muted/40 text-text-muted",
                selected && "border-accent bg-accent/10",
                dayOccurrences.length > 0 && "shadow-sm"
              )}
              key={cell.key}
              onClick={() => onSelectDate(cell.key)}
              onDoubleClick={() => {
                if (dayOccurrences[0]) {
                  onEditOccurrence(dayOccurrences[0].id);
                }
              }}
              onMouseDown={(event) => {
                if (event.button !== 0) {
                  return;
                }
                setDragStartKey(cell.key);
                setDragHoverKey(cell.key);
              }}
              onMouseEnter={() => {
                if (dragStartKey) {
                  setDragHoverKey(cell.key);
                }
              }}
              onMouseUp={() => {
                if (dragStartKey && dragHoverKey && dragStartKey !== dragHoverKey) {
                  onSelectRange(dragStartKey, dragHoverKey);
                }
                setDragStartKey(null);
                setDragHoverKey(null);
              }}
              type="button"
            >
              <p className="text-xs font-semibold text-text">{cell.date.getDate()}</p>
              {badgeText ? (
                <span className="mt-1 inline-block max-w-full truncate rounded-full border border-border bg-surface-muted px-1.5 py-0.5 text-[10px] text-text-muted">
                  {badgeText}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
