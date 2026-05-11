"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Card, CardContent, CardHeader, CardHeaderRow } from "./card";
import { cn } from "./utils";

type SectionProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  headerClassName?: string;
  /**
   * When true (default) the card fills the viewport (minus sticky chrome
   * and bottom gutter). Header stays its natural height; content scrolls
   * internally. As page-header tabs compact on scroll, the card grows to
   * reclaim the space. Pass `fill={false}` for cards that should size to
   * their content (printable views, embedded marketing previews).
   */
  fill?: boolean;
};

const SectionActionsHostContext = React.createContext<HTMLElement | null>(null);

/**
 * Slot for action buttons inside a `<Section>`. Render anywhere within
 * the Section's children — even deep inside descendant components — and
 * the buttons are portaled into the header's standard actions area. Use
 * this instead of rendering buttons in the body so every Section header
 * has its action affordance in the same canonical position.
 */
export function SectionActions({ children }: { children?: React.ReactNode }) {
  const host = React.useContext(SectionActionsHostContext);
  if (!host || children === undefined || children === null) return null;
  return createPortal(<>{children}</>, host);
}
SectionActions.displayName = "Section.Actions";

export function Section({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
  headerClassName,
  fill = true
}: SectionProps) {
  const [host, setHost] = React.useState<HTMLElement | null>(null);
  return (
    <Card className={cn(fill ? "app-card-fill" : null, className)}>
      <CardHeader className={cn(fill ? "app-card-fill__header" : null, headerClassName)}>
        <CardHeaderRow
          actions={
            <div className="flex items-center gap-2">
              {actions}
              <span ref={setHost} className="contents" />
            </div>
          }
          description={description}
          title={title}
        />
      </CardHeader>
      {children !== undefined ? (
        <CardContent className={cn(fill ? "app-card-fill__content" : null, contentClassName)}>
          <SectionActionsHostContext.Provider value={host}>{children}</SectionActionsHostContext.Provider>
        </CardContent>
      ) : null}
    </Card>
  );
}

Section.Actions = SectionActions;
