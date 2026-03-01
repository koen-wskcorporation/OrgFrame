"use client";

import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

type CalendarPickerProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
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

export function CalendarPicker({ value, onChange, disabled, placeholder = "Select date", id, name, min, max, className }: CalendarPickerProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const selectedDate = parseIsoDate(value);
  const [open, setOpen] = React.useState(false);
  const [inputDigits, setInputDigits] = React.useState(() => isoToUsDigits(value));
  const [visibleMonth, setVisibleMonth] = React.useState<Date>(() => startOfMonth(selectedDate ?? new Date()));
  const today = todayIsoDate();

  React.useEffect(() => {
    setInputDigits(isoToUsDigits(value));
  }, [value]);

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

    const selected = parseIsoDate(value);
    if (selected) {
      setVisibleMonth(startOfMonth(selected));
    }
  }, [open, value]);

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
          "flex h-10 w-full items-center gap-1 rounded-control border bg-surface px-1 py-1 text-sm text-text focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-canvas",
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
              setInputDigits(isoToUsDigits(value));
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
              onChange(nextIso);
            }

            placeCaretAtDigit(nextDigits.length >= 8 ? 7 : nextDigits.length);
          }}
          placeholder={placeholder === "Select date" ? "MM/DD/YYYY" : placeholder}
          readOnly
          ref={inputRef}
          type="text"
          value={usDigitsToMaskedValue(inputDigits)}
        />
        <button
          aria-disabled={disabled || undefined}
          aria-expanded={open}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control border bg-surface text-text hover:bg-surface-muted disabled:cursor-not-allowed"
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <CalendarDays aria-hidden className="h-4 w-4 shrink-0" />
          <span className="sr-only">Open calendar</span>
        </button>
      </div>

      {open ? (
        <div className="absolute z-50 mt-2 w-[18rem] rounded-card border bg-surface p-3 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-control border bg-surface text-text hover:bg-surface-muted"
                onClick={() => setVisibleMonth((current) => new Date(current.getFullYear() - 1, current.getMonth(), 1))}
                type="button"
              >
                <ChevronsLeft aria-hidden className="h-4 w-4" />
                <span className="sr-only">Previous year</span>
              </button>
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-control border bg-surface text-text hover:bg-surface-muted"
                onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                type="button"
              >
                <ChevronLeft aria-hidden className="h-4 w-4" />
                <span className="sr-only">Previous month</span>
              </button>
            </div>
            <p className="text-sm font-semibold text-text">{formatMonthLabel(monthStart)}</p>
            <div className="flex items-center gap-1">
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-control border bg-surface text-text hover:bg-surface-muted"
                onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                type="button"
              >
                <ChevronRight aria-hidden className="h-4 w-4" />
                <span className="sr-only">Next month</span>
              </button>
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-control border bg-surface text-text hover:bg-surface-muted"
                onClick={() => setVisibleMonth((current) => new Date(current.getFullYear() + 1, current.getMonth(), 1))}
                type="button"
              >
                <ChevronsRight aria-hidden className="h-4 w-4" />
                <span className="sr-only">Next year</span>
              </button>
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
              const selected = iso === value;
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
                    onChange(iso);
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
                  onChange(next);
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
