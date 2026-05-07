"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { Input } from "./input";
import { cn } from "./utils";

/**
 * Toolbar search input. Leading magnifier icon, optional clear button when
 * the user has typed something. Uses the standard Input shell so it matches
 * other form controls (height, focus ring, border).
 */
export type SearchBarProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  value: string;
  onValueChange: (value: string) => void;
  onClear?: () => void;
  containerClassName?: string;
};

export const SearchBar = React.forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
  { value, onValueChange, onClear, placeholder = "Search", containerClassName, className, ...props },
  ref
) {
  const hasValue = value.length > 0;

  return (
    <div className={cn("relative w-full", containerClassName)}>
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
      <Input
        ref={ref}
        autoComplete="off"
        className={cn("pl-9", hasValue ? "pr-9" : null, className)}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        type="search"
        value={value}
        {...props}
      />
      {hasValue ? (
        <button
          aria-label="Clear search"
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
          onClick={() => {
            onValueChange("");
            onClear?.();
          }}
          tabIndex={-1}
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
});
