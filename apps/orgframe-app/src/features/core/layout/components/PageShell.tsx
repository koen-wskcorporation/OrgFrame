import type * as React from "react";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { PageHeader } from "@orgframe/ui/primitives/page-header";

type PageShellProps = {
  title: React.ReactNode;
  description?: string;
  /** Buttons / controls rendered on the right of the page header. */
  actions?: React.ReactNode;
  /** Tabs / section nav pinned inside the sticky header. */
  tabs?: React.ReactNode;
  /** Extra classes applied to the outer PageStack. */
  className?: string;
  children: React.ReactNode;
};

/**
 * Sticky page header + a stack for the page's children. Children should
 * be one or more <ManageSection>s. The stack hugs content by default and
 * pins to the viewport when any descendant uses `fill` (e.g. a map).
 */
export function PageShell({ title, description, actions, tabs, className, children }: PageShellProps) {
  return (
    <PageStack className={className}>
      <PageHeader actions={actions} description={description} showBorder={false} tabs={tabs} title={title} />
      {children}
    </PageStack>
  );
}
