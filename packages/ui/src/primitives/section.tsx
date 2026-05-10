import * as React from "react";
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
  return (
    <Card className={cn(fill ? "app-card-fill" : null, className)}>
      <CardHeader className={cn(fill ? "app-card-fill__header" : null, headerClassName)}>
        <CardHeaderRow actions={actions} description={description} title={title} />
      </CardHeader>
      {children !== undefined ? (
        <CardContent className={cn(fill ? "app-card-fill__content" : null, contentClassName)}>
          {children}
        </CardContent>
      ) : null}
    </Card>
  );
}
