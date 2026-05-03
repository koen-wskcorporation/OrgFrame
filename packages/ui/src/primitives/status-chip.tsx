import * as React from "react";
import { resolveStatusColor, type StatusColor } from "./status-palette";
import { cn } from "./utils";

export type StatusChipSize = "sm" | "md";
export type StatusChipVariant = "neutral" | "success" | "warning" | "destructive";

// Map semantic variants to palette slugs so a single component handles both
// the design-token-backed "system" states (success/warning/destructive) and the
// org-defined custom statuses keyed by palette slug.
const VARIANT_TO_COLOR: Record<StatusChipVariant, StatusColor> = {
  neutral: "slate",
  success: "emerald",
  warning: "amber",
  destructive: "rose"
};

export interface StatusChipProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "color"> {
  /** Palette slug ("emerald", "rose", etc) — used for org-defined statuses. */
  color?: string | null;
  /** Semantic shorthand for system states. Overridden by `color` when both are set. */
  variant?: StatusChipVariant;
  /** Label text. If omitted, `children` is rendered instead. */
  label?: string;
  size?: StatusChipSize;
  /** Defaults to `true` when `color` is set, `false` for variant-only usage. */
  showDot?: boolean;
}

export function StatusChip({
  color,
  variant,
  label,
  size = "md",
  showDot,
  className,
  children,
  ...props
}: StatusChipProps) {
  const resolvedSlug = color ?? (variant ? VARIANT_TO_COLOR[variant] : VARIANT_TO_COLOR.neutral);
  const def = resolveStatusColor(resolvedSlug);
  const sizeClass = size === "sm" ? "h-5 px-2 text-[10px]" : "h-6 px-2.5 text-[11px]";
  const dotShown = showDot ?? Boolean(color);

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full border font-semibold uppercase tracking-wide transition-colors",
        def.chip,
        sizeClass,
        className
      )}
      {...props}
    >
      {dotShown ? <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", def.dot)} /> : null}
      {label !== undefined ? <span className="truncate">{label}</span> : children}
    </span>
  );
}

