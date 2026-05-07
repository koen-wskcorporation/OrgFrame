"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { AdaptiveLogo } from "./adaptive-logo";
import { NavItem } from "./nav-item";
import { Popover } from "./popover";
import { cn } from "./utils";

/**
 * Generic picker-menu primitive — a trigger button paired with a popover
 * containing a vertical list of selectable items. Used for both the
 * program-map "Add" menu (icon + label items) and the org-header org
 * switcher (logo + label + current-org checkmark).
 *
 * Items render as `<NavItem variant="sidebar">` pills inside the popover so
 * the picker shares the visual treatment of the rest of the navigation
 * (rounded pill, hover state, active accent).
 *
 * The trigger is a render prop so callers control the button's visual
 * (icon-only vs labelled, ghost vs primary, etc.). The picker owns the
 * open state, anchor ref, popover dismissal, and aria.
 */

export type PickerMenuItem = {
  key: string;
  label: React.ReactNode;
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
  /** When set, the item renders as a Next.js Link (NavItem `href`) instead of a button. */
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
};

const POPOVER_BASE_CLASS =
  "overflow-hidden rounded-card border border-border bg-surface p-1.5 shadow-floating";

export function PickerMenu({
  renderTrigger,
  items,
  ariaLabel,
  placement = "bottom-start",
  widthClassName = "w-[16rem] max-w-[calc(100vw-1.5rem)]"
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
        <div aria-label={ariaLabel} className="flex max-h-[22rem] flex-col gap-0.5 overflow-y-auto" role="menu">
          {items.map((item) => (
            <PickerMenuItemRow key={item.key} item={item} onAfterSelect={close} />
          ))}
        </div>
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
  const handleClick = () => {
    if (item.disabled) return;
    item.onSelect?.();
    onAfterSelect();
  };

  // Build the leading slot as a fixed-size icon container so SVG icons and
  // image logos render at consistent dimensions inside the NavItem pill.
  const leading = item.icon ? (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-current">
      {item.icon}
    </span>
  ) : item.iconUrl ? (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden">
      <AdaptiveLogo
        alt={item.iconAlt ?? ""}
        className="h-full w-full object-contain object-center"
        src={item.iconUrl}
      />
    </span>
  ) : item.iconFallback ? (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden">
      {item.iconFallback}
    </span>
  ) : undefined;

  const trailing = item.active ? (
    <Check aria-hidden className="h-4 w-4 shrink-0 text-text-muted" />
  ) : undefined;

  return (
    <NavItem
      active={item.active ?? false}
      ariaCurrent={item.active ? "true" : undefined}
      disabled={item.disabled}
      href={item.href}
      icon={leading}
      onClick={handleClick}
      rightSlot={trailing}
      role="menuitem"
      size="md"
      variant="sidebar"
    >
      {item.label}
    </NavItem>
  );
}
