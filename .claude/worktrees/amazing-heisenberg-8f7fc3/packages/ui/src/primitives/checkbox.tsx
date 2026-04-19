"use client";

import * as React from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "./utils";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  onCheckedChange?: (checked: boolean) => void;
  indeterminate?: boolean;
  inputClassName?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, inputClassName, indeterminate = false, onCheckedChange, onChange, disabled, ...props }, ref) => {
    const isControlled = typeof props.checked === "boolean";
    const isChecked = isControlled ? Boolean(props.checked) : undefined;
    const inputRef = React.useRef<HTMLInputElement | null>(null);

    React.useEffect(() => {
      if (!inputRef.current) {
        return;
      }
      inputRef.current.indeterminate = Boolean(indeterminate) && !Boolean(isChecked);
    }, [indeterminate, isChecked]);

    function assignRef(node: HTMLInputElement | null) {
      inputRef.current = node;
      if (typeof ref === "function") {
        ref(node);
        return;
      }
      if (ref) {
        ref.current = node;
      }
    }

    return (
      <span className={cn("relative inline-flex h-4 w-4 shrink-0 items-center justify-center align-middle", className)}>
        <input
          {...props}
          className={cn(
            "peer m-0 h-4 w-4 cursor-pointer appearance-none rounded-[4px] border border-border bg-surface shadow-[inset_0_1px_0_hsl(var(--canvas)/0.35)] transition-colors",
            isControlled ? (isChecked ? "border-accent bg-accent" : "border-border bg-surface") : "checked:border-accent checked:bg-accent",
            indeterminate ? "border-accent bg-accent" : null,
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
            "disabled:cursor-not-allowed disabled:opacity-60",
            inputClassName
          )}
          disabled={disabled}
          onChange={(event) => {
            onChange?.(event);
            onCheckedChange?.(event.target.checked);
          }}
          ref={assignRef}
          type="checkbox"
        />
        <Check
          className={cn(
            "pointer-events-none absolute h-3 w-3 text-accent-foreground transition-opacity",
            indeterminate ? "opacity-0" : null,
            isControlled ? (isChecked ? "opacity-100" : "opacity-0") : "opacity-0 peer-checked:opacity-100"
          )}
        />
        <Minus
          className={cn(
            "pointer-events-none absolute h-3 w-3 text-accent-foreground transition-opacity",
            indeterminate ? "opacity-100" : "opacity-0"
          )}
        />
      </span>
    );
  }
);

Checkbox.displayName = "Checkbox";
