"use client";

import * as React from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Repeat, X } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";
import { Popover } from "./popover";
import { cn } from "./utils";

// ---------------------------------------------------------------------------
// Public value shape
// ---------------------------------------------------------------------------

export type DateTimeRecurrenceIntervalUnit = "day" | "week" | "month";
export type DateTimeRecurrenceEndMode = "never" | "until_date" | "after_occurrences";

/** Single source of truth for the picker. Dates are local ISO `YYYY-MM-DD`,
 *  times are local 24h `HH:MM`. Callers convert to UTC at the boundary using
 *  the supplied `timezone`. */
export type DateTimeRecurrenceValue = {
  startDate: string;
  endDate: string;
  includeTime: boolean;
  startTime: string;
  endTime: string;
  timezone: string;
  recurrence: {
    enabled: boolean;
    intervalCount: number;
    intervalUnit: DateTimeRecurrenceIntervalUnit;
    byWeekday: number[];
    byMonthday: number[];
    endMode: DateTimeRecurrenceEndMode;
    untilDate: string;
    maxOccurrences: number | null;
  };
};

export type DateTimeRecurrencePickerProps = {
  value: DateTimeRecurrenceValue;
  onChange: (next: DateTimeRecurrenceValue) => void;
  disabled?: boolean;
  className?: string;
  /** Optional pre-selected preset id to highlight when matching. */
  presetHint?: string;
};

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const WEEKDAY_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

function pad2(value: number) {
  return value < 10 ? `0${value}` : `${value}`;
}

function isIsoDate(value: string): value is string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseIsoDate(value: string): Date | null {
  if (!isIsoDate(value)) return null;
  const [y, m, d] = value.split("-").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const next = new Date(y!, (m ?? 1) - 1, d ?? 1);
  if (next.getFullYear() !== y || next.getMonth() !== (m ?? 1) - 1 || next.getDate() !== d) return null;
  return next;
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, count: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function compareIsoDate(a: string, b: string) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function todayIsoDate() {
  return toIsoDate(new Date());
}

function normalizeTime(value: string, fallback = "09:00") {
  if (!value) return fallback;
  if (!/^\d{2}:\d{2}$/.test(value)) return fallback;
  const [h, m] = value.split(":").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m) || h! < 0 || h! > 23 || m! < 0 || m! > 59) return fallback;
  return `${pad2(h!)}:${pad2(m!)}`;
}

