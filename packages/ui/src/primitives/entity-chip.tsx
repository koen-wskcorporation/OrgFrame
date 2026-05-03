import * as React from "react";
import { X } from "lucide-react";
import { Avatar } from "./avatar";
import { StatusChip } from "./status-chip";
import { cn } from "./utils";

// Generic chip for representing any org entity (person, team, division, etc.)
// inline. Renamed from `person-chip` so the same primitive can serve mixed
// selection lists in linking/sharing flows without a misleading name.

type EntityChipProps = Omit<React.HTMLAttributes<HTMLSpanElement>, "onRemove"> & {
  name: string;
  avatarUrl?: string | null;
  /** Hide the avatar (useful for team/division/program chips that have no avatar). */
  hideAvatar?: boolean;
  metaLabel?: string;
  metaTone?: "neutral" | "success";
  /**
   * When provided, renders a small `X` button at the end of the chip.
   * Used by selection chips in pickers (e.g. EntityLinkPicker) to remove
   * the linked target.
   */
  onRemove?: () => void;
  removeAriaLabel?: string;
};

export function EntityChip({
  avatarUrl,
  className,
  hideAvatar = false,
  name,
  metaLabel,
  metaTone = "neutral",
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
      {metaLabel ? (
        <StatusChip className="text-[10px]" variant={metaTone === "success" ? "success" : "neutral"}>
          {metaLabel}
        </StatusChip>
      ) : null}
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

// Backward-compat alias so callsites can migrate gradually.
export const PersonChip = EntityChip;
export type { EntityChipProps };
