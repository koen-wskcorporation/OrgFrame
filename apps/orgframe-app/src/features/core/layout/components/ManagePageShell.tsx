import type * as React from "react";
import { ManagePageContent, PageStack } from "@orgframe/ui/primitives/layout";
import { PageHeader } from "@orgframe/ui/primitives/page-header";

type ManagePageShellProps = {
  title: React.ReactNode;
  description?: string;
  /** Buttons / controls rendered on the right of the page header. */
  actions?: React.ReactNode;
  /** Tabs / section nav pinned inside the sticky header. */
  tabs?: React.ReactNode;
  /**
   * "standard" (default) — wraps children in a ManagePageContent card.
   * "workspace" — renders children directly (no card); for full-height
   *   interactive workspaces like Calendar, Inbox, and SmartImport.
   */
  variant?: "standard" | "workspace";
  /** Apply the standard card padding + vertical spacing (p-5 md:p-6 space-y-4) to children. Only applies to "standard" variant. */
  padded?: boolean;
  /** Extra classes applied to the outer PageStack (e.g. fill-height overrides for workspace pages). */
  className?: string;
  children: React.ReactNode;
};

export function ManagePageShell({
  title,
  description,
  actions,
  tabs,
  variant = "standard",
  padded = false,
  className,
  children
}: ManagePageShellProps) {
  return (
    <PageStack className={className}>
      <PageHeader
        actions={actions}
        description={description}
        showBorder={false}
        tabs={tabs}
        title={title}
      />
      {variant === "workspace" ? children : (
        <ManagePageContent className={padded ? "p-5 md:p-6 space-y-4" : undefined}>
          {children}
        </ManagePageContent>
      )}
    </PageStack>
  );
}
