"use client";

import * as React from "react";
import { Check } from "lucide-react";
import Link from "next/link";
import { AdaptiveLogo } from "./adaptive-logo";
import { Popover } from "./popover";
import { cn } from "./utils";

/**
 * Generic picker-menu primitive — a trigger button paired with a popover
 * containing a vertical list of selectable items. Used for both the
 * program-map "Add" menu (icon + label items) and the org-header org
 * switcher (avatar + label + current-org checkmark).
 *
 * The trigger is a render prop so callers control the button's visual
 * (icon-only vs labelled, ghost vs primary, etc.). The picker owns the
 * open state, anchor ref, popover dismissal, and aria wiring.
 */

export type PickerMenuItem = {
  key: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  /** Lucide-style React icon (small leading slot). Mutually exclusive with `iconUrl`. */
  icon?: React.ReactNode;
  /** Image URL for richer leading slot (e.g. org logos). */
  iconUrl?: string | null;
  iconAlt?: string;
  /** Fallback element rendered in the leading slot when no icon/iconUrl. */
  iconFallback?: React.ReactNode;
  /** Marks the item as currently selected — shows a trailing check. */
  active?: boolean;
  disabled?: boolean;
  /** When set, the item renders as a Next.js Link instead of a button. */
  href?: string;
  onSelect?: () => void;
};

export type PickerMenuRenderTriggerArgs = {
  ref: React.Ref<HTMLButtonElement>;
  onClick: () => void;
  open: boolean;
};

export type PickerMenuProps = {
  renderTrigger: (args: PickerMenuRenderTriggerArgs) => React.ReactNode;
  items: PickerMenuItem[];
  /** Describes the picker for screen readers (set on the popover panel). */
  ariaLabel: string;
  placement?: "bottom-start" | "bottom-end" | "top-start" | "top-end";
  /** Tailwind class controlling the popover width. */
  widthClassName?: string;
  /** Optional header content rendered above the list. */
  header?: React.ReactNode;
  /** Optional footer content rendered below the list. */
  footer?: React.ReactNode;
};

const POPOVER_BASE_CLASS =
  "overflow-hidden rounded-card border border-border bg-surface p-1.5 shadow-floating";

export function PickerMenu({
  renderTrigger,
  items,
  ariaLabel,
  placement = "bottom-start",
  widthClassName = "w-[16rem] max-w-[calc(100vw-1.5rem)]",
  header,
  footer
}: PickerMenuProps) {
  const [open, setOpen] = React.useState(false);
  const anchorRef = React.useRef<HTMLButtonElement | null>(null);

  const toggle = React.useCallback(() => setOpen((current) => !current), []);
  const close = React.useCallback(() => setOpen(false), []);

  return (
    <>
      {renderTrigger({ ref: anchorRef, onClick: toggle, open })}
      <Popover
        anchorRef={anchorRef}
        className={cn(POPOVER_BASE_CLASS, widthClassName)}
        onClose={close}
        open={open}
        placement={placement}
      >
        {header ? <div className="px-2 pb-1.5 pt-1 text-xs font-medium text-text-muted">{header}</div> : null}
        <ul aria-label={ariaLabel} className="max-h-[22rem] space-y-0.5 overflow-y-auto">
          {items.map((item) => (
            <PickerMenuItemRow key={item.key} item={item} onAfterSelect={close} />
          ))}
        </ul>
        {footer ? <div className="px-2 pb-1 pt-1.5 text-xs text-text-muted">{footer}</div> : null}
      </Popover>
    </>
  );
}

function PickerMenuItemRow({
  item,
  onAfterSelect
}: {
  item: PickerMenuItem;
  onAfterSelect: () => void;
}) {
  const handleSelect = (event: React.MouseEvent | React.KeyboardEvent) => {
    if (item.disabled) {
      event.preventDefault();
      return;
    }
    item.onSelect?.();
    if (!event.defaultPrevented) onAfterSelect();
  };

  const leading = (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-text-muted">
      {item.icon ? (
        item.icon
      ) : item.iconUrl ? (
        <AdaptiveLogo
          alt={item.iconAlt ?? ""}
          className="h-full w-full object-contain object-center"
          src={item.iconUrl}
        />
      ) : (
        item.iconFallback ?? null
      )}
    </span>
  );

  const body = (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="min-w-0 truncate text-sm font-medium text-text">{item.label}</span>
      {item.description ? (
        <span className="min-w-0 truncate text-xs text-text-muted">{item.description}</span>
      ) : null}
    </span>
  );

  const trailing = item.active ? (
    <Check aria-hidden className="h-4 w-4 shrink-0 text-text-muted" />
  ) : null;

  const className = cn(
    "flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-sm transition-colors",
    item.active ? "bg-surface-muted/60 text-text" : "text-text hover:bg-surface-muted",
    item.disabled ? "pointer-events-none opacity-55" : ""
  );

  if (item.href && !item.disabled) {
    return (
      <li role="none">
        <Link
          aria-current={item.active ? "true" : undefined}
          className={className}
          href={item.href}
          onClick={(event) => handleSelect(event)}
          role="menuitem"
        >
          {leading}
          {body}
          {trailing}
        </Link>
      </li>
    );
  }

  return (
    <li role="none">
      <button
        aria-current={item.active ? "true" : undefined}
        className={className}
        disabled={item.disabled}
        onClick={(event) => handleSelect(event)}
        role="menuitem"
        type="button"
      >
        {leading}
        {body}
        {trailing}
      </button>
    </li>
  );
}
