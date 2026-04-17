"use client";

import { Check, GripVertical, Pencil, Trash2 } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { IconButton } from "@orgframe/ui/primitives/icon-button";
import { SpinnerIcon } from "@orgframe/ui/primitives/spinner-icon";
import { cn } from "@orgframe/ui/primitives/utils";

type FormBuilderNavItemProps = {
  label: string;
  isActive: boolean;
  disabled: boolean;
  canMove: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  dragAriaLabel?: string;
  dragHandleProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  saveState?: "saving" | "saved";
};

export function FormBuilderNavItem({
  label,
  isActive,
  disabled,
  canMove,
  canDelete,
  onSelect,
  onEdit,
  onDelete,
  dragAriaLabel,
  dragHandleProps,
  saveState
}: FormBuilderNavItemProps) {
  return (
    <div
      className={cn(
        "inline-flex w-fit max-w-full items-center gap-2 rounded-control border bg-surface px-2 py-1.5",
        isActive ? "border-accent/60 bg-accent/10" : "border-border"
      )}
    >
      <IconButton
        icon={<GripVertical className="h-4 w-4" />}
        label={dragAriaLabel ?? `Drag ${label || "item"}`}
        disabled={disabled || !canMove}
        suppressHydrationWarning
        type="button"
        {...(canMove ? dragHandleProps : {})}
      />

      <button className="min-w-0 max-w-[220px] text-left text-xs font-semibold text-text" onClick={onSelect} type="button">
        <span className="truncate">{label || "Untitled"}</span>
      </button>

      {saveState ? (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-text-muted">
          {saveState === "saving" ? <SpinnerIcon className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5 text-success" />}
          {saveState === "saving" ? "Saving..." : "Changes saved"}
        </span>
      ) : null}

      <div className="ml-2 inline-flex items-center gap-1">
        <IconButton
          icon={<Pencil className="h-4 w-4" />}
          label="Edit"
          disabled={disabled}
          onClick={onEdit}
          title="Edit"
          type="button"
        />

        <IconButton
          icon={<Trash2 className="h-4 w-4" />}
          label="Delete"
          disabled={disabled || !canDelete}
          onClick={onDelete}
          title="Delete"
          type="button"
        />
      </div>
    </div>
  );
}
