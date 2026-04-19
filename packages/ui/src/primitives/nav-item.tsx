"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import * as React from "react";
import { Button } from "./button";
import { Popover } from "./popover";
import { cn } from "./utils";

const navItemSizeClass = {
  sm: "h-9 px-3",
  md: "h-10 px-3"
} as const;

const navItemVariantClass = {
  sidebar: "w-full",
  header: "shrink-0",
  dropdown: "w-full"
} as const;

type NavItemSize = keyof typeof navItemSizeClass;
type NavItemVariant = keyof typeof navItemVariantClass;
type DropdownPlacement = "bottom-start" | "bottom-end" | "top-start" | "top-end";
type NavItemOrientation = "horizontal" | "vertical";
type ChevronPosition = "start" | "end";

function defaultOrientationFor(variant: NavItemVariant): NavItemOrientation {
  return variant === "header" ? "horizontal" : "vertical";
}

export type NavItemProps = {
  active?: boolean;
  accentWhenActive?: boolean;
  ariaLabel?: string;
  ariaControls?: string;
  ariaCurrent?: React.AriaAttributes["aria-current"];
  ariaExpanded?: boolean;
  ariaHaspopup?: React.AriaAttributes["aria-haspopup"];
  children?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
  dropdown?: React.ReactNode;
  dropdownOpen?: boolean;
  onDropdownOpenChange?: (open: boolean) => void;
  dropdownPlacement?: DropdownPlacement;
  dropdownClassName?: string;
  /**
   * Where to place the dropdown chevron inside the pill.
   * Defaults to "end".
   */
  chevronPosition?: ChevronPosition;
  /**
   * Layout orientation for this nav item's dropdown.
   * - "horizontal": dropdown opens as a popover (default for variant="header").
   * - "vertical": dropdown renders inline as nested indented items beneath the trigger
   *   (default for variant="sidebar" and variant="dropdown").
   */
  orientation?: NavItemOrientation;
  href?: string;
  icon?: React.ReactNode;
  iconOnly?: boolean;
  onClick?: React.MouseEventHandler<HTMLAnchorElement | HTMLButtonElement>;
  onMouseDown?: React.MouseEventHandler<HTMLAnchorElement | HTMLButtonElement>;
  prefetch?: boolean;
  rel?: React.AnchorHTMLAttributes<HTMLAnchorElement>["rel"];
  rightSlot?: React.ReactNode;
  role?: React.AriaRole;
  size?: NavItemSize;
  target?: React.AnchorHTMLAttributes<HTMLAnchorElement>["target"];
  title?: string;
  type?: "button" | "submit" | "reset";
  variant?: NavItemVariant;
};

function NavItemInner({
  children,
  contentClassName,
  icon,
  iconOnly,
  rightSlot
}: Pick<NavItemProps, "children" | "contentClassName" | "icon" | "iconOnly" | "rightSlot">) {
  const iconNode = icon ? <span className="shrink-0 text-current [&_svg]:h-4 [&_svg]:w-4">{icon}</span> : null;

  if (iconOnly) {
    return <span className={cn("flex h-full w-full items-center justify-center", contentClassName)}>{iconNode}</span>;
  }

  return (
    <>
      <span className={cn("flex min-w-0 items-center gap-2", contentClassName)}>
        {iconNode}
        <span className="truncate">{children}</span>
      </span>
      {rightSlot ? <span className="ml-2 shrink-0">{rightSlot}</span> : null}
    </>
  );
}

function useDropdownState(controlledOpen: boolean | undefined, onOpenChange: ((open: boolean) => void) | undefined) {
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = isControlled ? Boolean(controlledOpen) : internalOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );
  return [open, setOpen] as const;
}

