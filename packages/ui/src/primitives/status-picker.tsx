"use client";

import * as React from "react";
import { Check, ChevronDown, Settings2 } from "lucide-react";
import { formControlDisabledClass, formControlFocusClass, formControlShellClass } from "./form-control";
import { Popover } from "./popover";
import { StatusChip } from "./status-chip";
import { cn } from "./utils";

export type StatusPickerOption = {
  value: string;
  label: string;
  color: string;
};

type StatusPickerProps = {
  value: string | null | undefined;
  options: StatusPickerOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  onManage?: () => void;
  manageLabel?: string;
  className?: string;
  id?: string;
};

export function StatusPicker({
  value,
  options,
  onChange,
  placeholder = "Select a status",
  disabled = false,
  onManage,
  manageLabel = "Manage statuses",
  className,
  id
}: StatusPickerProps) {
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = React.useState(false);

  const selected = React.useMemo(() => options.find((opt) => opt.value === value) ?? null, [options, value]);

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-control px-3 py-2 text-left text-sm transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-canvas",
          formControlShellClass,
          formControlFocusClass,
          formControlDisabledClass,
          !selected ? "text-text-muted" : "",
          className
        )}
        disabled={disabled}
        id={id}
        onClick={() => setOpen((prev) => !prev)}
        ref={triggerRef}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected ? (
            <StatusChip color={selected.color} label={selected.label} size="sm" />
          ) : (
            <span className="truncate">{placeholder}</span>
          )}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-muted transition-transform", open ? "rotate-180" : "")} />
      </button>

      <Popover
        anchorRef={triggerRef}
        className="rounded-control border bg-surface p-0 shadow-floating"
        matchAnchorWidth
        offset={6}
        onClose={() => setOpen(false)}
        open={open}
        placement="bottom-start"
      >
        <ul className="max-h-60 overflow-y-auto py-1.5" role="listbox">
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
