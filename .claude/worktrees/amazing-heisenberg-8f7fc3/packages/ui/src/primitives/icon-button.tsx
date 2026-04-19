import * as React from "react";
import { Button } from "@orgframe/ui/primitives/button";
import { cn } from "./utils";

type IconButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & {
  label: string;
  icon: React.ReactNode;
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, disabled, icon, label, type = "button", ...props }, ref) => {
    return (
      <Button
        aria-label={label}
        className={cn(
          "h-8 w-8 shrink-0 rounded-full px-0 text-text-muted hover:bg-surface-muted hover:text-text",
          "[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
          className
        )}
        disabled={disabled}
        ref={ref}
        size="sm"
        type={type}
        variant="ghost"
        {...props}
      >
        {icon}
      </Button>
    );
  }
);

IconButton.displayName = "IconButton";
