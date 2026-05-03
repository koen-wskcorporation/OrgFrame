import Link from "next/link";
import { BarChart3, Users, FileText, CreditCard, Calendar, Map as MapIcon, Inbox, Layout as LayoutIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import type { ResolvedDataSource } from "@/src/features/data-center/registry/types";

function iconFor(name: string) {
  switch (name) {
    case "users":
      return Users;
    case "file-text":
      return FileText;
    case "credit-card":
      return CreditCard;
    case "calendar":
      return Calendar;
    case "map":
      return MapIcon;
    case "inbox":
      return Inbox;
    case "layout":
      return LayoutIcon;
    default:
      return BarChart3;
  }
}

type SourcePickerProps = {
  orgSlug: string;
  toolSources: ResolvedDataSource[];
  entitySources: ResolvedDataSource[];
};

function SourceCard({ orgSlug, source }: { orgSlug: string; source: ResolvedDataSource }) {
  const Icon = iconFor(source.icon);
  return (
    <Link
      href={`/${orgSlug}/manage/data-center/${encodeURIComponent(source.fqKey)}`}
      className="group rounded-lg border border-border bg-surface-panel p-4 transition hover:border-accent hover:shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-muted text-text">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium text-text group-hover:text-accent">{source.label}</p>
          {source.description && <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">{source.description}</p>}
          <p className="mt-2 text-[11px] uppercase tracking-wide text-text-muted">
            {source.dashboards.length} dashboard{source.dashboards.length === 1 ? "" : "s"} • {source.tables.length} table{source.tables.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>
    </Link>
  );
}

export function SourcePicker({ orgSlug, toolSources, entitySources }: SourcePickerProps) {
  const groupedEntities = new Map<string, ResolvedDataSource[]>();
  for (const s of entitySources) {
    const type = s.entityType ?? "other";
    const bucket = groupedEntities.get(type) ?? [];
    bucket.push(s);
    groupedEntities.set(type, bucket);
  }
  const entityGroupLabels: Record<string, string> = {
    program: "Per-program dashboards",
    team: "Per-team dashboards",
    facility: "Per-facility dashboards",
    division: "Per-division dashboards",
  };

  return (
    <div className="space-y-8">
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Tools</CardTitle>
            <CardDescription>Unified dashboards for each area of your organization.</CardDescription>
          </CardHeader>
          <CardContent>
            {toolSources.length === 0 ? (
              <p className="text-sm text-text-muted">No tool dashboards available for your role.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {toolSources.map((src) => (
                  <SourceCard key={src.fqKey} orgSlug={orgSlug} source={src} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {Array.from(groupedEntities.entries()).map(([type, sources]) => (
        <section key={type}>
          <Card>
            <CardHeader>
              <CardTitle>{entityGroupLabels[type] ?? `${type} dashboards`}</CardTitle>
              <CardDescription>Auto-generated — one per entity.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sources.map((src) => (
                  <SourceCard key={src.fqKey} orgSlug={orgSlug} source={src} />
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      ))}
    </div>
  );
}
