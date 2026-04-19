import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";
import { cn } from "./utils";

type PersonCardSection = {
  key: string;
  title: string;
  content: React.ReactNode;
};

export type PersonCardProps = {
  name: string;
  subtitle?: string | null;
  avatarUrl?: string | null;
  showIdentityHeader?: boolean;
  badges?: React.ReactNode[];
  actions?: React.ReactNode;
  sections?: PersonCardSection[];
  children?: React.ReactNode;
  className?: string;
  layout?: "default" | "panel-edge";
};

function initialsFor(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "??";
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "??";
}

export function PersonCard({
  name,
  subtitle,
  avatarUrl,
  showIdentityHeader = true,
  badges = [],
  actions,
  sections = [],
  children,
  className,
  layout = "default"
}: PersonCardProps) {
  const initials = initialsFor(name);
  const panelEdge = layout === "panel-edge";

  return (
    <Card className={cn(panelEdge ? "rounded-none border-0 shadow-none" : "", className)}>
      {showIdentityHeader ? (
        <CardHeader className={cn(panelEdge ? "px-5 py-3 md:px-6" : "")}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {avatarUrl ? (
                <img alt={`${name} avatar`} className="h-10 w-10 rounded-full border object-cover" src={avatarUrl} />
              ) : (
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border bg-surface-muted text-sm font-semibold text-text-muted">{initials}</div>
              )}
              <div className="min-w-0">
                <CardTitle className="truncate">{name}</CardTitle>
                {subtitle ? <CardDescription className="truncate">{subtitle}</CardDescription> : null}
              </div>
            </div>
            {actions ? <div className="shrink-0">{actions}</div> : null}
          </div>
          {badges.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {badges.map((badge, index) => (
                <span key={`badge-${index}`}>{badge}</span>
              ))}
            </div>
          ) : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn("space-y-4", panelEdge ? "px-5 pb-4 pt-0 md:px-6" : "")}>
        {sections.map((section) => (
          <div className="space-y-2 rounded-control border bg-surface-muted/40 p-4" key={section.key}>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{section.title}</p>
            <div className="text-sm">{section.content}</div>
          </div>
        ))}
        {children}
      </CardContent>
    </Card>
  );
}
