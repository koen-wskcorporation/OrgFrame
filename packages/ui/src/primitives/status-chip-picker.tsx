"use client";

import * as React from "react";
import { Check, ChevronDown, Settings2 } from "lucide-react";
import { Popover } from "./popover";
import { StatusChip, type StatusChipSize } from "./status-chip";
import { cn } from "./utils";

export type StatusChipPickerOption = {
  value: string;
  label: string;
  color: string;
};

type StatusChipPickerProps = {
  value: string | null | undefined;
  options: StatusChipPickerOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  onManage?: () => void;
  manageLabel?: string;
  size?: StatusChipSize;
  placeholder?: string;
  className?: string;
};

/**
 * Clickable variant of `StatusChip` that opens a dropdown to pick a different
 * status. Used in item-page headers (programs, facilities) where users want
 * to change status without going into a settings panel.
 */
export function StatusChipPicker({
  value,
  options,
  onChange,
  disabled = false,
  onManage,
  manageLabel = "Manage statuses",
  size = "md",
  placeholder = "Set status",
  className
}: StatusChipPickerProps) {
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = React.useState(false);

  const selected = React.useMemo(() => options.find((opt) => opt.value === value) ?? null, [options, value]);

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "inline-flex items-center gap-1 rounded-full transition-opacity",
          disabled ? "cursor-not-allowed opacity-60" : "hover:opacity-80",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
          className
        )}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        ref={triggerRef}
        type="button"
      >
        {selected ? (
          <StatusChip color={selected.color} label={selected.label} size={size} />
        ) : (
          <StatusChip label={placeholder} size={size} variant="neutral" />
        )}
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 text-text-muted transition-transform", open ? "rotate-180" : "")}
        />
      </button>

      <Popover
        anchorRef={triggerRef}
        className="overflow-hidden rounded-control border bg-surface p-0 shadow-floating"
        offset={6}
        onClose={() => setOpen(false)}
        open={open}
        placement="bottom-start"
      >
        <ul className="min-w-[200px] max-h-60 overflow-y-auto py-1.5" role="listbox">
          {options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-text-muted">No statuses yet.</li>
          ) : (
            options.map((option) => {
              const isSelected = option.value === value;
              return (
                <li aria-selected={isSelected} key={option.value} role="option">
                  <button
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text transition-colors hover:bg-surface-muted",
                      isSelected ? "bg-surface-muted" : ""
                    )}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    type="button"
                  >
                    <span className="min-w-0 flex-1">
                      <StatusChip color={option.color} label={option.label} size="sm" />
                    </span>
                    {isSelected ? <Check className="h-4 w-4 shrink-0 text-text-muted" /> : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
        {onManage ? (
          <div className="border-t">
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
              onClick={() => {
                setOpen(false);
                onManage();
              }}
              type="button"
            >
              <Settings2 className="h-4 w-4" />
              <span>{manageLabel}</span>
            </button>
          </div>
        ) : null}
      </Popover>
    </>
  );
}
