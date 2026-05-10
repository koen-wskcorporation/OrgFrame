import * as React from "react";
import { X } from "lucide-react";
import { Avatar } from "./avatar";
import { Chip, type ChipVariant } from "./chip";
import type { StatusColor } from "./status-palette";
import { cn } from "./utils";

// Chip representing an org entity (person, team, division, profile, etc.)
// inline. Composed: outer pill wrapper + Avatar + name + optional status (a
// nested Chip) + optional remove button.

type EntityStatus = {
  /** Palette slug or shorthand variant — passed straight through to <Chip />. */
  color?: StatusColor | string;
  variant?: ChipVariant;
  label: string;
  /** Defaults to true when `color` is set. */
  showDot?: boolean;
};

type EntityChipProps = Omit<React.HTMLAttributes<HTMLSpanElement>, "onRemove"> & {
  name: string;
  avatarUrl?: string | null;
  /** Hide the avatar (useful for team/division/program chips that have no avatar). */
  hideAvatar?: boolean;
  /** Status indicator rendered inside the chip. Optional. */
  status?: EntityStatus;
  /** Optional trailing element rendered after status (e.g. a non-status Chip). */
  accessory?: React.ReactNode;
  /** When provided, renders a small `X` button at the end. */
  onRemove?: () => void;
  removeAriaLabel?: string;
};

export function EntityChip({
  avatarUrl,
  className,
  hideAvatar = false,
  name,
  status,
  accessory,
  onRemove,
  removeAriaLabel,
  ...props
}: EntityChipProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-full border bg-surface-muted/40 px-2 py-1",
        className
      )}
      {...props}
    >
      {hideAvatar ? null : <Avatar alt={`${name} avatar`} name={name} sizePx={20} src={avatarUrl} />}
      <span className="truncate text-xs font-medium text-text">{name}</span>
      {status ? (
        <Chip
          className="text-[10px]"
          color={status.color}
          label={status.label}
          showDot={status.showDot}
          variant={status.variant}
        />
      ) : null}
      {accessory}
      {onRemove ? (
        <button
          aria-label={removeAriaLabel ?? `Remove ${name}`}
          className="-mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-text-muted hover:bg-surface-muted hover:text-text"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          type="button"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}

export type { EntityChipProps };
