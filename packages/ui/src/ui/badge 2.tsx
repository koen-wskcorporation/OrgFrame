import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide", {
  variants: {
    variant: {
      neutral: "border-border bg-surface-muted text-text-muted",
      success: "border-success/35 bg-success/15 text-success",
      warning: "border-accent/35 bg-accent/15 text-accent-foreground",
      destructive: "border-destructive/35 bg-destructive/15 text-destructive"
    }
  },
  defaultVariants: {
    variant: "neutral"
  }
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
