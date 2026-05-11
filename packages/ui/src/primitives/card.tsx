import * as React from "react";
import { cn } from "./utils";

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function Card({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn("rounded-card border bg-surface text-text shadow-card", className)}
        {...props}
      />
    );
  }
);

/**
 * Empty-state card — a dashed, low-emphasis surface used to advertise
 * something the user can create or connect that doesn't exist yet
 * (e.g. "no registration form connected"). Same padding/shape as Card,
 * but no shadow and a dashed muted border.
 */
export const GhostCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function GhostCard({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-card border border-dashed border-border bg-surface-muted/40 text-text",
          className
        )}
        {...props}
      />
    );
  }
);

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-1.5 px-5 pb-4 pt-5 md:px-6 md:pb-5 md:pt-6", className)} {...props} />;
}

export function CardHeaderCompact({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-1.5 px-5 pb-2 pt-5 md:px-6 md:pb-3 md:pt-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-[1.075rem] font-semibold leading-tight text-text", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm leading-relaxed text-text-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5 md:px-6 md:pb-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-4 flex items-center justify-end gap-2 border-t px-5 py-4 md:px-6", className)} {...props} />;
}

type CardHeaderRowProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  copyClassName?: string;
  actionsClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
};

export function CardHeaderRow({
  title,
  description,
  actions,
  className,
  copyClassName,
  actionsClassName,
  titleClassName,
  descriptionClassName
}: CardHeaderRowProps) {
  return (
    <div className={cn("ui-card-header-row", className)}>
      <div className={cn("ui-card-header-copy", copyClassName)}>
        <CardTitle className={titleClassName}>{title}</CardTitle>
        {description ? <CardDescription className={descriptionClassName}>{description}</CardDescription> : null}
      </div>
      {actions ? <div className={cn("shrink-0", actionsClassName)}>{actions}</div> : null}
    </div>
  );
}