function formatDateLabel(value: string): string {
  const parsed = parseIsoDate(value);
  if (!parsed) return "";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatTimeLabel(value: string): string {
  const normalized = normalizeTime(value);
  const [hourRaw, minuteRaw] = normalized.split(":");
  const hour24 = Number.parseInt(hourRaw ?? "0", 10);
  const minute = Number.parseInt(minuteRaw ?? "0", 10);
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${pad2(minute)} ${meridiem}`;
}

function ordinal(n: number) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

// ---------------------------------------------------------------------------
// Typed-text date parsing — accepts: "today", "tomorrow", "yesterday",
// "next monday", "tue", "Dec 25", "12/25/2026", "2026-12-25".
// ---------------------------------------------------------------------------

const WEEKDAY_KEYWORDS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6
};

const MONTH_KEYWORDS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11
};

export function parseTypedDate(input: string, today = new Date()): string | null {
  const raw = input.trim().toLowerCase();
  if (!raw) return null;

  if (raw === "today" || raw === "now") return toIsoDate(today);
  if (raw === "tomorrow" || raw === "tmrw" || raw === "tmw") return toIsoDate(addDays(today, 1));
  if (raw === "yesterday") return toIsoDate(addDays(today, -1));

  // "next monday", "this friday" — pick the next occurrence (this/next behave the same).
  const weekdayMatch = raw.match(/^(?:next|this|on)\s+([a-z]+)$/);
  if (weekdayMatch) {
    const wd = WEEKDAY_KEYWORDS[weekdayMatch[1]!];
    if (wd !== undefined) {
      const diff = (wd - today.getDay() + 7) % 7 || 7;
      return toIsoDate(addDays(today, diff));
    }
  }

  // Bare weekday name → next occurrence (today if it's today, else upcoming).
  if (WEEKDAY_KEYWORDS[raw] !== undefined) {
    const wd = WEEKDAY_KEYWORDS[raw]!;
    const diff = (wd - today.getDay() + 7) % 7;
    return toIsoDate(addDays(today, diff));
  }

  // YYYY-MM-DD
  if (isIsoDate(raw)) {
    return parseIsoDate(raw) ? raw : null;
  }

  // MM/DD or MM/DD/YYYY (US conventions, since the rest of the picker uses US-style chrome).
  const slashMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if (slashMatch) {
    const month = Number.parseInt(slashMatch[1]!, 10);
    const day = Number.parseInt(slashMatch[2]!, 10);
    const yearRaw = slashMatch[3];
    let year = today.getFullYear();
    if (yearRaw) {
      year = Number.parseInt(yearRaw, 10);
      if (year < 100) year += 2000;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const candidate = new Date(year, month - 1, day);
      if (candidate.getMonth() === month - 1 && candidate.getDate() === day) {
        return toIsoDate(candidate);
      }
    }
  }

  // "Dec 25", "December 25, 2026", "25 Dec"
  const wordsMatch = raw.match(/^([a-z]+)\s+(\d{1,2})(?:,?\s+(\d{2,4}))?$/);
  const wordsReverseMatch = raw.match(/^(\d{1,2})\s+([a-z]+)(?:,?\s+(\d{2,4}))?$/);
  const monthMatch = wordsMatch ?? wordsReverseMatch;
  if (monthMatch) {
    const monthKey = wordsMatch ? wordsMatch[1]! : wordsReverseMatch![2]!;
    const dayStr = wordsMatch ? wordsMatch[2]! : wordsReverseMatch![1]!;
    const yearStr = monthMatch[3];
    const monthIndex = MONTH_KEYWORDS[monthKey];
    if (monthIndex !== undefined) {
      const day = Number.parseInt(dayStr, 10);
      let year = today.getFullYear();
      if (yearStr) {
        year = Number.parseInt(yearStr, 10);
        if (year < 100) year += 2000;
      }
      const candidate = new Date(year, monthIndex, day);
      if (candidate.getMonth() === monthIndex && candidate.getDate() === day) {
        return toIsoDate(candidate);
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Recurrence summary + presets
// ---------------------------------------------------------------------------

type RecurrencePresetId = "none" | "daily" | "weekly" | "monthly" | "weekdays" | "custom";

type RecurrencePreset = {
  id: RecurrencePresetId;
  label: (value: DateTimeRecurrenceValue) => string;
  apply: (value: DateTimeRecurrenceValue) => DateTimeRecurrenceValue;
  matches: (value: DateTimeRecurrenceValue) => boolean;
};

const WEEKDAYS_MON_FRI = [1, 2, 3, 4, 5];

function presetWeekdayFromStart(value: DateTimeRecurrenceValue): number {
  const parsed = parseIsoDate(value.startDate);
  return parsed ? parsed.getDay() : new Date().getDay();
}

function presetMonthdayFromStart(value: DateTimeRecurrenceValue): number {
  const parsed = parseIsoDate(value.startDate);
  return parsed ? parsed.getDate() : 1;
}

const RECURRENCE_PRESETS: RecurrencePreset[] = [
  {
    id: "none",
    label: () => "Does not repeat",
    apply: (value) => ({ ...value, recurrence: { ...value.recurrence, enabled: false } }),
    matches: (value) => !value.recurrence.enabled
  },
  {
    id: "daily",
    label: () => "Daily",
    apply: (value) => ({
      ...value,
      recurrence: {
        ...value.recurrence,
        enabled: true,
        intervalUnit: "day",
        intervalCount: 1,
        byWeekday: [],
        byMonthday: []
      }
    }),
    matches: (value) =>
      value.recurrence.enabled &&
      value.recurrence.intervalUnit === "day" &&
      value.recurrence.intervalCount === 1 &&
      value.recurrence.byWeekday.length === 0
  },
  {
    id: "weekly",
    label: (value) => `Weekly on ${WEEKDAY_LONG[presetWeekdayFromStart(value)]}`,
    apply: (value) => {
      const weekday = presetWeekdayFromStart(value);
      return {
        ...value,
        recurrence: {
          ...value.recurrence,
          enabled: true,
          intervalUnit: "week",
          intervalCount: 1,
          byWeekday: [weekday],
          byMonthday: []
        }
      };
    },
    matches: (value) =>
      value.recurrence.enabled &&
      value.recurrence.intervalUnit === "week" &&
      value.recurrence.intervalCount === 1 &&
      value.recurrence.byWeekday.length === 1 &&
      value.recurrence.byWeekday[0] === presetWeekdayFromStart(value)
  },
  {
    id: "monthly",
    label: (value) => `Monthly on the ${ordinal(presetMonthdayFromStart(value))}`,
    apply: (value) => ({
      ...value,
      recurrence: {
        ...value.recurrence,
        enabled: true,
        intervalUnit: "month",
        intervalCount: 1,
        byWeekday: [],
        byMonthday: [presetMonthdayFromStart(value)]
      }
    }),
    matches: (value) =>
      value.recurrence.enabled &&
      value.recurrence.intervalUnit === "month" &&
      value.recurrence.intervalCount === 1 &&
      value.recurrence.byMonthday.length === 1 &&
      value.recurrence.byMonthday[0] === presetMonthdayFromStart(value)
  },
  {
    id: "weekdays",
    label: () => "Every weekday (Mon–Fri)",
    apply: (value) => ({
      ...value,
      recurrence: {
        ...value.recurrence,
        enabled: true,
        intervalUnit: "week",
        intervalCount: 1,
        byWeekday: [...WEEKDAYS_MON_FRI],
        byMonthday: []
      }
    }),
    matches: (value) => {
      if (!value.recurrence.enabled) return false;
      if (value.recurrence.intervalUnit !== "week" || value.recurrence.intervalCount !== 1) return false;
      const days = [...value.recurrence.byWeekday].sort();
      const target = [...WEEKDAYS_MON_FRI].sort();
      if (days.length !== target.length) return false;
      return days.every((value, index) => value === target[index]);
    }
  },
  {
    id: "custom",
    label: () => "Custom…",
    apply: (value) => ({
      ...value,
      recurrence: {
        ...value.recurrence,
        enabled: true
      }
    }),
    matches: () => false
  }
];

function resolveActivePreset(value: DateTimeRecurrenceValue): RecurrencePresetId {
  for (const preset of RECURRENCE_PRESETS) {
    if (preset.id === "custom") continue;
    if (preset.matches(value)) return preset.id;
  }
  return value.recurrence.enabled ? "custom" : "none";
}

function describeRecurrence(value: DateTimeRecurrenceValue): string {
  const r = value.recurrence;
  if (!r.enabled) return "Does not repeat";

  const unitLabel = (count: number) => {
    const noun = r.intervalUnit === "day" ? "day" : r.intervalUnit === "week" ? "week" : "month";
    return count === 1 ? noun : `${noun}s`;
  };

  const cadence = r.intervalCount === 1 ? `Every ${unitLabel(1)}` : `Every ${r.intervalCount} ${unitLabel(r.intervalCount)}`;

  let detail = "";
  if (r.intervalUnit === "week" && r.byWeekday.length > 0) {
    const days = [...r.byWeekday].sort().map((day) => WEEKDAY_LONG[day]!.slice(0, 3));
    detail = ` on ${days.join(", ")}`;
  } else if (r.intervalUnit === "month" && r.byMonthday.length > 0) {
    const sorted = [...r.byMonthday].sort((a, b) => a - b);
    detail = ` on the ${sorted.map(ordinal).join(", ")}`;
  }

  let ending = "";
  if (r.endMode === "until_date" && r.untilDate) ending = `, until ${formatDateLabel(r.untilDate)}`;
  else if (r.endMode === "after_occurrences" && r.maxOccurrences) ending = `, ${r.maxOccurrences} time${r.maxOccurrences === 1 ? "" : "s"}`;

  return `${cadence}${detail}${ending}`;
}

function describeSummary(value: DateTimeRecurrenceValue): string {
  const start = formatDateLabel(value.startDate) || "Pick a date";
  const sameDay = value.endDate && value.endDate !== value.startDate ? false : true;
  const datePart = sameDay
    ? start
    : `${start} → ${formatDateLabel(value.endDate)}`;

  if (!value.includeTime) {
    return value.recurrence.enabled ? `${datePart} · ${describeRecurrence(value)}` : datePart;
  }

  const timePart = sameDay
    ? `${formatTimeLabel(value.startTime)} – ${formatTimeLabel(value.endTime)}`
    : `${formatTimeLabel(value.startTime)} → ${formatTimeLabel(value.endTime)}`;
  const base = `${datePart}, ${timePart}`;
  return value.recurrence.enabled ? `${base} · ${describeRecurrence(value)}` : base;
}

// ---------------------------------------------------------------------------
// Calendar grid (month) — extracted so we can reuse it for the start picker
// and for the "ends on date" sub-picker.
// ---------------------------------------------------------------------------

type CalendarGridProps = {
  selectedStart: string;
  selectedEnd?: string;
  visibleMonth: Date;
  onVisibleMonthChange: (next: Date) => void;
  onPick: (iso: string) => void;
  highlightRange?: boolean;
};

function CalendarGrid({
  selectedStart,
  selectedEnd,
  visibleMonth,
  onVisibleMonthChange,
  onPick,
  highlightRange = false
}: CalendarGridProps) {
  const monthStart = startOfMonth(visibleMonth);
  const year = monthStart.getFullYear();
  const monthIndex = monthStart.getMonth();
  const firstWeekday = monthStart.getDay();

  const days = React.useMemo(
    () => Array.from({ length: 42 }, (_, index) => new Date(year, monthIndex, index - firstWeekday + 1)),
    [year, monthIndex, firstWeekday]
  );

  const todayIso = todayIsoDate();
  const startIso = isIsoDate(selectedStart) ? selectedStart : null;
  const endIso = selectedEnd && isIsoDate(selectedEnd) ? selectedEnd : null;
  const inRange = highlightRange && startIso && endIso && compareIsoDate(startIso, endIso) <= 0;

  function shiftMonth(delta: number) {
    onVisibleMonthChange(new Date(year, monthIndex + delta, 1));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-text">{MONTH_LONG[monthIndex]} {year}</p>
        <div className="flex items-center gap-1">
          <Button iconOnly aria-label="Previous month" onClick={() => shiftMonth(-1)} type="button">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button iconOnly aria-label="Next month" onClick={() => shiftMonth(1)} type="button">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        {WEEKDAY_SHORT.map((label, index) => (
          <span className="py-1" key={`${label}-${index}`}>
            {label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {days.map((day) => {
          const dayIso = toIsoDate(day);
          const isOutside = day.getMonth() !== monthIndex;
          const isStart = startIso === dayIso;
          const isEnd = endIso === dayIso;
          const isBetween = Boolean(
            inRange && startIso && endIso && compareIsoDate(dayIso, startIso) > 0 && compareIsoDate(dayIso, endIso) < 0
          );
          const isToday = dayIso === todayIso;

          return (
            <button
              aria-label={day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              aria-pressed={isStart || isEnd}
              className={cn(
                "relative mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs transition-colors",
                isOutside ? "text-text-muted/55" : "text-text",
                isBetween ? "bg-accent/15 text-text" : "",
                isStart || isEnd
                  ? "bg-accent text-accent-foreground shadow-sm"
                  : isOutside
                    ? "hover:bg-surface-muted/60"
                    : "hover:bg-surface-muted",
                isToday && !isStart && !isEnd ? "ring-1 ring-accent/60" : ""
              )}
              key={dayIso}
              onClick={() => onPick(dayIso)}
              type="button"
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Time field — labeled text input with H:M validation.
// ---------------------------------------------------------------------------

function TimeField({
  label,
  value,
  onChange,
  disabled
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex-1 space-y-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
      <span>{label}</span>
      <Input
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        type="time"
        value={normalizeTime(value)}
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Recurrence custom panel
// ---------------------------------------------------------------------------

function RecurrenceCustomPanel({
  value,
  onChange
}: {
  value: DateTimeRecurrenceValue;
  onChange: (next: DateTimeRecurrenceValue) => void;
}) {
  const r = value.recurrence;
  const intervalNoun = r.intervalUnit === "day" ? "day" : r.intervalUnit === "week" ? "week" : "month";
  const intervalLabel = r.intervalCount === 1 ? intervalNoun : `${intervalNoun}s`;

  function update(patch: Partial<DateTimeRecurrenceValue["recurrence"]>) {
    onChange({ ...value, recurrence: { ...r, ...patch, enabled: true } });
  }

  return (
    <div className="space-y-3 rounded-control border bg-surface-muted/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-text-muted">Repeat every</p>
        <Input
          className="w-16"
          min={1}
          onChange={(event) => {
            const next = Number.parseInt(event.target.value, 10);
            update({ intervalCount: Number.isFinite(next) && next > 0 ? next : 1 });
          }}
          type="number"
          value={r.intervalCount}
        />
        <div className="inline-flex overflow-hidden rounded-control border">
          {(["day", "week", "month"] as DateTimeRecurrenceIntervalUnit[]).map((unit) => (
            <button
              className={cn(
                "px-2 py-1 text-xs font-semibold transition-colors",
                r.intervalUnit === unit ? "bg-accent text-accent-foreground" : "bg-surface text-text-muted hover:text-text"
              )}
              key={unit}
              onClick={() => update({ intervalUnit: unit })}
              type="button"
            >
              {unit}
            </button>
          ))}
        </div>
        <span className="text-xs text-text-muted">{intervalLabel}</span>
      </div>

      {r.intervalUnit === "week" ? (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Repeat on</p>
          <div className="flex flex-wrap gap-1">
            {WEEKDAY_SHORT.map((label, index) => {
              const active = r.byWeekday.includes(index);
              return (
                <button
                  aria-pressed={active}
                  className={cn(
                    "h-7 w-7 rounded-full border text-xs font-semibold transition-colors",
                    active
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border bg-surface text-text-muted hover:text-text"
                  )}
                  key={`${label}-${index}`}
                  onClick={() => {
                    const has = r.byWeekday.includes(index);
                    const next = has ? r.byWeekday.filter((day) => day !== index) : [...r.byWeekday, index].sort();
                    update({ byWeekday: next.length > 0 ? next : [index] });
                  }}
                  type="button"
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {r.intervalUnit === "month" ? (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Days of month</p>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => {
              const active = r.byMonthday.includes(day);
              return (
                <button
                  aria-pressed={active}
                  className={cn(
                    "h-7 rounded-control border text-xs font-medium transition-colors",
                    active
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border bg-surface text-text-muted hover:text-text"
                  )}
                  key={day}
                  onClick={() => {
                    const has = r.byMonthday.includes(day);
                    const next = has
                      ? r.byMonthday.filter((value) => value !== day)
                      : [...r.byMonthday, day].sort((a, b) => a - b);
                    update({ byMonthday: next });
                  }}
                  type="button"
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Ends</p>
        <div className="space-y-1.5">
          {(["never", "until_date", "after_occurrences"] as DateTimeRecurrenceEndMode[]).map((mode) => {
            const active = r.endMode === mode;
            return (
              <label className="flex items-center gap-2 text-sm" key={mode}>
                <input
                  checked={active}
                  className="accent-accent"
                  name="recurrence-end-mode"
                  onChange={() => update({ endMode: mode })}
                  type="radio"
                />
                {mode === "never" ? <span>Never</span> : null}
                {mode === "until_date" ? (
                  <span className="flex flex-wrap items-center gap-2">
                    On
                    <Input
                      className="h-8 w-[150px]"
                      disabled={!active}
                      onChange={(event) => update({ untilDate: event.target.value })}
                      type="date"
                      value={r.untilDate || value.startDate}
                    />
                  </span>
                ) : null}
                {mode === "after_occurrences" ? (
                  <span className="flex flex-wrap items-center gap-2">
                    After
                    <Input
                      className="h-8 w-20"
                      disabled={!active}
                      min={1}
                      onChange={(event) => {
                        const next = Number.parseInt(event.target.value, 10);
                        update({ maxOccurrences: Number.isFinite(next) && next > 0 ? next : 1 });
                      }}
                      type="number"
                      value={r.maxOccurrences ?? 1}
                    />
                    occurrence{(r.maxOccurrences ?? 1) === 1 ? "" : "s"}
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type Tab = "date" | "repeat";

export function DateTimeRecurrencePicker({
  value,
  onChange,
  disabled,
  className
}: DateTimeRecurrencePickerProps) {
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<Tab>("date");
  const [visibleMonth, setVisibleMonth] = React.useState<Date>(() =>
    startOfMonth(parseIsoDate(value.startDate) ?? new Date())
  );
  const [startInputDraft, setStartInputDraft] = React.useState<string>(value.startDate);
  const [endInputDraft, setEndInputDraft] = React.useState<string>(value.endDate || value.startDate);

  React.useEffect(() => {
    if (!open) return;
    const parsed = parseIsoDate(value.startDate);
    if (parsed) setVisibleMonth(startOfMonth(parsed));
    setStartInputDraft(value.startDate);
    setEndInputDraft(value.endDate || value.startDate);
    setTab("date");
  }, [open, value.startDate, value.endDate]);

  const activePresetId = resolveActivePreset(value);
  const summary = describeSummary(value);
  const summaryClass = value.startDate ? "text-text" : "text-text-muted";

  function commit(next: DateTimeRecurrenceValue) {
    onChange(next);
  }

  function setStartDate(nextIso: string) {
    const startsBeforeEnd = compareIsoDate(nextIso, value.endDate) <= 0;
    const nextEnd = startsBeforeEnd ? value.endDate : nextIso;
    commit({ ...value, startDate: nextIso, endDate: nextEnd });
    setStartInputDraft(nextIso);
    if (!startsBeforeEnd) setEndInputDraft(nextIso);
  }

  function setEndDate(nextIso: string) {
    const safe = compareIsoDate(nextIso, value.startDate) < 0 ? value.startDate : nextIso;
    commit({ ...value, endDate: safe });
    setEndInputDraft(safe);
  }

  function setIncludeTime(nextEnabled: boolean) {
    if (nextEnabled === value.includeTime) return;
    commit({
      ...value,
      includeTime: nextEnabled,
      startTime: nextEnabled ? normalizeTime(value.startTime, "09:00") : value.startTime,
      endTime: nextEnabled ? normalizeTime(value.endTime, "10:00") : value.endTime
    });
  }

  function clear() {
    commit({
      ...value,
      startDate: "",
      endDate: "",
      recurrence: { ...value.recurrence, enabled: false }
    });
    setStartInputDraft("");
    setEndInputDraft("");
  }

  function handleTypedStartChange(input: string) {
    setStartInputDraft(input);
    const iso = parseTypedDate(input);
    if (iso) setStartDate(iso);
  }

  function handleTypedEndChange(input: string) {
    setEndInputDraft(input);
    const iso = parseTypedDate(input);
    if (iso) setEndDate(iso);
  }

  function applyPreset(id: RecurrencePresetId) {
    const preset = RECURRENCE_PRESETS.find((entry) => entry.id === id);
    if (!preset) return;
    if (id === "custom") {
      commit(preset.apply(value));
      return;
    }
    commit(preset.apply(value));
  }

  const trigger = (
    <button
      aria-expanded={open}
      aria-haspopup="dialog"
      className={cn(
        "flex h-10 w-full items-center gap-2 rounded-control border border-border bg-surface px-3 text-left text-sm transition-colors",
        "hover:border-border/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-canvas",
        disabled ? "cursor-not-allowed opacity-55" : "",
        className
      )}
      disabled={disabled}
      onClick={() => setOpen((current) => !current)}
      ref={triggerRef}
      type="button"
    >
      <CalendarIcon className="h-4 w-4 shrink-0 text-text-muted" />
      <span className={cn("min-w-0 flex-1 truncate", summaryClass)}>{summary}</span>
      {value.recurrence.enabled ? <Repeat className="h-3.5 w-3.5 shrink-0 text-accent" /> : null}
    </button>
  );

  return (
    <>
      {trigger}
      <Popover anchorRef={triggerRef} onClose={() => setOpen(false)} open={open} placement="bottom-start">
        <div className="w-[22rem] rounded-card border bg-surface p-3 shadow-floating">
          <div className="mb-3 flex items-center gap-1">
            <button
              aria-pressed={tab === "date"}
              className={cn(
                "flex-1 rounded-control px-2 py-1.5 text-xs font-semibold transition-colors",
                tab === "date" ? "bg-surface-muted text-text" : "text-text-muted hover:text-text"
              )}
              onClick={() => setTab("date")}
              type="button"
            >
              Date
            </button>
            <button
              aria-pressed={tab === "repeat"}
              className={cn(
                "flex-1 rounded-control px-2 py-1.5 text-xs font-semibold transition-colors",
                tab === "repeat" ? "bg-surface-muted text-text" : "text-text-muted hover:text-text"
              )}
              onClick={() => setTab("repeat")}
              type="button"
            >
              Repeat
              {value.recurrence.enabled ? (
                <span className="ml-1 inline-flex h-1.5 w-1.5 rounded-full bg-accent align-middle" />
              ) : null}
            </button>
            <Button
              iconOnly
              aria-label="Clear date"
              disabled={!value.startDate}
              onClick={clear}
              type="button"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {tab === "date" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  <span>Start</span>
                  <Input
                    onBlur={() => {
                      if (!parseTypedDate(startInputDraft)) setStartInputDraft(value.startDate);
                    }}
                    onChange={(event) => handleTypedStartChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.preventDefault();
                    }}
                    placeholder="Today"
                    value={startInputDraft}
                  />
                </label>
                <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  <span>End</span>
                  <Input
                    onBlur={() => {
                      if (!parseTypedDate(endInputDraft)) setEndInputDraft(value.endDate || value.startDate);
                    }}
                    onChange={(event) => handleTypedEndChange(event.target.value)}
                    placeholder="Same day"
                    value={endInputDraft}
                  />
                </label>
              </div>

              <CalendarGrid
                highlightRange
                onPick={(iso) => {
                  if (!value.startDate || iso < value.startDate || iso === value.endDate) {
                    setStartDate(iso);
                  } else {
                    setEndDate(iso);
                  }
                }}
                onVisibleMonthChange={setVisibleMonth}
                selectedEnd={value.endDate}
                selectedStart={value.startDate}
                visibleMonth={visibleMonth}
              />

              <label className="ui-inline-toggle">
                <input
                  checked={value.includeTime}
                  className="accent-accent"
                  onChange={(event) => setIncludeTime(event.target.checked)}
                  type="checkbox"
                />
                Include time
              </label>

              {value.includeTime ? (
                <div className="flex items-end gap-2">
                  <TimeField
                    label="Start"
                    onChange={(next) => commit({ ...value, startTime: normalizeTime(next) })}
                    value={value.startTime}
                  />
                  <TimeField
                    label="End"
                    onChange={(next) => commit({ ...value, endTime: normalizeTime(next) })}
                    value={value.endTime}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <ul className="space-y-1">
                {RECURRENCE_PRESETS.map((preset) => {
                  const active = activePresetId === preset.id;
                  return (
                    <li key={preset.id}>
                      <button
                        aria-pressed={active}
                        className={cn(
                          "flex w-full items-center justify-between rounded-control px-2 py-1.5 text-left text-sm transition-colors",
                          active ? "bg-surface-muted text-text" : "text-text-muted hover:bg-surface-muted hover:text-text"
                        )}
                        onClick={() => applyPreset(preset.id)}
                        type="button"
                      >
                        <span>{preset.label(value)}</span>
                        {active ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>

              {activePresetId === "custom" || value.recurrence.enabled ? (
                <RecurrenceCustomPanel onChange={commit} value={value} />
              ) : null}
            </div>
          )}
        </div>
      </Popover>
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers for callers — convert between the picker value and existing types.
// Kept here (next to the picker) so consumers don't reimplement the mapping.
// ---------------------------------------------------------------------------

export type DateTimeRecurrenceWindow = {
  startsAtUtc: string;
  endsAtUtc: string;
  timezone: string;
};

function localInputToUtcIsoSafe(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function utcIsoToLocalParts(iso: string): { date: string; time: string } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { date: "", time: "" };
  const offset = date.getTimezoneOffset() * 60_000;
  const local = new Date(date.getTime() - offset).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

export function buildPickerValueFromWindow(window: DateTimeRecurrenceWindow): DateTimeRecurrenceValue {
  const start = utcIsoToLocalParts(window.startsAtUtc);
  const end = utcIsoToLocalParts(window.endsAtUtc);
  return {
    startDate: start.date,
    endDate: end.date || start.date,
    includeTime: true,
    startTime: start.time || "09:00",
    endTime: end.time || "10:00",
    timezone: window.timezone,
    recurrence: {
      enabled: false,
      intervalCount: 1,
      intervalUnit: "week",
      byWeekday: [],
      byMonthday: [],
      endMode: "never",
      untilDate: "",
      maxOccurrences: null
    }
  };
}

export function pickerValueToWindow(value: DateTimeRecurrenceValue): DateTimeRecurrenceWindow | null {
  if (!value.startDate) return null;
  const startTime = value.includeTime ? value.startTime : "00:00";
  const endTime = value.includeTime ? value.endTime : "23:59";
  const endDate = value.endDate || value.startDate;
  const startsAt = localInputToUtcIsoSafe(`${value.startDate}T${startTime}`);
  const endsAt = localInputToUtcIsoSafe(`${endDate}T${endTime}`);
  if (!startsAt || !endsAt) return null;
  return { startsAtUtc: startsAt, endsAtUtc: endsAt, timezone: value.timezone };
}
