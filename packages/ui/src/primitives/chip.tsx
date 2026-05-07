"use client";

import * as React from "react";
import { Check, ChevronDown, Settings2 } from "lucide-react";
import { Popover } from "./popover";
import { resolveStatusColor, type StatusColor } from "./status-palette";
import { cn } from "./utils";

// Color: any palette slug, plus legacy aliases kept for back-compat with the
// prior cva-based Chip (`neutral|green|yellow|red`). Aliases that don't exist
// in the palette ("neutral") are remapped at render time.
export type ChipColor = StatusColor | "neutral";

const LEGACY_COLOR_ALIAS: Record<string, StatusColor> = {
  neutral: "slate"
};

// Semantic shortcuts inherited from the previous StatusChip.
export type ChipVariant = "neutral" | "success" | "warning" | "destructive";

const VARIANT_ALIAS: Record<ChipVariant, StatusColor> = {
  neutral: "slate",
  success: "emerald",
  warning: "amber",
  destructive: "rose"
};

// Old `regular|compact` accepted alongside `md|sm` for back-compat.
export type ChipSize = "sm" | "md" | "regular" | "compact";

function normalizeSize(size?: ChipSize): "sm" | "md" {
  if (!size || size === "md" || size === "regular") return "md";
  return "sm";
}

function resolveSlug(color?: ChipColor | string | null, variant?: ChipVariant): StatusColor {
  if (color) {
    const aliased = LEGACY_COLOR_ALIAS[color];
    if (aliased) return aliased;
    return color as StatusColor;
  }
  if (variant) return VARIANT_ALIAS[variant];
  return "slate";
}

const SHELL_BASE = "inline-flex items-center justify-center gap-1.5 rounded-full border font-semibold uppercase tracking-wide transition-colors";

function shellClass(size: "sm" | "md", iconOnly: boolean | undefined, chipPalette: string) {
  const sizeClass = size === "sm" ? "h-4 px-1.5 text-[9px]" : "h-5 px-2 text-[10px]";
  const iconSize = size === "sm" ? "h-3 w-3 px-0" : "h-[14px] w-[14px] px-0";
  return cn(SHELL_BASE, chipPalette, iconOnly ? iconSize : sizeClass);
}

type ChipBodyProps = {
  color?: ChipColor | string | null;
  variant?: ChipVariant;
  label?: string;
  size?: ChipSize;
  /**
   * `true` → always show dot (this chip represents a status).
   * `false` → always hide dot.
   * Omit to fall back to `showDot` / color-presence heuristic.
   */
  status?: boolean;
  /** @deprecated Prefer `status` prop. */
  showDot?: boolean;
  iconOnly?: boolean;
  className?: string;
  children?: React.ReactNode;
};

function resolveDot(status: boolean | undefined, showDot: boolean | undefined, color: ChipBodyProps["color"], variant: ChipBodyProps["variant"]): boolean {
  if (status !== undefined) return status;
  return showDot ?? Boolean(color || variant);
}

