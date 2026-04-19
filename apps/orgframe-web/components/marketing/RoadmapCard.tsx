import type { RoadmapEntry } from "@/src/shared/marketing/roadmap";
import { StatusBadge } from "./StatusBadge";

const MODULE_LABEL: Record<RoadmapEntry["module"], string> = {
  people: "People",
  programs: "Programs",
  calendar: "Calendar",
  forms: "Forms",
  payments: "Payments",
  facilities: "Facilities",
  events: "Events",
  communications: "Communications",
  site: "Site",
  imports: "Imports",
  domains: "Domains",
  workspace: "Workspace",
  platform: "Platform"
};

export function RoadmapCard({ entry, compact = false }: { entry: RoadmapEntry; compact?: boolean }) {
  return (
    <article
      className={`flex flex-col gap-3 rounded-[20px] border border-[hsl(var(--rule))] bg-[hsl(var(--paper-2))] p-5 transition-colors hover:border-[hsl(var(--rule-strong))] ${
        compact ? "" : "md:p-6"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow">{MODULE_LABEL[entry.module]}</span>
        <StatusBadge status={entry.status} />
      </div>
      <h3 className="text-base font-semibold leading-snug tracking-tight text-[hsl(var(--ink))] md:text-[17px]">{entry.title}</h3>
      <p className="text-sm leading-relaxed text-[hsl(var(--muted-ink))]">{entry.description}</p>
      {entry.targetQuarter || entry.shippedOn ? (
        <div className="mt-1 text-xs text-[hsl(var(--muted-ink))]">
          {entry.shippedOn ? `Shipped ${formatDate(entry.shippedOn)}` : `Target: ${entry.targetQuarter}`}
        </div>
      ) : null}
    </article>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
