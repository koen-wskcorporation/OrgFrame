"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Input } from "@orgframe/ui/primitives/input";
import { cn } from "@orgframe/ui/primitives/utils";

/**
 * Search-bar overlay used by every map editor (program map, facility map).
 *
 * Behavior:
 * - Renders pinned to the top-left of the canvas viewport.
 * - Listens for global keystrokes; if the user starts typing while no
 *   editable element is focused, focus is moved here so the keystroke flows
 *   in. Typing inside any other input/textarea/contenteditable is ignored.
 * - Filters items by case-insensitive substring with light fuzzy scoring,
 *   surfaces matches in a dropdown.
 * - Enter selects the top match; Escape clears + blurs.
 * - The caller owns the actual "navigate / zoom / open panel" side-effect
 *   via `onPickItem(itemId)` — the search bar only resolves which item.
 */
export type MapSearchItem = {
  id: string;
  label: string;
  /** Optional small label rendered in the dropdown row (e.g. "Division", "Field"). */
  sublabel?: string;
};

export type MapSearchBarProps = {
  items: MapSearchItem[];
  onPickItem: (itemId: string) => void;
  /** Placeholder text — defaults to "Search". Pass a feature-specific hint
   *  like "Search teams & divisions" to give users a clue what's matched. */
  placeholder?: string;
  className?: string;
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function scoreMatch(label: string, query: string): number {
  const haystack = label.toLowerCase();
  const needle = query.toLowerCase();
  if (!needle) return 0;
  if (haystack === needle) return 1000;
  if (haystack.startsWith(needle)) return 500 - (haystack.length - needle.length);
  // Word-boundary match scores higher than mid-word.
  const wordIdx = haystack.split(/\s+/).findIndex((word) => word.startsWith(needle));
  if (wordIdx >= 0) return 200 - wordIdx;
  const idx = haystack.indexOf(needle);
  if (idx >= 0) return 100 - idx;
  // Fuzzy: every needle char appears in order somewhere in haystack.
  let h = 0;
  for (const ch of needle) {
    const found = haystack.indexOf(ch, h);
    if (found < 0) return 0;
    h = found + 1;
  }
  return 10;
}

const MAX_RESULTS = 8;

export function MapSearchBar({ items, onPickItem, placeholder = "Search", className }: MapSearchBarProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [highlightIndex, setHighlightIndex] = React.useState(0);

  const matches = React.useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return items
      .map((item) => ({ item, score: scoreMatch(item.label, q) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label))
      .slice(0, MAX_RESULTS);
  }, [items, query]);

  // Reset highlight whenever the result list changes.
  React.useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  // Global "start typing → focus the search bar" listener. Only triggers
  // when no other editable element is focused, so panel forms and inline
  // edits aren't hijacked.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.length !== 1) return;
      if (isEditableTarget(event.target)) return;
      if (document.activeElement === inputRef.current) return;
      // Focus the input — the keystroke will land in it as part of normal
      // event flow once focus moves.
      inputRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const dismiss = React.useCallback(() => {
    setQuery("");
    setOpen(false);
    setHighlightIndex(0);
    inputRef.current?.blur();
  }, []);

  const submit = React.useCallback(() => {
    const target = matches[highlightIndex] ?? matches[0];
    if (!target) return;
    onPickItem(target.item.id);
    dismiss();
  }, [dismiss, highlightIndex, matches, onPickItem]);

  // Close the dropdown when clicking outside the wrapper.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (wrapperRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "pointer-events-auto absolute left-3 top-3 z-20 w-[18rem] max-w-[calc(100%-1.5rem)]",
        className
      )}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <Input
          ref={inputRef}
          aria-label={placeholder}
          autoComplete="off"
          className="pl-8"
          onBlur={() => {
            // Delay so click on a result row registers before close.
            window.setTimeout(() => setOpen(false), 120);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (query.trim().length > 0) setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              dismiss();
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              setHighlightIndex((current) => Math.min(matches.length - 1, current + 1));
              setOpen(true);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlightIndex((current) => Math.max(0, current - 1));
            }
          }}
          placeholder={placeholder}
          spellCheck={false}
          type="text"
          value={query}
        />
      </div>
      {open && query.trim().length > 0 ? (
        <div
          className="absolute left-0 right-0 top-[calc(100%+0.375rem)] overflow-hidden rounded-card border border-border bg-surface p-1 shadow-floating"
          role="listbox"
        >
          {matches.length === 0 ? (
            <div className="px-2.5 py-2 text-xs text-text-muted">No matches.</div>
          ) : (
            matches.map((entry, index) => (
              <button
                key={entry.item.id}
                aria-selected={index === highlightIndex}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-control px-2.5 py-1.5 text-left text-sm transition-colors",
                  index === highlightIndex ? "bg-surface-muted text-text" : "text-text hover:bg-surface-muted/60"
                )}
                onMouseDown={(event) => {
                  // Prevent input blur firing before our onClick.
                  event.preventDefault();
                }}
                onMouseEnter={() => setHighlightIndex(index)}
                onClick={() => {
                  onPickItem(entry.item.id);
                  dismiss();
                }}
                role="option"
                type="button"
              >
                <span className="min-w-0 truncate font-medium">{entry.item.label}</span>
                {entry.item.sublabel ? (
                  <span className="shrink-0 text-[11px] uppercase tracking-wide text-text-muted">{entry.item.sublabel}</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