function renderChipChildren(slugDef: ReturnType<typeof resolveStatusColor>, dotShown: boolean, iconOnly: boolean | undefined, label: string | undefined, children: React.ReactNode) {
  return (
    <>
      {dotShown && !iconOnly ? <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", slugDef.dot)} /> : null}
      {label !== undefined ? <span className="truncate">{label}</span> : children}
    </>
  );
}

export interface ChipProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "color">, ChipBodyProps {}

export function Chip({ color, variant, label, size, status, showDot, iconOnly, className, children, ...props }: ChipProps) {
  const slug = resolveSlug(color, variant);
  const def = resolveStatusColor(slug);
  const normalized = normalizeSize(size);
  const dotShown = resolveDot(status, showDot, color, variant);
  return (
    <span className={cn(shellClass(normalized, iconOnly, def.chip), className)} {...props}>
      {renderChipChildren(def, dotShown, iconOnly, label, children)}
    </span>
  );
}

export interface ChipButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "color">, ChipBodyProps {}

export const ChipButton = React.forwardRef<HTMLButtonElement, ChipButtonProps>(
  ({ color, variant, label, size, status, showDot, iconOnly, className, children, type = "button", ...props }, ref) => {
    const slug = resolveSlug(color, variant);
    const def = resolveStatusColor(slug);
    const normalized = normalizeSize(size);
    const dotShown = resolveDot(status, showDot, color, variant);
    return (
      <button
        className={cn(
          shellClass(normalized, iconOnly, def.chip),
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-55",
          className
        )}
        ref={ref}
        type={type}
        {...props}
      >
        {renderChipChildren(def, dotShown, iconOnly, label, children)}
      </button>
    );
  }
);
ChipButton.displayName = "ChipButton";

// Editable chip with a popover dropdown — replaces the former StatusChipPicker.
// Caller wires `value`/`options`/`onChange`; pass `onManage` to add a footer
// action (e.g. "Manage statuses").
export type ChipOption = {
  value: string;
  label: string;
  /** Palette slug. Accepts a plain string for callers loading from the DB. */
  color: StatusColor | string;
};

export type ChipPickerProps = {
  value: string | null | undefined;
  options: ChipOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  onManage?: () => void;
  manageLabel?: string;
  size?: ChipSize;
  placeholder?: string;
  className?: string;
  /**
   * `true` → render the colored status dot in the trigger chip. Mirrors the
   * `status` prop on `<Chip />`. Defaults to off so existing call-sites are
   * unaffected.
   */
  status?: boolean;
};

export function ChipPicker({
  value,
  options,
  onChange,
  disabled = false,
  onManage,
  manageLabel = "Manage statuses",
  size = "md",
  placeholder = "Set status",
  className,
  status
}: ChipPickerProps) {
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const selected = React.useMemo(() => options.find((opt) => opt.value === value) ?? null, [options, value]);
  const normalized = normalizeSize(size);

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "inline-flex rounded-full transition-opacity",
          disabled ? "cursor-not-allowed opacity-60" : "hover:opacity-80",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
          className
        )}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        ref={triggerRef}
        type="button"
      >
        <Chip color={selected ? selected.color : "slate"} size={normalized} status={status}>
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronDown
            aria-hidden
            className={cn("h-3 w-3 shrink-0 transition-transform", open ? "rotate-180" : "")}
          />
        </Chip>
      </button>
      <Popover
        anchorRef={triggerRef}
        className="overflow-hidden rounded-control border bg-surface p-0 shadow-floating"
        offset={6}
        onClose={() => setOpen(false)}
        open={open}
        placement="bottom-start"
      >
        <ul className="min-w-[200px] max-h-60 overflow-y-auto py-1.5" role="listbox">
          {options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-text-muted">No options</li>
          ) : (
            options.map((option) => {
              const isSelected = option.value === value;
              return (
                <li aria-selected={isSelected} key={option.value} role="option">
                  <button
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text transition-colors hover:bg-surface-muted",
                      isSelected ? "bg-surface-muted" : ""
                    )}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    type="button"
                  >
                    <span className="min-w-0 flex-1">
                      <Chip color={option.color} label={option.label} size="sm" />
                    </span>
                    {isSelected ? <Check className="h-4 w-4 shrink-0 text-text-muted" /> : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
        {onManage ? (
          <div className="border-t">
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
              onClick={() => {
                setOpen(false);
                onManage();
              }}
              type="button"
            >
              <Settings2 className="h-4 w-4" />
              <span>{manageLabel}</span>
            </button>
          </div>
        ) : null}
      </Popover>
    </>
  );
}

// RepeaterChip — a data-label chip with no status dot. Use for non-status info
// (counts, types, environment, division, etc.). Defaults to `slate` color so a
// row of these chips reads as neutral metadata; the actual status chip in the
// row stands out via its own color + dot.
export interface RepeaterChipProps extends Omit<ChipProps, "status" | "showDot" | "variant"> {}

export function RepeaterChip({ color = "slate", ...props }: RepeaterChipProps) {
  return <Chip color={color} status={false} {...props} />;
}

// Badge — a label chip with no dot, fixed sm size.
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: ChipVariant;
}

export function Badge({ variant = "neutral", ...props }: BadgeProps) {
  return <Chip status={false} size="sm" variant={variant} {...props} />;
}

