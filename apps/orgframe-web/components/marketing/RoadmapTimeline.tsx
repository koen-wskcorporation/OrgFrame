import type { RoadmapEntry, RoadmapStatus } from "@/src/shared/marketing/roadmap";
import { groupByStatus } from "@/src/shared/marketing/roadmap";
import { RoadmapCard } from "./RoadmapCard";
import { StatusBadge } from "./StatusBadge";

interface LaneMeta {
  key: Exclude<RoadmapStatus, "shipped">;
  title: string;
  caption: string;
}

const LANES: LaneMeta[] = [
  { key: "in-progress", title: "Now", caption: "What we're actively building." },
  { key: "next", title: "Next", caption: "Committed for the upcoming quarter." },
  { key: "later", title: "Later", caption: "On the horizon. Directions, not dates." }
];

export function RoadmapTimeline({ entries }: { entries: ReadonlyArray<RoadmapEntry> }) {
  const groups = groupByStatus(entries);

  return (
    <div className="flex flex-col gap-16">
      <div className="grid gap-10 lg:grid-cols-3 lg:gap-8">
        {LANES.map((lane) => (
          <section key={lane.key} className="flex flex-col gap-6">
            <div className="flex flex-col gap-2 border-b border-[hsl(var(--rule))] pb-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold tracking-tight text-[hsl(var(--ink))]">{lane.title}</h2>
                <StatusBadge status={lane.key} withDot={false} />
              </div>
              <p className="text-sm text-[hsl(var(--muted-ink))]">{lane.caption}</p>
            </div>
            <ul className="flex flex-col gap-4">
              {groups[lane.key].map((entry) => (
                <li key={entry.id} id={entry.module}>
                  <RoadmapCard entry={entry} />
                </li>
              ))}
              {groups[lane.key].length === 0 ? (
                <li className="rounded-[20px] border border-dashed border-[hsl(var(--rule))] p-6 text-sm text-[hsl(var(--muted-ink))]">
                  Nothing here yet.
                </li>
              ) : null}
            </ul>
          </section>
        ))}
      </div>

      {groups.shipped.length > 0 ? (
        <details className="group rounded-[28px] border border-[hsl(var(--rule))] bg-[hsl(var(--paper-2))] open:bg-[hsl(var(--paper-2))]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 [&::-webkit-details-marker]:hidden md:px-8">
            <div className="flex items-center gap-3">
              <StatusBadge status="shipped" />
              <span className="text-base font-semibold tracking-tight text-[hsl(var(--ink))] md:text-lg">
                Shipped — {groups.shipped.length} released
              </span>
            </div>
            <span className="text-xs uppercase tracking-[0.12em] text-[hsl(var(--muted-ink))] group-open:hidden">Expand</span>
            <span className="hidden text-xs uppercase tracking-[0.12em] text-[hsl(var(--muted-ink))] group-open:inline">Collapse</span>
          </summary>
          <div className="border-t border-[hsl(var(--rule))] p-6 md:p-8">
            <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {groups.shipped.map((entry) => (
                <li key={entry.id}>
                  <RoadmapCard compact entry={entry} />
                </li>
              ))}
            </ul>
          </div>
        </details>
      ) : null}
    </div>
  );
}
