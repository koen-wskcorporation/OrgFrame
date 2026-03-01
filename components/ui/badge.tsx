import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold", {
  variants: {
    variant: {
      neutral: "bg-surface-muted text-text",
      success: "bg-success/20 text-success",
      warning: "bg-accent/18 text-accent-foreground",
      destructive: "bg-destructive/16 text-destructive"
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
