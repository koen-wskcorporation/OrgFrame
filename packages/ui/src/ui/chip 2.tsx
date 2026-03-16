import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const chipVariants = cva("inline-flex items-center justify-center gap-1 rounded-full border font-semibold uppercase tracking-wide transition-colors", {
  variants: {
    color: {
      neutral: "border-border bg-surface-muted text-text-muted",
      green: "border-success/35 bg-success/10 text-success",
      yellow: "border-accent/35 bg-accent/10 text-accent-foreground",
      red: "border-destructive/35 bg-destructive/10 text-destructive"
    },
    size: {
      regular: "h-6 px-2.5 text-[11px]",
      compact: "h-5 px-2 text-[10px]"
    },
    variant: {
      dropdown: "shadow-sm",
      flat: ""
    },
    iconOnly: {
      true: "px-0"
    }
  },
  compoundVariants: [
    {
      iconOnly: true,
      size: "regular",
      className: "h-[18px] w-[18px]"
    },
    {
      iconOnly: true,
      size: "compact",
      className: "h-[14px] w-[14px]"
    }
  ],
  defaultVariants: {
    color: "neutral",
    size: "regular",
    variant: "dropdown"
  }
});

export interface ChipProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "color">, VariantProps<typeof chipVariants> {}

export function Chip({ className, color, size, variant, iconOnly, ...props }: ChipProps) {
  return <span className={cn(chipVariants({ color, size, variant, iconOnly }), className)} {...props} />;
}

export interface ChipButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "color">,
    VariantProps<typeof chipVariants> {}

export const ChipButton = React.forwardRef<HTMLButtonElement, ChipButtonProps>(
  ({ className, color, size, variant, iconOnly, type = "button", ...props }, ref) => (
    <button
      className={cn(
        chipVariants({ color, size, variant, iconOnly }),
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-55",
        className
      )}
      ref={ref}
      type={type}
      {...props}
    />
  )
);
ChipButton.displayName = "ChipButton";

export { chipVariants };
