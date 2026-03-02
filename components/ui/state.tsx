import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type CenteredStateCardProps = {
  title: string;
  description: string;
  actions?: React.ReactNode;
  className?: string;
  contentClassName?: string;
};

export function CenteredStateCard({ title, description, actions, className, contentClassName }: CenteredStateCardProps) {
  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {actions ? <CardContent className={cn("flex flex-wrap items-center gap-2", contentClassName)}>{actions}</CardContent> : null}
    </Card>
  );
}

type InlineEmptyStateProps = {
  title: string;
  description: string;
  actions?: React.ReactNode;
  className?: string;
};

export function InlineEmptyState({ title, description, actions, className }: InlineEmptyStateProps) {
  return (
    <Card className={cn("border-dashed bg-surface-muted/35", className)}>
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {actions ? <CardContent className="flex flex-wrap items-center gap-2 pt-0">{actions}</CardContent> : null}
    </Card>
  );
}
