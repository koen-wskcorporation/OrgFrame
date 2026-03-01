"use client";

import { Check, GripVertical, Pencil, Trash2 } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { SpinnerIcon } from "@/components/ui/spinner-icon";
import { cn } from "@/lib/utils";

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
      <button
        aria-label={dragAriaLabel ?? `Drag ${label || "item"}`}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-text-muted hover:text-text disabled:cursor-not-allowed disabled:text-text-muted/60"
        disabled={disabled || !canMove}
        suppressHydrationWarning
        type="button"
        {...(canMove ? dragHandleProps : {})}
      >
        <GripVertical className="h-4 w-4" />
      </button>

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
        <button
          aria-label="Edit"
          className="inline-flex h-8 w-8 items-center justify-center text-text-muted hover:text-text disabled:cursor-not-allowed disabled:text-text-muted/60"
          disabled={disabled}
          onClick={onEdit}
          title="Edit"
          type="button"
        >
          <Pencil className="h-4 w-4" />
        </button>

        <button
          aria-label="Delete"
          className="inline-flex h-8 w-8 items-center justify-center text-text-muted hover:text-text disabled:cursor-not-allowed disabled:text-text-muted/60"
          disabled={disabled || !canDelete}
          onClick={onDelete}
          title="Delete"
          type="button"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
