"use client";

import * as React from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type MultiSelectOption = {
  value: string;
  label: string;
  description?: string;
  keywords?: string[];
  disabled?: boolean;
};

type MultiSelectProps = {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
};

function matchesQuery(option: MultiSelectOption, query: string) {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  const haystacks = [option.label, option.value, ...(option.keywords ?? [])];

  return haystacks.some((entry) => entry.toLowerCase().includes(normalizedQuery));
}

function moveIndex(currentIndex: number, delta: number, total: number) {
  if (total === 0) {
    return -1;
  }

  if (currentIndex < 0) {
    return delta > 0 ? 0 : total - 1;
  }

  return (currentIndex + delta + total) % total;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select options",
  searchPlaceholder = "Search options",
  emptyMessage = "No matches yet.",
  disabled = false,
  className,
  autoFocus = false
}: MultiSelectProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const listboxId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);

  const selectedSet = React.useMemo(() => new Set(value), [value]);
  const selectedOptions = React.useMemo(() => options.filter((option) => selectedSet.has(option.value)), [options, selectedSet]);
  const filteredOptions = React.useMemo(() => {
    return options
      .filter((option) => matchesQuery(option, query))
      .sort((left, right) => {
        const leftScore = selectedSet.has(left.value) ? 0 : 1;
        const rightScore = selectedSet.has(right.value) ? 0 : 1;

        if (leftScore !== rightScore) {
          return leftScore - rightScore;
        }

        return left.label.localeCompare(right.label);
      });
  }, [options, query, selectedSet]);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;

      if (target && rootRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
      setQuery("");
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const firstEnabledIndex = filteredOptions.findIndex((option) => !option.disabled);
    setHighlightedIndex(firstEnabledIndex);
  }, [filteredOptions, open]);

  function focusInput() {
    inputRef.current?.focus();
  }

  function updateValue(nextValue: string[]) {
    onChange(Array.from(new Set(nextValue)));
  }

  function toggleOption(optionValue: string) {
    if (selectedSet.has(optionValue)) {
      updateValue(value.filter((item) => item !== optionValue));
      return;
    }

    updateValue([...value, optionValue]);
  }

  function removeOption(optionValue: string) {
    updateValue(value.filter((item) => item !== optionValue));
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) {
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();

      if (!open) {
        setOpen(true);
      }

      const delta = event.key === "ArrowDown" ? 1 : -1;
      let nextIndex = highlightedIndex;

      for (let attempt = 0; attempt < filteredOptions.length; attempt += 1) {
        nextIndex = moveIndex(nextIndex, delta, filteredOptions.length);

        if (nextIndex < 0) {
          break;
        }

        if (!filteredOptions[nextIndex]?.disabled) {
          setHighlightedIndex(nextIndex);
          break;
        }
      }

      return;
    }

    if (event.key === "Enter") {
      if (!open) {
        return;
      }

      const highlightedOption = filteredOptions[highlightedIndex];

      if (!highlightedOption || highlightedOption.disabled) {
        return;
      }

      event.preventDefault();
      toggleOption(highlightedOption.value);
      setQuery("");
      return;
    }

    if (event.key === "Escape") {
      if (!open) {
        return;
      }

      event.preventDefault();
      setOpen(false);
      setQuery("");
      return;
    }

    if (event.key === "Backspace" && query.length === 0 && value.length > 0) {
      removeOption(value[value.length - 1]);
      return;
    }

    if (event.key === "Tab") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div className={cn("relative", className)} ref={rootRef}>
      <div
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex min-h-[3.5rem] w-full cursor-text flex-wrap items-center gap-2 rounded-[24px] border border-border bg-white/90 px-4 py-3 shadow-[inset_0_1px_0_hsl(var(--canvas)/0.32),0_12px_28px_hsl(220_28%_18%/0.05)] transition duration-200",
          "focus-within:border-accent/40 focus-within:ring-2 focus-within:ring-ring/35 focus-within:ring-offset-2 focus-within:ring-offset-canvas",
          disabled ? "cursor-not-allowed opacity-55" : "hover:border-border/80",
          open ? "border-accent/45" : undefined
        )}
        onClick={() => {
          if (disabled) {
            return;
          }

          setOpen(true);
          focusInput();
        }}
      >
        {selectedOptions.map((option) => (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-accent/15 bg-accent/10 px-3 py-1 text-xs font-semibold text-text"
            key={option.value}
          >
            {option.label}
            <button
              aria-label={`Remove ${option.label}`}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-text-muted transition hover:bg-black/5 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                removeOption(option.value);
                focusInput();
              }}
              type="button"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        <div className="flex min-w-[10rem] flex-1 items-center gap-2">
          <Search className="h-4 w-4 text-text-muted" />
          <input
            aria-activedescendant={highlightedIndex >= 0 ? `${listboxId}-option-${highlightedIndex}` : undefined}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={open}
            aria-label={searchPlaceholder}
            autoFocus={autoFocus}
            className="h-7 min-w-[7rem] flex-1 border-0 bg-transparent text-sm text-text placeholder:text-text-muted focus-visible:outline-none"
            data-autofocus={autoFocus ? "true" : undefined}
            disabled={disabled}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setOpen(true);
            }}
            onFocus={() => {
              if (!disabled) {
                setOpen(true);
              }
            }}
            onKeyDown={handleInputKeyDown}
            placeholder={selectedOptions.length > 0 ? "Add another" : placeholder}
            ref={inputRef}
            role="combobox"
            value={query}
          />
        </div>

        <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-muted transition-transform", open ? "rotate-180" : undefined)} />
      </div>

      {selectedOptions.length > 0 ? <p className="mt-2 text-xs text-text-muted">Select as many as you need. Remove any tag at any time.</p> : null}

      {open ? (
        <div className="absolute left-0 right-0 z-20 mt-3 overflow-hidden rounded-[24px] border border-border/70 bg-[linear-gradient(180deg,hsl(0_0%_100%/0.98),hsl(200_26%_97%/0.96))] shadow-[0_22px_50px_hsl(220_30%_14%/0.14)] backdrop-blur">
          <div className="border-b border-border/65 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Available options</p>
          </div>

          {filteredOptions.length > 0 ? (
            <ul className="max-h-72 overflow-y-auto p-2" id={listboxId} role="listbox">
              {filteredOptions.map((option, index) => {
                const selected = selectedSet.has(option.value);
                const highlighted = highlightedIndex === index;

                return (
                  <li
                    aria-selected={selected}
                    id={`${listboxId}-option-${index}`}
                    key={option.value}
                    role="option"
                  >
                    <button
                      className={cn(
                        "flex w-full items-start gap-3 rounded-[18px] px-3 py-3 text-left transition",
                        highlighted ? "bg-accent/10" : "hover:bg-surface-muted/70",
                        option.disabled ? "cursor-not-allowed opacity-45" : undefined
                      )}
                      disabled={option.disabled}
                      onClick={() => {
                        toggleOption(option.value);
                        setQuery("");
                        focusInput();
                      }}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      type="button"
                    >
                      <span
                        className={cn(
                          "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition",
                          selected ? "border-accent bg-accent text-accent-foreground" : "border-border bg-white text-transparent"
                        )}
                      >
                        <Check className="h-3 w-3" />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-text">{option.label}</span>
                        {option.description ? <span className="mt-0.5 block text-xs leading-relaxed text-text-muted">{option.description}</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-4 py-5 text-sm text-text-muted">{emptyMessage}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
