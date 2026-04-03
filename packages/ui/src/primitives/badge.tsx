import * as React from "react";
import { chipVariants } from "./chip";
import { cn } from "./utils";

type BadgeVariant = "neutral" | "success" | "warning" | "destructive";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

function badgeVariants({ variant }: { variant?: BadgeVariant }) {
  const color =
    variant === "success"
      ? "green"
      : variant === "warning"
        ? "yellow"
        : variant === "destructive"
          ? "red"
          : "neutral";

  return chipVariants({
    color,
    size: "compact"
  });
}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
