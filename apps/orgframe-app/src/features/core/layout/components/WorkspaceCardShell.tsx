"use client";

import { Card, CardContent, CardHeader, CardHeaderRow } from "@orgframe/ui/primitives/card";
import { cn } from "@orgframe/ui/primitives/utils";

type WorkspaceCardShellProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  headerClassName?: string;
};

export function WorkspaceCardShell({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
  headerClassName
}: WorkspaceCardShellProps) {
  return (
    <Card className={className}>
      <CardHeader className={headerClassName}>
        <CardHeaderRow actions={actions} description={description} title={title} />
      </CardHeader>
      <CardContent className={cn(contentClassName)}>{children}</CardContent>
    </Card>
  );
}
