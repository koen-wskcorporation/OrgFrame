"use client";

import * as React from "react";
import Link from "next/link";
import { Checkbox } from "./checkbox";
import { cn } from "./utils";
import type { RepeaterView } from "./repeater";

export type RepeaterItemSpec = {
  /** Stable key for the item (also used as React key when no separate key is provided). */
  id: string;
  /** Primary heading. ReactNode so callers can include icons, links, status pills, etc. */
  title: React.ReactNode;
  /** Secondary line shown under the title (slug, counts, kind, timestamps). */
  meta?: React.ReactNode;
  /** Optional leading element (avatar, icon, color swatch). Aligned with the title. */
  leading?: React.ReactNode;
  /**
   * Inline chips rendered to the right of the title text. Pass one or more
   * `<Chip/>` / `<ChipPicker/>` / `<PublishStatusIcon/>` — they share a flex row
   * with a small gap. Replaces the older `status` slot.
   */
  chips?: React.ReactNode;
  /** Primary action shown rightmost in list view, bottom-right in card view. */
  primaryAction?: React.ReactNode;
  /** Secondary actions rendered before the primary action. */
  secondaryActions?: React.ReactNode;
  /** Free-form footer slot for card view (replaces the action row when provided). */
  footer?: React.ReactNode;
  /**
   * Free-form content rendered INSIDE the same row container, beneath the main
   * row (title / chips / actions). Used by tree-style lists to nest a sub-list
   * directly within its parent row rather than as a separate item below it.
   * List view only.
   */
  body?: React.ReactNode;
  /** Wrap the item in an anchor that navigates here. Mutually exclusive with onClick. */
  href?: string;
  /** Wrap the item in a button that fires this on click. */
  onClick?: () => void;
  /** Disable hover affordance. Defaults to true when href / onClick is set, false otherwise. */
  hoverable?: boolean;
  className?: string;
};

type RepeaterItemProps = RepeaterItemSpec & {
  view: RepeaterView;
  /** When set, a selection checkbox is rendered. Repeater wires this automatically when `selectable`. */
  selected?: boolean;
  onSelectChange?: (next: boolean) => void;
  selectionLabel?: string;
};

/**
 * Default item layout for `<Repeater />`. Renders a list row in `list` view and a
 * rectangular card tile in `grid` view from the same slot-based prop shape — every
 * slot is optional so callers only fill what they have. Pair with `<Repeater renderItem={...}/>`
 * or use the `getItem` overload on `<Repeater />` to skip the renderItem boilerplate.
 */
export function RepeaterItem({
  view,
  title,
  meta,
  leading,
  chips,
  primaryAction,
  secondaryActions,
  footer,
  body,
  href,
  onClick,
  hoverable,
  className,
  selected,
  onSelectChange,
  selectionLabel
}: RepeaterItemProps) {
  const isInteractive = Boolean(href || onClick);
  const showHover = hoverable ?? isInteractive;
  const selectable = typeof onSelectChange === "function";
  const selectionNode = selectable ? (
    <Checkbox
      aria-label={selectionLabel ?? "Select item"}
      checked={Boolean(selected)}
      className="flex-none"
      onCheckedChange={(next) => onSelectChange?.(next)}
      onClick={(event) => event.stopPropagation()}
    />
  ) : null;

  if (view === "list") {
    const rowContent = (
      <>
        {selectionNode}
        {leading ? <div className="flex-none">{leading}</div> : null}
        <div className="ui-list-row-content">
          <div className="flex flex-wrap items-center gap-2">
            <span className="ui-list-row-title">{title}</span>
            {chips}
          </div>
          {meta ? <div className="ui-list-row-meta">{meta}</div> : null}
        </div>
        {(secondaryActions || primaryAction) ? (
          <div className="ui-list-row-actions">
            {secondaryActions}
            {primaryAction}
          </div>
        ) : null}
      </>
    );

    if (body) {
      // When a body slot is provided, the outer container becomes a column with
      // the head row at top and the body beneath, all inside one bordered
      // shell. The hover affordance lives on the head row only — the body
      // hosts its own interactive children.
      return (
        <RowShell
          className={cn(
            "overflow-hidden rounded-control border bg-surface shadow-sm",
            isInteractive && "cursor-pointer",
            className
          )}
          href={href}
          onClick={onClick}
        >
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 px-4 py-3",
              showHover && "transition-colors hover:bg-surface-muted/65"
            )}
          >
            {rowContent}
          </div>
          <div className="border-t border-border bg-canvas/30 px-4 py-3">{body}</div>
        </RowShell>
      );
    }

    return (
      <RowShell
        className={cn(
          "ui-list-row",
          showHover && "ui-list-row-hover",
          isInteractive && "cursor-pointer",
          className
        )}
        href={href}
        onClick={onClick}
      >
        {rowContent}
      </RowShell>
    );
  }

  return (
    <RowShell
      className={cn(
        "ui-repeat-card",
        showHover && "ui-repeat-card-hover",
        isInteractive && "cursor-pointer",
        className
      )}
      href={href}
      onClick={onClick}
    >
      <div className="ui-repeat-card-head">
        <div className="flex min-w-0 items-start gap-2">
          {selectionNode}
          {leading ? <div className="flex-none">{leading}</div> : null}
          <div className="ui-repeat-card-title min-w-0 break-words">{title}</div>
        </div>
        {chips ? <div className="flex flex-none flex-wrap items-center gap-2">{chips}</div> : null}
      </div>
      {meta ? <div className="ui-repeat-card-meta">{meta}</div> : null}
      {footer ?? ((secondaryActions || primaryAction) ? (
        <div className="ui-repeat-card-footer">
          {secondaryActions}
          {primaryAction}
        </div>
      ) : null)}
    </RowShell>
  );
}

type RowShellProps = {
  className: string;
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
};

function RowShell({ className, href, onClick, children }: RowShellProps) {
  if (href) {
    return (
      <Link className={className} href={href}>
        {children}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button className={cn(className, "text-left")} onClick={onClick} type="button">
        {children}
      </button>
    );
  }
  return <div className={className}>{children}</div>;
}
