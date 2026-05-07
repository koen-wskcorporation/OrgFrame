"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import * as React from "react";
import { Chip } from "@orgframe/ui/primitives/chip";
import { Button } from "@orgframe/ui/primitives/button";
import { cn } from "@orgframe/ui/primitives/utils";

type OrgAreaSidebarShellProps = {
  children: React.ReactNode;
  mobile?: boolean;
  collapsed?: boolean;
  className?: string;
};

export function OrgAreaSidebarShell({ children, mobile = false, collapsed = false, className }: OrgAreaSidebarShellProps) {
  return (
    <aside
      className={cn(
        "border border-border bg-surface transition-[width,padding,border-radius] duration-200",
        mobile ? "rounded-card p-4 shadow-card" : collapsed ? "w-20 rounded-card p-4 shadow-card" : "w-[280px] rounded-card p-4 shadow-card",
        className
      )}
    >
      {children}
    </aside>
  );
}

type OrgAreaSidebarHeaderProps = {
  title: string;
  subtitle?: string;
  roleChipLabel?: string;
  show?: boolean;
  collapsed?: boolean;
  canCollapse?: boolean;
  onCollapse?: () => void;
  onExpand?: () => void;
};

export function OrgAreaSidebarHeader({
  title,
  roleChipLabel,
  show = true,
  collapsed = false,
  canCollapse = false,
  onCollapse,
  onExpand
}: OrgAreaSidebarHeaderProps) {
  if (!show) {
    return null;
  }

  if (collapsed && canCollapse) {
    return (
      <>
        <header className="flex min-h-[44px] items-center justify-center">
          <Button iconOnly aria-label="Expand sidebar" onClick={onExpand}>
            <PanelLeftOpen />
          </Button>
        </header>
        <div className="my-3 border-t border-border/80" />
      </>
    );
  }

  return (
    <>
      <header className="flex min-h-[44px] items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold leading-tight tracking-tight text-text">{title}</h2>
            {roleChipLabel ? (
              <Chip status={false} variant="neutral">{roleChipLabel}</Chip>
            ) : null}
          </div>
        </div>
        {canCollapse ? (
          <Button iconOnly aria-label="Collapse sidebar" onClick={onCollapse}>
            <PanelLeftClose />
          </Button>
        ) : null}
      </header>
      <div className="my-3 border-t border-border/80" />
    </>
  );
}

type OrgAreaSidebarSectionProps = {
  title: string;
  children: React.ReactNode;
  className?: string;
};

export function OrgAreaSidebarSection({ title, children, className }: OrgAreaSidebarSectionProps) {
  return (
    <section className={cn("space-y-2", className)}>
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</p>
      {children}
    </section>
  );
}
