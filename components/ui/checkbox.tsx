"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  onCheckedChange?: (checked: boolean) => void;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, onCheckedChange, onChange, disabled, ...props }, ref) => {
    const isControlled = typeof props.checked === "boolean";
    const isChecked = isControlled ? Boolean(props.checked) : undefined;

    return (
      <span className={cn("relative inline-flex h-4 w-4 shrink-0 items-center justify-center align-middle", className)}>
        <input
          {...props}
          className={cn(
            "peer m-0 h-4 w-4 cursor-pointer appearance-none rounded-[4px] border border-border bg-surface transition-colors",
            isControlled ? (isChecked ? "border-accent bg-accent" : "border-border bg-surface") : "checked:border-accent checked:bg-accent",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
          disabled={disabled}
          onChange={(event) => {
            onChange?.(event);
            onCheckedChange?.(event.target.checked);
          }}
          ref={ref}
          type="checkbox"
        />
        <Check
          className={cn(
            "pointer-events-none absolute h-3 w-3 text-accent-foreground transition-opacity",
            isControlled ? (isChecked ? "opacity-100" : "opacity-0") : "opacity-0 peer-checked:opacity-100"
          )}
        />
      </span>
    );
  }
);

Checkbox.displayName = "Checkbox";
