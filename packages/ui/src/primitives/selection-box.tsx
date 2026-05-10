"use client";

import * as React from "react";
import { cn } from "./utils";

export interface SelectionBoxProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: React.ReactNode;
  description?: React.ReactNode;
  selected?: boolean;
  defaultSelected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  contentClassName?: string;
  indicatorClassName?: string;
}

export const SelectionBox = React.forwardRef<HTMLButtonElement, SelectionBoxProps>(
  (
    {
      className,
      contentClassName,
      indicatorClassName,
      label,
      description,
      selected,
      defaultSelected = false,
      onSelectedChange,
      onClick,
      disabled,
      type = "button",
      ...props
    },
    ref
  ) => {
    const isControlled = typeof selected === "boolean";
    const [internalSelected, setInternalSelected] = React.useState(defaultSelected);
    const isSelected = isControlled ? Boolean(selected) : internalSelected;

    function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
      onClick?.(event);
      if (event.defaultPrevented || disabled) {
        return;
      }

      if (!isControlled) {
        setInternalSelected(true);
      }
      onSelectedChange?.(true);
    }

    return (
      <button
        {...props}
        aria-checked={isSelected}
        className={cn(
          "w-full rounded-card border bg-surface px-4 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
          isSelected ? "border-accent bg-canvas/40" : "border-border hover:bg-canvas/30",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          className
        )}
        disabled={disabled}
        onClick={handleClick}
        ref={ref}
        role="radio"
        type={type}
      >
        <span className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={cn(
              // Match the label's text line-height so the indicator centers on
              // the first line of the label whether a description is present
              // or not.
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border leading-5 transition-colors",
              isSelected ? "border-accent bg-accent/10" : "border-border",
              indicatorClassName
            )}
          >
            <span className={cn("h-2.5 w-2.5 rounded-full bg-accent transition-opacity", isSelected ? "opacity-100" : "opacity-0")} />
          </span>
          <span className={cn("flex min-w-0 flex-1 flex-col gap-1", contentClassName)}>
            <span className="truncate font-medium leading-5 text-text">{label}</span>
            {description ? <span className="text-xs leading-relaxed text-text-muted">{description}</span> : null}
          </span>
        </span>
      </button>
    );
  }
);

SelectionBox.displayName = "SelectionBox";
