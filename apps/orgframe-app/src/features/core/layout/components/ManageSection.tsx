"use client";

import { Card, CardContent, CardHeader, CardHeaderRow } from "@orgframe/ui/primitives/card";
import { cn } from "@orgframe/ui/primitives/utils";

type ManageSectionProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
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

export function ManageSection({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
  headerClassName,
  fill = true
}: ManageSectionProps) {
  return (
    <Card className={cn(fill ? "app-card-fill" : null, className)}>
      <CardHeader className={cn(fill ? "app-card-fill__header" : null, headerClassName)}>
        <CardHeaderRow actions={actions} description={description} title={title} />
      </CardHeader>
      <CardContent className={cn(fill ? "app-card-fill__content" : null, contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}
