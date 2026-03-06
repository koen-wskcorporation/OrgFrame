"use client";

import Link from "next/link";
import * as React from "react";
import { cn } from "@/lib/utils";

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

export type NavItemProps = {
  active?: boolean;
  accentWhenActive?: boolean;
  ariaLabel?: string;
  ariaControls?: string;
  ariaCurrent?: React.AriaAttributes["aria-current"];
  ariaExpanded?: boolean;
  ariaHaspopup?: React.AriaAttributes["aria-haspopup"];
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
  href?: string;
  icon?: React.ReactNode;
  iconOnly?: boolean;
  onClick?: React.MouseEventHandler<HTMLAnchorElement | HTMLButtonElement>;
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
  rightSlot,
  variant
}: Pick<NavItemProps, "children" | "contentClassName" | "icon" | "iconOnly" | "rightSlot" | "variant">) {
  const iconNode = icon ? <span className="shrink-0 text-current [&_svg]:h-4 [&_svg]:w-4">{icon}</span> : null;

  if (iconOnly) {
    return (
      <>
        <span className={cn("flex h-full w-full items-center justify-center", contentClassName)}>{iconNode}</span>
      </>
    );
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
  href,
  icon,
  iconOnly = false,
  onClick,
  rel,
  rightSlot,
  role,
  size = "md",
  target,
  title,
  type = "button",
  variant = "sidebar"
}: NavItemProps) {
  const resolvedAriaCurrent = ariaCurrent ?? (href && active ? "page" : undefined);
  const classes = cn(
    "inline-flex items-center justify-between gap-2 whitespace-nowrap rounded-full border border-transparent text-sm font-semibold leading-none transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-55",
    navItemSizeClass[size],
    navItemVariantClass[variant],
    active ? "border-border bg-surface text-text shadow-sm" : "bg-transparent text-text-muted hover:border-border/60 hover:bg-surface-muted hover:text-text",
    className
  );
  const inner = (
    <NavItemInner
      contentClassName={contentClassName}
      icon={icon}
      iconOnly={iconOnly}
      rightSlot={rightSlot}
      variant={variant}
    >
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
      onClick={onClick}
      role={role}
      title={title}
      type={type}
    >
      {inner}
    </button>
  );
}
