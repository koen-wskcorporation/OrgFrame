"use client";

import * as React from "react";
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, ChevronDown, Pencil, Plus, Settings2, Trash2, X, type LucideIcon } from "lucide-react";
import { Popover } from "./popover";
import { SpinnerIcon } from "./spinner-icon";
import { cn } from "./utils";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-sm font-semibold leading-none transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-55 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-foreground shadow-sm hover:bg-accent/90",
        secondary: "border-border bg-surface text-text shadow-sm hover:bg-surface-muted/60",
        ghost: "border-transparent bg-transparent text-text hover:border-border/60 hover:bg-surface-muted",
        danger: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
      },
      size: {
        sm: "h-9 px-3",
        md: "h-10",
        lg: "h-11 px-5"
      }
    },
    defaultVariants: {
      variant: "primary",
      size: "md"
    }
  }
);

type DropdownPlacement = "bottom-start" | "bottom-end" | "top-start" | "top-end";

export type ButtonIntent =
  | "add"
  | "create"
  | "save"
  | "submit"
  | "edit"
  | "manage"
  | "delete"
  | "remove"
  | "cancel";

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;

const intentRegistry: Record<
  ButtonIntent,
  { icon: LucideIcon | null; verb: string; variant: ButtonVariant }
> = {
  add: { icon: Plus, verb: "Add", variant: "primary" },
  create: { icon: Plus, verb: "Create", variant: "primary" },
  save: { icon: Check, verb: "Save", variant: "primary" },
  submit: { icon: Check, verb: "Submit", variant: "primary" },
  edit: { icon: Pencil, verb: "Edit", variant: "secondary" },
  manage: { icon: Settings2, verb: "Manage", variant: "secondary" },
  delete: { icon: Trash2, verb: "Delete", variant: "danger" },
  remove: { icon: X, verb: "Remove", variant: "ghost" },
  cancel: { icon: null, verb: "Cancel", variant: "ghost" }
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  href?: string;
  loading?: boolean;
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
  iconOnly?: boolean;
  intent?: ButtonIntent;
  /**
   * Object/noun the action applies to (e.g. "Player" → "Add Player").
   * Use sentence case. Ignored if `children` is provided.
   */
  object?: string;
  /** Hide the intent's default icon (for cases where surrounding context already conveys it). */
  hideIntentIcon?: boolean;
  dropdown?: React.ReactNode;
  dropdownOnly?: boolean;
  dropdownPlacement?: DropdownPlacement;
  dropdownClassName?: string;
  dropdownOpen?: boolean;
  onDropdownOpenChange?: (open: boolean) => void;
}

const iconOnlyClasses =
  "h-8 w-8 shrink-0 rounded-full px-0 text-text-muted hover:bg-surface-muted hover:text-text [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0";

const chevronSizeClass: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-9 w-9",
  md: "h-10 w-10",
  lg: "h-11 w-11"
};

