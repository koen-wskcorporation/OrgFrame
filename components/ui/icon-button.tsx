import * as React from "react";
import { cn } from "@/lib/utils";

type IconButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & {
  label: string;
  icon: React.ReactNode;
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, disabled, icon, label, type = "button", ...props }, ref) => {
    return (
      <button
        aria-label={label}
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-transparent text-text-muted transition-colors duration-150",
          "hover:bg-surface-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
          "disabled:pointer-events-none disabled:opacity-55",
          "[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
          className
        )}
        disabled={disabled}
        ref={ref}
        type={type}
        {...props}
      >
        {icon}
      </button>
    );
  }
);

IconButton.displayName = "IconButton";
