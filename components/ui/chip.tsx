import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const chipVariants = cva("inline-flex items-center rounded-full border font-medium uppercase tracking-wide", {
  variants: {
    color: {
      neutral: "border-text-muted bg-transparent text-text-muted",
      green: "border-emerald-600 bg-transparent text-emerald-600",
      yellow: "border-amber-600 bg-transparent text-amber-600",
      red: "border-red-600 bg-transparent text-red-600"
    },
    size: {
      regular: "px-2.5 py-1 text-[11px]",
      small: "px-1 py-0.5 text-[8px]"
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
