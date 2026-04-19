"use client";

import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { IconButton } from "@orgframe/ui/primitives/icon-button";
import { cn } from "./utils";

type CalendarPickerProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  includeTime?: boolean;
  defaultTime?: string;
  placeholder?: string;
  id?: string;
  name?: string;
  min?: string;
  max?: string;
  className?: string;
};

const weekdayLabels = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isLocalDateTimeValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value);
}

function splitDateTimeValue(value: string) {
  if (isIsoDate(value)) {
    return { date: value, time: null as string | null };
  }
  if (isLocalDateTimeValue(value)) {
    const [date, time] = value.split("T");
    return { date: date ?? "", time: time ?? null };
  }
  return { date: "", time: null as string | null };
}

function parseIsoDate(value: string) {
  if (!isIsoDate(value)) {
    return null;
  }

  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number.parseInt(yearRaw ?? "", 10);
  const month = Number.parseInt(monthRaw ?? "", 10);
  const day = Number.parseInt(dayRaw ?? "", 10);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const next = new Date(year, month - 1, day);

  if (next.getFullYear() !== year || next.getMonth() !== month - 1 || next.getDate() !== day) {
    return null;
  }

  return next;
}

function toIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isoToUsDigits(value: string) {
  const parsed = parseIsoDate(value);

  if (!parsed) {
    return "";
  }

  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const year = String(parsed.getFullYear()).padStart(4, "0");
  return `${month}${day}${year}`;
}

function usDigitsToMaskedValue(digits: string) {
  const safeDigits = digits.replace(/\D/g, "").slice(0, 8);
  const month = safeDigits.slice(0, 2).padEnd(2, "_");
  const day = safeDigits.slice(2, 4).padEnd(2, "_");
  const year = safeDigits.slice(4, 8).padEnd(4, "_");
  return `${month}/${day}/${year}`;
}

function usDigitsToIsoDate(digits: string) {
  const safeDigits = digits.replace(/\D/g, "").slice(0, 8);

  if (safeDigits.length !== 8) {
    return null;
  }

  const month = Number.parseInt(safeDigits.slice(0, 2), 10);
  const day = Number.parseInt(safeDigits.slice(2, 4), 10);
  const year = Number.parseInt(safeDigits.slice(4, 8), 10);

  if (!Number.isInteger(month) || !Number.isInteger(day) || !Number.isInteger(year)) {
    return null;
  }

  const next = new Date(year, month - 1, day);

  if (next.getFullYear() !== year || next.getMonth() !== month - 1 || next.getDate() !== day) {
    return null;
  }

  return toIsoDate(next);
}

function todayIsoDate() {
  return toIsoDate(new Date());
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function formatMonthLabel(value: Date) {
  return value.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });
}

