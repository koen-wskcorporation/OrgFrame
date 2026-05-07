"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";

/**
 * Slug field with live availability checking against an in-memory set of
 * existing slugs (program-scoped, so we don't need a server round-trip).
 *
 * Behavior:
 *   - Auto-derives from `nameSource` while the user hasn't edited the slug.
 *   - Once edited, sticks with the manual value and validates pattern + uniqueness.
 *   - Surfaces "Available" / "Already used" / "Use lowercase letters …" inline.
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function uniqueSlug(base: string, taken: Set<string>, fallback = "item"): string {
  const root = slugify(base) || fallback;
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type SlugStatus = "idle" | "available" | "taken" | "invalid";

export function computeSlugStatus(slug: string, existingSlugs: Set<string>): SlugStatus {
  if (!slug) return "idle";
  if (slug.length < 2 || slug.length > 80 || !SLUG_PATTERN.test(slug)) return "invalid";
  if (existingSlugs.has(slug)) return "taken";
  return "available";
}

type SlugFieldProps = {
  value: string;
  onChange: (value: string) => void;
  /** When set and the slug hasn't been manually edited, auto-derives from this. */
  nameSource?: string;
  touched: boolean;
  onTouchedChange: (touched: boolean) => void;
  existingSlugs: Set<string>;
  /** External validation error (e.g., from submit-time check). Wins over status hint. */
  error?: string;
  label?: string;
  fallbackBase?: string;
  /** "division" / "team" — used as base for the auto-unique suggestion. */
  kindLabel?: string;
};

export function SlugField({
  value,
  onChange,
  nameSource = "",
  touched,
  onTouchedChange,
  existingSlugs,
  error,
  label = "Slug",
  fallbackBase = "item",
  kindLabel
}: SlugFieldProps) {
  // While untouched, the displayed slug auto-tracks the name source; once the
  // user edits the slug field, we hold their value verbatim and only normalize
  // on blur via the keystroke filter below.
  const autoSuggestion = React.useMemo(
    () => uniqueSlug(nameSource, existingSlugs, fallbackBase),
    [nameSource, existingSlugs, fallbackBase]
  );

  React.useEffect(() => {
    if (touched) return;
    if (value === autoSuggestion) return;
    onChange(autoSuggestion);
  }, [autoSuggestion, onChange, touched, value]);

  const effectiveSlug = value;
  const status = touched
    ? computeSlugStatus(effectiveSlug, existingSlugs)
    : "available"; // auto-suggested slug is always available by construction

  const hint = !touched
    ? `Auto-derived from the ${kindLabel ?? "name"}. Edit to customize.`
    : status === "available"
      ? "Available"
      : status === "invalid"
        ? "Use 2-80 lowercase letters, numbers, and hyphens."
        : status === "taken"
          ? "Already used in this program."
          : undefined;

  // External error wins over computed hint/error.
  const resolvedError = error ?? (touched && (status === "taken" || status === "invalid") ? hint : undefined);
  const resolvedHint = resolvedError ? undefined : hint;

  return (
    <FormField error={resolvedError} hint={resolvedHint} label={label}>
      <div className="relative">
        <Input
          aria-invalid={touched && (status === "taken" || status === "invalid") ? true : undefined}
          className="pr-9"
          onChange={(event) => {
            onTouchedChange(true);
            const next = event.target.value
              .toLowerCase()
              .replace(/[^a-z0-9-]/g, "");
            onChange(next);
          }}
          placeholder={autoSuggestion}
          value={value}
        />
        {touched && status !== "idle" ? (
          <span
            aria-hidden
            className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 ${
              status === "available" ? "text-success" : "text-destructive"
            }`}
          >
            {status === "available" ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
          </span>
        ) : null}
      </div>
    </FormField>
  );
}
