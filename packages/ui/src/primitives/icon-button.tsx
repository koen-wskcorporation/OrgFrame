"use client";

import * as React from "react";
import { SpinnerIcon } from "./spinner-icon";
import { cn } from "./utils";

export type IconButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "aria-label"
> & {
  icon: React.ReactNode;
  label: string;
  loading?: boolean;
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ icon, label, loading = false, disabled, className, type, ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        aria-label={label}
        disabled={disabled || loading}
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-transparent text-text transition-colors duration-150",
          "hover:border-border/60 hover:bg-surface-muted",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
          "disabled:pointer-events-none disabled:opacity-55",
          "[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
          className
        )}
        {...props}
      >
        {loading ? <SpinnerIcon className="h-4 w-4" /> : icon}
      </button>
    );
  }
);