function formatSelectedLabel(value: string) {
  const parsed = parseIsoDate(value);

  if (!parsed) {
    return "";
  }

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function isOutsideBounds(dateIso: string, min?: string, max?: string) {
  if (min && dateIso < min) {
    return true;
  }

  if (max && dateIso > max) {
    return true;
  }

  return false;
}

function normalizeTimeValue(value: string | null | undefined, fallback = "09:00") {
  if (!value) {
    return fallback;
  }
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return fallback;
  }
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number.parseInt(hourRaw ?? "", 10);
  const minute = Number.parseInt(minuteRaw ?? "", 10);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return fallback;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function to12HourParts(timeValue: string) {
  const normalized = normalizeTimeValue(timeValue);
  const [hourRaw, minuteRaw] = normalized.split(":");
  const hour24 = Number.parseInt(hourRaw ?? "0", 10);
  const minute = Number.parseInt(minuteRaw ?? "0", 10);
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return {
    hour12,
    minute,
    meridiem
  };
}

function from12HourParts(hour12: number, minute: number, meridiem: "AM" | "PM") {
  let hour24 = hour12 % 12;
  if (meridiem === "PM") {
    hour24 += 12;
  }
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function combineDateAndTime(dateIso: string, timeValue: string) {
  return `${dateIso}T${normalizeTimeValue(timeValue)}`;
}

function shiftTimeMinutes(timeValue: string, deltaMinutes: number) {
  const normalized = normalizeTimeValue(timeValue);
  const [hourRaw, minuteRaw] = normalized.split(":");
  const hour = Number.parseInt(hourRaw ?? "0", 10);
  const minute = Number.parseInt(minuteRaw ?? "0", 10);
  const total = ((hour * 60 + minute + deltaMinutes) % (24 * 60) + 24 * 60) % (24 * 60);
  const nextHour = Math.floor(total / 60);
  const nextMinute = total % 60;
  return `${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`;
}

export function CalendarPicker({
  value,
  onChange,
  disabled,
  includeTime = false,
  defaultTime = "09:00",
  placeholder = "Select date",
  id,
  name,
  min,
  max,
  className
}: CalendarPickerProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const { date: selectedDateValue, time: selectedTimeValue } = splitDateTimeValue(value);
  const selectedDate = parseIsoDate(selectedDateValue);
  const [open, setOpen] = React.useState(false);
  const [inputDigits, setInputDigits] = React.useState(() => isoToUsDigits(selectedDateValue));
  const [timeValue, setTimeValue] = React.useState(() => normalizeTimeValue(selectedTimeValue, defaultTime));
  const [visibleMonth, setVisibleMonth] = React.useState<Date>(() => startOfMonth(selectedDate ?? new Date()));
  const today = todayIsoDate();

  React.useEffect(() => {
    setInputDigits(isoToUsDigits(selectedDateValue));
    setTimeValue(normalizeTimeValue(selectedTimeValue, defaultTime));
  }, [defaultTime, selectedDateValue, selectedTimeValue]);

  function placeCaretAtDigit(digitIndex: number) {
    const target = inputRef.current;
    if (!target) {
      return;
    }

    const positions = [0, 1, 3, 4, 6, 7, 8, 9];
    const safeIndex = Math.max(0, Math.min(positions.length - 1, digitIndex));
    const caretPosition = positions[safeIndex] ?? 0;
    requestAnimationFrame(() => {
      target.setSelectionRange(caretPosition, caretPosition);
    });
  }

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const selected = parseIsoDate(selectedDateValue);
    if (selected) {
      setVisibleMonth(startOfMonth(selected));
    }
  }, [open, selectedDateValue]);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const root = rootRef.current;
      if (!root) {
        return;
      }

      if (event.target instanceof Node && !root.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const monthStart = startOfMonth(visibleMonth);
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const firstWeekday = monthStart.getDay();

  const days = Array.from({ length: 42 }, (_, index) => {
    return new Date(year, month, index - firstWeekday + 1);
  });

  return (
    <div className={cn("relative", className)} ref={rootRef}>
      <div
        className={cn(
          "flex h-10 w-full items-center gap-1 rounded-control border border-border bg-surface px-1 py-1 text-sm text-text shadow-[inset_0_1px_0_hsl(var(--canvas)/0.35)] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-canvas",
          disabled ? "opacity-55" : null
        )}
      >
        <input
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm text-text outline-none placeholder:text-text-muted disabled:cursor-not-allowed"
          disabled={disabled}
          id={id}
          inputMode="numeric"
          name={name}
          onBlur={() => {
            if (inputDigits.length === 0) {
              return;
            }

            const nextIso = usDigitsToIsoDate(inputDigits);
            if (!nextIso || isOutsideBounds(nextIso, min, max)) {
              setInputDigits(isoToUsDigits(selectedDateValue));
            }
          }}
          onClick={(event) => {
            event.preventDefault();
            placeCaretAtDigit(inputDigits.length >= 8 ? 7 : inputDigits.length);
          }}
          onFocus={() => {
            placeCaretAtDigit(inputDigits.length >= 8 ? 7 : inputDigits.length);
          }}
          onChange={() => {
            // Input is keyboard-managed via onKeyDown; keep a no-op handler to satisfy controlled input expectations.
          }}
          onKeyDown={(event) => {
            if (event.key === "Tab") {
              return;
            }

            event.preventDefault();

            if (event.key === "Backspace" || event.key === "Delete") {
              if (inputDigits.length === 0) {
                return;
              }

              const nextDigits = inputDigits.slice(0, -1);
              setInputDigits(nextDigits);
              if (nextDigits.length === 0) {
                onChange("");
              }
              placeCaretAtDigit(nextDigits.length >= 8 ? 7 : nextDigits.length);
              return;
            }

            if (!/^\d$/.test(event.key)) {
              return;
            }

            if (inputDigits.length >= 8) {
              return;
            }

            const nextDigits = `${inputDigits}${event.key}`;
            setInputDigits(nextDigits);

            const nextIso = usDigitsToIsoDate(nextDigits);
            if (nextIso && !isOutsideBounds(nextIso, min, max)) {
              onChange(includeTime ? combineDateAndTime(nextIso, timeValue) : nextIso);
            }

            placeCaretAtDigit(nextDigits.length >= 8 ? 7 : nextDigits.length);
          }}
          placeholder={placeholder === "Select date" ? "MM/DD/YYYY" : placeholder}
          readOnly
          ref={inputRef}
          type="text"
          value={usDigitsToMaskedValue(inputDigits)}
        />
        <IconButton
          aria-expanded={open}
          disabled={disabled}
          icon={<CalendarDays aria-hidden className="h-4 w-4 shrink-0" />}
          label="Open calendar"
          onClick={() => setOpen((current) => !current)}
        />
      </div>

      {open ? (
        <div className="absolute z-50 mt-2 w-[18rem] rounded-card border bg-surface p-3 shadow-floating">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <IconButton
                icon={<ChevronsLeft aria-hidden className="h-4 w-4" />}
                label="Previous year"
                onClick={() => setVisibleMonth((current) => new Date(current.getFullYear() - 1, current.getMonth(), 1))}
              />
              <IconButton
                icon={<ChevronLeft aria-hidden className="h-4 w-4" />}
                label="Previous month"
                onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
              />
            </div>
            <p className="text-sm font-semibold text-text">{formatMonthLabel(monthStart)}</p>
            <div className="flex items-center gap-1">
              <IconButton
                icon={<ChevronRight aria-hidden className="h-4 w-4" />}
                label="Next month"
                onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
              />
              <IconButton
                icon={<ChevronsRight aria-hidden className="h-4 w-4" />}
                label="Next year"
                onClick={() => setVisibleMonth((current) => new Date(current.getFullYear() + 1, current.getMonth(), 1))}
              />
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {weekdayLabels.map((label) => (
              <div className="pb-1 text-center text-xs font-medium text-text-muted" key={label}>
                {label}
              </div>
            ))}
            {days.map((day) => {
              const iso = toIsoDate(day);
              const inMonth = day.getMonth() === month;
              const selected = iso === selectedDateValue;
              const isToday = iso === today;
              const unavailable = isOutsideBounds(iso, min, max);

              return (
                <button
                  aria-pressed={selected}
                  className={cn(
                    "inline-flex h-9 items-center justify-center rounded-control text-sm transition-colors",
                    inMonth ? "text-text" : "text-text-muted",
                    selected ? "bg-accent text-accent-foreground" : "hover:bg-surface-muted",
                    isToday && !selected ? "border border-accent/40" : null,
                    unavailable ? "cursor-not-allowed opacity-40 hover:bg-transparent" : null
                  )}
                  disabled={unavailable}
                  key={iso}
                  onClick={() => {
                    onChange(includeTime ? combineDateAndTime(iso, timeValue) : iso);
                    setInputDigits(isoToUsDigits(iso));
                    setOpen(false);
                  }}
                  type="button"
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          {includeTime ? (
            <div className="mt-3 rounded-control border bg-surface-muted/40 p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Time</p>
                <div className="flex items-center gap-1">
                  <button
                    className="rounded-control border px-2 py-1 text-xs text-text-muted hover:bg-surface"
                    onClick={() => {
                      const next = shiftTimeMinutes(timeValue, -15);
                      setTimeValue(next);
                      if (selectedDateValue) {
                        onChange(combineDateAndTime(selectedDateValue, next));
                      }
                    }}
                    type="button"
                  >
                    -15m
                  </button>
                  <button
                    className="rounded-control border px-2 py-1 text-xs text-text-muted hover:bg-surface"
                    onClick={() => {
                      const next = shiftTimeMinutes(timeValue, 15);
                      setTimeValue(next);
                      if (selectedDateValue) {
                        onChange(combineDateAndTime(selectedDateValue, next));
                      }
                    }}
                    type="button"
                  >
                    +15m
                  </button>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <select
                  className="h-9 rounded-control border bg-surface px-2 text-sm"
                  disabled={disabled}
                  onChange={(event) => {
                    const current = to12HourParts(timeValue);
                    const nextHour = Number.parseInt(event.target.value, 10);
                    if (!Number.isInteger(nextHour)) {
                      return;
                    }
                    const next = from12HourParts(nextHour, current.minute, current.meridiem as "AM" | "PM");
                    setTimeValue(next);
                    if (selectedDateValue) {
                      onChange(combineDateAndTime(selectedDateValue, next));
                    }
                  }}
                  value={to12HourParts(timeValue).hour12}
                >
                  {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => (
                    <option key={hour} value={hour}>
                      {hour}
                    </option>
                  ))}
                </select>
                <select
                  className="h-9 rounded-control border bg-surface px-2 text-sm"
                  disabled={disabled}
                  onChange={(event) => {
                    const current = to12HourParts(timeValue);
                    const nextMinute = Number.parseInt(event.target.value, 10);
                    if (!Number.isInteger(nextMinute)) {
                      return;
                    }
                    const next = from12HourParts(current.hour12, nextMinute, current.meridiem as "AM" | "PM");
                    setTimeValue(next);
                    if (selectedDateValue) {
                      onChange(combineDateAndTime(selectedDateValue, next));
                    }
                  }}
                  value={to12HourParts(timeValue).minute}
                >
                  {[0, 15, 30, 45].map((minute) => (
                    <option key={minute} value={minute}>
                      {`${minute}`.padStart(2, "0")}
                    </option>
                  ))}
                </select>
                <select
                  className="h-9 rounded-control border bg-surface px-2 text-sm"
                  disabled={disabled}
                  onChange={(event) => {
                    const current = to12HourParts(timeValue);
                    const nextMeridiem = event.target.value === "PM" ? "PM" : "AM";
                    const next = from12HourParts(current.hour12, current.minute, nextMeridiem);
                    setTimeValue(next);
                    if (selectedDateValue) {
                      onChange(combineDateAndTime(selectedDateValue, next));
                    }
                  }}
                  value={to12HourParts(timeValue).meridiem}
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-between">
            <button
              className="text-xs text-text-muted underline-offset-4 hover:underline"
              onClick={() => {
                onChange("");
                setInputDigits("");
                setOpen(false);
              }}
              type="button"
            >
              Clear
            </button>
            <button
              className="text-xs text-text-muted underline-offset-4 hover:underline"
              onClick={() => {
                const next = todayIsoDate();
                if (!isOutsideBounds(next, min, max)) {
                  onChange(includeTime ? combineDateAndTime(next, timeValue) : next);
                  setInputDigits(isoToUsDigits(next));
                }
                setOpen(false);
              }}
              type="button"
            >
              Today
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