function wrapDropdownChildren(dropdown: React.ReactNode, setOpen: (open: boolean) => void) {
  return React.Children.map(dropdown, (child) => {
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
}

function navItemClasses(active: boolean, size: NavItemSize, variant: NavItemVariant, className?: string) {
  return cn(
    "inline-flex items-center justify-between gap-2 whitespace-nowrap rounded-full border border-transparent text-sm font-semibold leading-none transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-55",
    navItemSizeClass[size],
    navItemVariantClass[variant],
    active
      ? "border-border bg-surface text-text shadow-sm"
      : "bg-transparent text-text-muted hover:border-border/60 hover:bg-surface-muted hover:text-text",
    className
  );
}

export function NavItem({
  active = false,
  ariaLabel,
  ariaControls,
  ariaCurrent,
  ariaExpanded,
  ariaHaspopup,
  children,
  className,
  contentClassName,
  disabled = false,
  dropdown,
  dropdownOpen,
  onDropdownOpenChange,
  dropdownPlacement = "bottom-end",
  dropdownClassName,
  chevronPosition = "end",
  orientation,
  href,
  icon,
  iconOnly = false,
  onClick,
  onMouseDown,
  prefetch,
  rel,
  rightSlot,
  role,
  size = "md",
  target,
  title,
  type = "button",
  variant = "sidebar"
}: NavItemProps) {
  const hasDropdown = dropdown !== undefined && dropdown !== null && dropdown !== false;
  const [open, setOpen] = useDropdownState(dropdownOpen, onDropdownOpenChange);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);

  const resolvedAriaCurrent = ariaCurrent ?? (href && active ? "page" : undefined);
  const classes = navItemClasses(active || (hasDropdown && open), size, variant, className);

  // When dropdown is provided, render the NavItem as one pill with an icon-only chevron button
  // positioned inside the pill. The pill navigates via href; the chevron toggles.
  // - horizontal orientation: dropdown opens in a Popover.
  // - vertical orientation: dropdown renders inline as nested indented items below the trigger.
  if (hasDropdown) {
    const resolvedOrientation: NavItemOrientation = orientation ?? defaultOrientationFor(variant);
    const dropdownContent = wrapDropdownChildren(dropdown, setOpen);
    const popoverClasses = cn("min-w-[220px] space-y-1", dropdownClassName);
    const chevronAtStart = chevronPosition === "start";
    const chevronInsetClass = chevronAtStart
      ? size === "sm" ? "left-0.5" : "left-1"
      : size === "sm" ? "right-0.5" : "right-1";
    const pillPaddingClass = chevronAtStart
      ? size === "sm" ? "pl-10" : "pl-11"
      : size === "sm" ? "pr-10" : "pr-11";
    const dropdownPillClasses = cn(
      navItemClasses(active || open, size, variant, className),
      // Reserve space for the inset chevron so label/icon don't collide with it.
      pillPaddingClass
    );
    const innerNode = (
      <NavItemInner contentClassName={contentClassName} icon={icon} iconOnly={iconOnly} rightSlot={rightSlot}>
        {children}
      </NavItemInner>
    );
    const chevronButton = (
      <Button
        iconOnly
        aria-controls={ariaControls}
        aria-expanded={open}
        aria-haspopup={resolvedOrientation === "horizontal" ? "menu" : undefined}
        aria-label={`${typeof children === "string" ? children : ariaLabel ?? "Menu"} menu`}
        className={cn("absolute top-1/2 -translate-y-1/2 z-10", chevronInsetClass)}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(!open);
        }}
        ref={triggerRef}
      >
        <ChevronDown
          className={cn(
            "transition-transform",
            // In vertical mode the chevron rotates to point right when collapsed and down when open,
            // matching the typical disclosure-triangle convention for nested trees.
            resolvedOrientation === "vertical"
              ? open ? "rotate-0" : "-rotate-90"
              : open ? "rotate-180" : "rotate-0"
          )}
        />
      </Button>
    );

    const pill =
      href && !disabled ? (
        <Link
          aria-current={resolvedAriaCurrent}
          aria-label={ariaLabel}
          className={dropdownPillClasses}
          href={href}
          onClick={onClick}
          onMouseDown={onMouseDown}
          prefetch={prefetch}
          rel={rel}
          role={role}
          target={target}
          title={title}
        >
          {innerNode}
        </Link>
      ) : (
        <button
          aria-current={resolvedAriaCurrent}
          aria-label={ariaLabel}
          className={dropdownPillClasses}
          disabled={disabled}
          onClick={onClick as React.MouseEventHandler<HTMLButtonElement> | undefined}
          onMouseDown={onMouseDown as React.MouseEventHandler<HTMLButtonElement> | undefined}
          role={role}
          title={title}
          type={type}
        >
          {innerNode}
        </button>
      );

    const triggerRow = (
      <span className={cn("relative items-stretch", variant === "header" ? "inline-flex" : "flex", navItemVariantClass[variant])}>
        {pill}
        {chevronButton}
      </span>
    );

    if (resolvedOrientation === "vertical") {
      return (
        <div className={cn("flex flex-col", variant === "header" ? undefined : "w-full")}>
          {triggerRow}
          {open ? (
            <div className={cn("mt-1 flex flex-col gap-1 border-l border-border/40 pl-2 ml-3", dropdownClassName)} role="group">
              {dropdownContent}
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <>
        {triggerRow}
        <Popover
          anchorRef={triggerRef}
          className={popoverClasses}
          onClose={() => setOpen(false)}
          open={open}
          placement={dropdownPlacement}
        >
          {dropdownContent}
        </Popover>
      </>
    );
  }

  const inner = (
    <NavItemInner contentClassName={contentClassName} icon={icon} iconOnly={iconOnly} rightSlot={rightSlot}>
      {children}
    </NavItemInner>
  );

  if (href && !disabled) {
    return (
      <Link
        aria-label={ariaLabel}
        aria-controls={ariaControls}
        aria-current={resolvedAriaCurrent}
        aria-expanded={ariaExpanded}
        aria-haspopup={ariaHaspopup}
        className={classes}
        href={href}
        onClick={onClick}
        onMouseDown={onMouseDown}
        prefetch={prefetch}
        rel={rel}
        role={role}
        target={target}
        title={title}
      >
        {inner}
      </Link>
    );
  }

  if (href && disabled) {
    return (
      <div
        aria-label={ariaLabel}
        aria-controls={ariaControls}
        aria-current={resolvedAriaCurrent}
        aria-disabled="true"
        aria-expanded={ariaExpanded}
        aria-haspopup={ariaHaspopup}
        className={cn(classes, "opacity-55")}
        role={role}
        title={title}
      >
        {inner}
      </div>
    );
  }

  return (
    <button
      aria-label={ariaLabel}
      aria-controls={ariaControls}
      aria-current={resolvedAriaCurrent}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHaspopup}
      className={classes}
      disabled={disabled}
      onClick={onClick as React.MouseEventHandler<HTMLButtonElement> | undefined}
      onMouseDown={onMouseDown as React.MouseEventHandler<HTMLButtonElement> | undefined}
      role={role}
      title={title}
      type={type}
    >
      {inner}
    </button>
  );
}
