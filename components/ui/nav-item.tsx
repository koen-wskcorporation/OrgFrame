"use client";

import Link from "next/link";
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const navItemVariants = cva(
  "relative inline-flex items-center justify-between gap-2 overflow-hidden rounded-control border border-transparent font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-55",
  {
    variants: {
      variant: {
        sidebar: "w-full",
        header: "shrink-0",
        dropdown: "w-full"
      },
      size: {
        sm: "min-h-9 px-3 py-2 text-sm",
        md: "min-h-10 px-3 py-2 text-sm"
      },
      active: {
        true: "",
        false: ""
      }
    },
    compoundVariants: [
      {
        active: true,
        variant: "sidebar",
        className: "border-border bg-surface text-text"
      },
      {
        active: false,
        variant: "sidebar",
        className: "text-text-muted hover:border-border/70 hover:bg-surface hover:text-text"
      },
      {
        active: true,
        variant: "header",
        className: "border-border/70 bg-surface-muted text-text"
      },
      {
        active: false,
        variant: "header",
        className: "text-text-muted hover:border-border/60 hover:bg-surface-muted hover:text-text"
      },
      {
        active: true,
        variant: "dropdown",
        className: "border-border/70 bg-surface-muted text-text"
      },
      {
        active: false,
        variant: "dropdown",
        className: "text-text-muted hover:border-border/60 hover:bg-surface-muted hover:text-text"
      }
    ],
    defaultVariants: {
      active: false,
      size: "md",
      variant: "sidebar"
    }
  }
);

type NavItemVariantProps = VariantProps<typeof navItemVariants>;

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
  size?: NavItemVariantProps["size"];
  target?: React.AnchorHTMLAttributes<HTMLAnchorElement>["target"];
  title?: string;
  type?: "button" | "submit" | "reset";
  variant?: NavItemVariantProps["variant"];
};

function NavItemInner({
  active,
  accentWhenActive,
  children,
  contentClassName,
  icon,
  iconOnly,
  rightSlot,
  variant
}: Pick<NavItemProps, "active" | "accentWhenActive" | "children" | "contentClassName" | "icon" | "iconOnly" | "rightSlot" | "variant">) {
  const showAccent = Boolean(active && accentWhenActive);
  const iconNode = icon ? <span className={cn("shrink-0 text-current [&_svg]:h-4 [&_svg]:w-4", variant === "header" ? "opacity-90" : "")}>{icon}</span> : null;

  if (iconOnly) {
    return (
      <>
        {showAccent ? <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[4px] rounded-r bg-accent" /> : null}
        <span className={cn("flex h-full w-full items-center justify-center", contentClassName)}>{iconNode}</span>
      </>
    );
  }

  return (
    <>
      {showAccent ? <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[4px] rounded-r bg-accent" /> : null}
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
  accentWhenActive,
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
  const resolvedAccentWhenActive = accentWhenActive ?? variant === "sidebar";
  const resolvedAriaCurrent = ariaCurrent ?? (href && active ? "page" : undefined);
  const classes = cn(navItemVariants({ active, size, variant }), className);
  const inner = (
    <NavItemInner
      accentWhenActive={resolvedAccentWhenActive}
      active={active}
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

export { navItemVariants };
