import type * as React from "react";
import { cn } from "@orgframe/ui/primitives/utils";
import { PageHeader } from "@orgframe/ui/primitives/page-header";

type PageShellProps = {
  title: React.ReactNode;
  description?: string;
  /** Buttons / controls rendered on the right of the page header. */
  actions?: React.ReactNode;
  /** Tabs / section nav pinned inside the sticky header. */
  tabs?: React.ReactNode;
  /** Extra classes applied to the page stack. */
  className?: string;
  children: React.ReactNode;
};

/**
 * Sticky page header + a stack for the page's children. Children should
 * be one or more <Section>s. The stack hugs content by default and pins
 * to the viewport when any descendant Section uses `fill` (the
 * `app-page-stack:has(.app-card-fill)` rule in globals.css switches
 * min-height → height so fill-mode sections have a definite parent).
 */
export function PageShell({ title, description, actions, tabs, className, children }: PageShellProps) {
  return (
    <div className={cn("app-page-stack", className)}>
      <PageHeader actions={actions} description={description} showBorder={false} tabs={tabs} title={title} />
      {children}
    </div>
  );
}
