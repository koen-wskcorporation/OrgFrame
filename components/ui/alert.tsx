import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva("rounded-card border p-4 text-sm", {
  variants: {
    variant: {
      info: "border-border bg-surface-muted text-text",
      success: "border-success/30 bg-success/10 text-text",
      warning: "border-accent/35 bg-accent/10 text-text",
      destructive: "border-destructive/30 bg-destructive/10 text-text"
    }
  },
  defaultVariants: {
    variant: "info"
  }
});

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

export function Alert({ className, variant, ...props }: AlertProps) {
  return <div className={cn(alertVariants({ variant }), className)} role="alert" {...props} />;
}
