"use client";

import * as React from "react";
import { Check, ChevronDown, Settings2 } from "lucide-react";
import { Popover } from "./popover";
import { resolveStatusColor, type StatusColor, type StatusColorDef } from "./status-palette";
import { cn } from "./utils";

// Color: any palette slug, plus legacy alias `neutral` (mapped to `slate`).
// `accent` resolves to the org's brand accent CSS variables, not a fixed slug.
export type ChipColor = StatusColor | "neutral" | "accent";

const LEGACY_COLOR_ALIAS: Record<string, StatusColor> = {
  neutral: "slate"
};

// Semantic shortcuts. `dynamic` paints with the org's accent color — use it
// for chips that label org-defined / dynamic content so a single rule keeps
// every "dynamic" badge in the app branded consistently.
export type ChipVariant = "neutral" | "success" | "warning" | "destructive" | "dynamic";

const VARIANT_ALIAS: Record<Exclude<ChipVariant, "dynamic">, StatusColor> = {
  neutral: "slate",
  success: "emerald",
  warning: "amber",
  destructive: "rose"
};

// Synthetic def that paints from the `accent` Tailwind colour, which is wired
// to `--accent` and overridden per-org. Not a member of the persisted
// `StatusColor` palette; only reachable via the `accent` color or `dynamic`
// variant on the Chip itself.
const ACCENT_DEF: StatusColorDef = {
  slug: "slate",
  label: "Accent",
  chip: "border-accent/30 bg-accent/10 text-accent",
  dot: "bg-accent",
  swatch: "bg-accent"
};

function resolveDef(color?: ChipColor | string | null, variant?: ChipVariant): StatusColorDef {
  if (color === "accent") return ACCENT_DEF;
  if (variant === "dynamic") return ACCENT_DEF;
  if (color) {
    const aliased = LEGACY_COLOR_ALIAS[color];
    return resolveStatusColor(aliased ?? (color as StatusColor));
  }
  if (variant) return resolveStatusColor(VARIANT_ALIAS[variant]);
  return resolveStatusColor("slate");
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

  const def = resolveDef(color, variant);
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

