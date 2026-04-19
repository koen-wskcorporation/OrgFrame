import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

const alertVariants = cva("rounded-control border p-3.5 text-sm leading-relaxed", {
  variants: {
    variant: {
      info: "border-border bg-surface-muted text-text",
      success: "border-success/30 bg-success/10 text-text",
      warning: "border-warning/35 bg-warning/12 text-text",
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