const Button = React.forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  (
    {
      children,
      className,
      href,
      loading = false,
      prefetch,
      replace,
      scroll,
      variant,
      size,
      iconOnly = false,
      intent,
      object,
      hideIntentIcon = false,
      dropdown,
      dropdownOnly = false,
      dropdownPlacement = "bottom-end",
      dropdownClassName,
      dropdownOpen,
      onDropdownOpenChange,
      onClick,
      ...props
    },
    ref
  ) => {
    const intentDef = intent ? intentRegistry[intent] : null;
    const resolvedVariant = variant ?? intentDef?.variant ?? (iconOnly ? "ghost" : undefined);
    const resolvedSizeProp = size ?? (iconOnly ? "sm" : undefined);
    const classes = cn(buttonVariants({ variant: resolvedVariant, size: resolvedSizeProp }), iconOnly ? iconOnlyClasses : undefined, className);

    const intentChildren = (() => {
      if (!intentDef) return null;
      const Icon = intentDef.icon;
      const label =
        children !== undefined && children !== null && children !== false
          ? children
          : object
            ? `${intentDef.verb} ${object}`
            : intentDef.verb;
      return (
        <>
          {Icon && !hideIntentIcon ? <Icon aria-hidden="true" /> : null}
          <span>{label}</span>
        </>
      );
    })();

    const baseChildren = intentChildren ?? children;
    const renderedChildren = (() => {
      if (!loading) return baseChildren;
      const spinner = <SpinnerIcon className="pointer-events-none h-4 w-4" key="loading-spinner" />;
      const arr = React.Children.toArray(baseChildren);
      const iconIndex = arr.findIndex((c) => React.isValidElement(c));
      if (iconIndex === -1) return [spinner, ...arr];
      const next = [...arr];
      next[iconIndex] = spinner;
      return next;
    })();
    const content = <span className="inline-flex items-center gap-2">{renderedChildren}</span>;

    const hasDropdown = dropdown !== undefined && dropdown !== null && dropdown !== false;
    const isControlled = dropdownOpen !== undefined;
    const [internalOpen, setInternalOpen] = React.useState(false);
    const open = isControlled ? Boolean(dropdownOpen) : internalOpen;
    const setOpen = React.useCallback(
      (next: boolean) => {
        if (!isControlled) setInternalOpen(next);
        onDropdownOpenChange?.(next);
      },
      [isControlled, onDropdownOpenChange]
    );

    const chevronRef = React.useRef<HTMLButtonElement | null>(null);
    const wrapperRef = React.useRef<HTMLDivElement | null>(null);
    const resolvedSize = size ?? "md";
    const chevronDims = chevronSizeClass[resolvedSize];

    const dropdownContent = React.Children.map(dropdown, (child) => {
      if (!React.isValidElement(child)) return child;
      const childProps = child.props as { onClick?: (event: React.MouseEvent) => void };
      const existingOnClick = childProps.onClick;
      return React.cloneElement(child as React.ReactElement<{ onClick?: (event: React.MouseEvent) => void }>, {
        onClick: (event: React.MouseEvent) => {
          existingOnClick?.(event);
          if (!event.defaultPrevented) setOpen(false);
        }
      });
    });

    if (hasDropdown && dropdownOnly) {
      const { disabled, type = "button", ...buttonProps } = props;
      return (
        <>
          <button
            aria-busy={loading || undefined}
            aria-expanded={open}
            aria-haspopup="menu"
            className={cn(classes, "pr-3")}
            disabled={disabled || loading}
            onClick={(event) => {
              onClick?.(event);
              if (!event.defaultPrevented) setOpen(!open);
            }}
            ref={(node) => {
              chevronRef.current = node;
              if (typeof ref === "function") ref(node);
              else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node;
            }}
            type={type}
            {...buttonProps}
          >
            <span className="inline-flex items-center gap-2">
              {renderedChildren}
              <ChevronDown className={cn("h-4 w-4 transition-transform", open ? "rotate-180" : "rotate-0")} />
            </span>
          </button>
          <Popover anchorRef={chevronRef} className={cn("min-w-[11rem] max-w-[15rem] space-y-1", dropdownClassName)} onClose={() => setOpen(false)} open={open} placement={dropdownPlacement}>
            {dropdownContent}
          </Popover>
        </>
      );
    }

    let mainNode: React.ReactNode;
    if (typeof href === "string") {
      const isDisabled = Boolean(props.disabled || loading);
      const { disabled: _disabled, type: _type, value: _value, ...buttonishProps } = props;
      const linkProps = buttonishProps as Omit<React.ComponentProps<typeof Link>, "href">;

      mainNode = (
        <Link
          aria-busy={loading || undefined}
          aria-disabled={isDisabled || undefined}
          className={cn(classes, hasDropdown ? "rounded-r-none pr-3" : undefined, isDisabled ? "pointer-events-none opacity-55" : undefined)}
          href={href}
          onClick={onClick as unknown as React.MouseEventHandler<HTMLAnchorElement>}
          prefetch={prefetch}
          ref={ref as React.Ref<HTMLAnchorElement>}
          replace={replace}
          scroll={scroll}
          tabIndex={isDisabled ? -1 : linkProps.tabIndex}
          {...linkProps}
        >
          {content}
        </Link>
      );
    } else {
      const { disabled, type = "button", ...buttonProps } = props;
      mainNode = (
        <button
          aria-busy={loading || undefined}
          className={cn(classes, hasDropdown ? "rounded-r-none pr-3" : undefined)}
          disabled={disabled || loading}
          onClick={onClick}
          ref={ref as React.Ref<HTMLButtonElement>}
          type={type}
          {...buttonProps}
        >
          {content}
        </button>
      );
    }

    if (!hasDropdown) {
      return mainNode;
    }

    return (
      <div className="inline-flex items-stretch" ref={wrapperRef}>
        {mainNode}
        <button
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Open menu"
          className={cn(
            buttonVariants({ variant, size }),
            "shrink-0 rounded-l-none border-l-0 px-0",
            chevronDims
          )}
          onClick={() => setOpen(!open)}
          ref={chevronRef}
          type="button"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", open ? "rotate-180" : "rotate-0")} />
        </button>
        <Popover anchorRef={chevronRef} className={cn("min-w-[11rem] max-w-[15rem] space-y-1", dropdownClassName)} onClose={() => setOpen(false)} open={open} placement={dropdownPlacement}>
          {dropdownContent}
        </Popover>
      </div>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
