"use client";

import * as React from "react";
import { ChevronDown, Filter, type LucideIcon } from "lucide-react";
import { Button } from "./button";
import { Chip } from "./chip";
import { PickerMenu, type PickerMenuItem, type PickerMenuProps } from "./picker-menu";
import { cn } from "./utils";

/**
 * Reusable filter-style dropdown. A variation of the `PickerMenu`
 * dropdown that exposes a standard trigger button — Filter icon ·
 * label · count chip · chevron — over the same nested multi-select
 * picker used in the Repeater toolbar and the calendar source filter.
 *
 * Use this whenever you need a popover dropdown that filters a list of
 * options (faceted filter, source picker, label picker, etc.). For a
 * full searchable single-select input, use `<Select>` instead.
 *
 * Multi-select (the common case) — pass `selectedKeys` +
 * `onSelectedKeysChange` and PickerMenu owns the cascade. For
 * single-select, omit those props and have each item drive its own
 * `active` + `onSelect` (see `PickerMenu` docs).
 */
export type FilterMenuProps = Omit<PickerMenuProps, "renderTrigger" | "ariaLabel"> & {
  /** Label shown in the trigger (e.g. "Calendars", "Status"). */
  label: string;
  /** Additional classes for the trigger button. */
  className?: string;
  /** Icon rendered before the label. Defaults to `Filter`. */
  icon?: LucideIcon;
  /**
   * Optional override for the count chip. When omitted, falls back to
   * `selectedKeys.length`. Pass `0` (or set to undefined) to hide the
   * chip entirely.
   */
  count?: number;
  /** Override the aria-label on the popover panel. */
  ariaLabel?: string;
};

export function FilterMenu({
  label,
  className,
  icon: Icon = Filter,
  count,
  ariaLabel,
  selectedKeys,
  widthClassName = "w-[16rem] max-w-[calc(100vw-1.5rem)]",
  ...pickerProps
}: FilterMenuProps) {
  const resolvedCount = count ?? selectedKeys?.length ?? 0;

  return (
    <PickerMenu
      {...pickerProps}
      ariaLabel={ariaLabel ?? `${label} filter`}
      renderTrigger={({ ref, onClick, open }) => (
        <Button
          className={className}
          onClick={onClick}
          ref={ref}
          size="md"
          type="button"
          variant="secondary"
        >
          <Icon aria-hidden className="h-4 w-4" />
          <span>{label}</span>
          {resolvedCount > 0 ? (
            <Chip color="accent" showDot={false}>
              {resolvedCount}
            </Chip>
          ) : null}
          <ChevronDown
            aria-hidden
            className={cn("h-4 w-4 shrink-0 transition-transform", open ? "rotate-180" : "rotate-0")}
          />
        </Button>
      )}
      selectedKeys={selectedKeys}
      widthClassName={widthClassName}
    />
  );
}

export type { PickerMenuItem };
