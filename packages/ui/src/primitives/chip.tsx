"use client";

import * as React from "react";
import { Check, ChevronDown, Settings2 } from "lucide-react";
import { Popover } from "./popover";
import { resolveStatusColor, type StatusColor } from "./status-palette";
import { cn } from "./utils";

// Color: any palette slug, plus legacy alias `neutral` (mapped to `slate`).
export type ChipColor = StatusColor | "neutral";

const LEGACY_COLOR_ALIAS: Record<string, StatusColor> = {
  neutral: "slate"
};

// Semantic shortcuts.
export type ChipVariant = "neutral" | "success" | "warning" | "destructive";

const VARIANT_ALIAS: Record<ChipVariant, StatusColor> = {
  neutral: "slate",
  success: "emerald",
  warning: "amber",
  destructive: "rose"
};

function resolveSlug(color?: ChipColor | string | null, variant?: ChipVariant): StatusColor {
  if (color) {
    const aliased = LEGACY_COLOR_ALIAS[color];
    if (aliased) return aliased;
    return color as StatusColor;
  }
  if (variant) return VARIANT_ALIAS[variant];
  return "slate";
}

const SHELL_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-full border font-semibold uppercase tracking-wide transition-colors";
const SHELL_SIZE = "h-5 px-2 text-[10px]";
const SHELL_ICON_ONLY = "h-[14px] w-[14px] px-0";

function shellClass(iconOnly: boolean | undefined, chipPalette: string) {
  return cn(SHELL_BASE, chipPalette, iconOnly ? SHELL_ICON_ONLY : SHELL_SIZE);
}

function resolveDot(
  status: boolean | undefined,
  showDot: boolean | undefined,
  color: ChipColor | string | null | undefined,
  variant: ChipVariant | undefined
): boolean {
  if (status !== undefined) return status;
  return showDot ?? Boolean(color || variant);
}

function renderChipChildren(
  slugDef: ReturnType<typeof resolveStatusColor>,
  dotShown: boolean,
  iconOnly: boolean | undefined,
  label: string | undefined,
  children: React.ReactNode
) {
  return (
    <>
      {dotShown && !iconOnly ? <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", slugDef.dot)} /> : null}
      {label !== undefined ? <span className="truncate">{label}</span> : children}
    </>
  );
}

// ─── Picker config ────────────────────────────────────────────────────────────

export type ChipOption = {
  value: string;
  label: string;
  /** Palette slug. Accepts a plain string for callers loading from the DB. */
  color: StatusColor | string;
};

export type ChipPickerConfig = {
  value: string | null | undefined;
  options: ChipOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  onManage?: () => void;
  manageLabel?: string;
  placeholder?: string;
  /** Omit the dropdown caret. Use in tight layouts (e.g. inline rows in a
   *  narrow card) where the chevron's ~18px would crowd neighboring text.
   *  The chip remains clickable and still opens the picker popover. */
  hideCaret?: boolean;
};

// ─── Chip ─────────────────────────────────────────────────────────────────────

type ChipBodyProps = {
  color?: ChipColor | string | null;
  variant?: ChipVariant;
  label?: string;
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

export interface ChipProps
  extends ChipBodyProps,
    Omit<
      React.HTMLAttributes<HTMLSpanElement> & React.ButtonHTMLAttributes<HTMLButtonElement>,
      "color"
    > {
  /**
   * When provided, renders an editable chip with a popover dropdown.
   * The `color` and `label` props on the chip itself are ignored — the picker
   * derives them from the selected option.
   */
  picker?: ChipPickerConfig;
}

export function Chip(props: ChipProps) {
  const {
    color,
    variant,
    label,
    status,
    showDot,
    iconOnly,
    className,
    children,
    picker,
    onClick,
    disabled,
    type,
    ...rest
  } = props;

  if (picker) {
    return <ChipPickerImpl {...picker} className={className} status={status} />;
  }

  const slug = resolveSlug(color, variant);
  const def = resolveStatusColor(slug);
  const dotShown = resolveDot(status, showDot, color, variant);
  const body = renderChipChildren(def, dotShown, iconOnly, label, children);

  const isInteractive = onClick !== undefined || disabled !== undefined || type !== undefined;

  if (isInteractive) {
    return (
      <button
        className={cn(
          shellClass(iconOnly, def.chip),
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-55",
          className
        )}
        disabled={disabled}
        onClick={onClick}
        type={type ?? "button"}
        {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {body}
      </button>
    );
  }

  return (
    <span
      className={cn(shellClass(iconOnly, def.chip), className)}
      {...(rest as React.HTMLAttributes<HTMLSpanElement>)}
    >
      {body}
    </span>
  );
}

// ─── Picker implementation ────────────────────────────────────────────────────

type ChipPickerImplProps = ChipPickerConfig & {
  className?: string;
  status?: boolean;
};

function ChipPickerImpl({
  value,
  options,
  onChange,
  disabled = false,
  onManage,
  manageLabel = "Manage statuses",
  placeholder = "Set status",
  hideCaret = false,
  className,
  status
}: ChipPickerImplProps) {
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = React.useState(false);
  // Optimistic display value: shown immediately when the user picks an
  // option so the chip flips color/label without waiting for the parent's
  // async onChange (server round-trip, store update, etc.) to settle.
  // Clears whenever the parent's `value` prop changes — at that point the
  // source of truth has caught up and the optimistic overlay is no longer
  // needed (covers both "confirmed" and "rejected" outcomes).
  const [optimisticValue, setOptimisticValue] = React.useState<string | null>(null);
  React.useEffect(() => {
    setOptimisticValue(null);
  }, [value]);
  const effectiveValue = optimisticValue ?? value;
  const selected = React.useMemo(
    () => options.find((opt) => opt.value === effectiveValue) ?? null,
    [options, effectiveValue]
  );

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
        <Chip color={selected ? selected.color : "slate"} status={status}>
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          {hideCaret ? null : (
            <ChevronDown
              aria-hidden
              className={cn("h-3 w-3 shrink-0 transition-transform", open ? "rotate-180" : "")}
            />
          )}
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
              const isSelected = option.value === effectiveValue;
              return (
                <li aria-selected={isSelected} key={option.value} role="option">
                  <button
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text transition-colors hover:bg-surface-muted",
                      isSelected ? "bg-surface-muted" : ""
                    )}
                    onClick={() => {
                      setOptimisticValue(option.value);
                      onChange(option.value);
                      setOpen(false);
                    }}
                    type="button"
                  >
                    <span className="min-w-0 flex-1">
                      <Chip color={option.color} label={option.label} />
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

