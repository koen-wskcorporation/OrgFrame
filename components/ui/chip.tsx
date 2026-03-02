import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const chipVariants = cva("inline-flex items-center rounded-full border font-semibold uppercase tracking-wide", {
  variants: {
    color: {
      neutral: "border-border bg-surface-muted text-text-muted",
      green: "border-success/35 bg-success/10 text-success",
      yellow: "border-accent/35 bg-accent/10 text-accent-foreground",
      red: "border-destructive/35 bg-destructive/10 text-destructive"
    },
    size: {
      regular: "px-2.5 py-1 text-[11px]",
      small: "px-1.5 py-0.5 text-[9px]"
    }
  },
  defaultVariants: {
    color: "neutral",
    size: "regular"
  }
});

export interface ChipProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "color">, VariantProps<typeof chipVariants> {}

export function Chip({ className, color, size, ...props }: ChipProps) {
  return <span className={cn(chipVariants({ color, size }), className)} {...props} />;
}
