import type { RoadmapStatus } from "@/src/shared/marketing/roadmap";

const LABELS: Record<RoadmapStatus, string> = {
  shipped: "Shipped",
  "in-progress": "In progress",
  next: "Next",
  later: "Later"
};

const STYLES: Record<RoadmapStatus, string> = {
  "in-progress":
    "bg-[hsl(var(--accent-bg)/0.15)] text-[hsl(var(--accent-ink))] border-[hsl(var(--accent-ink)/0.35)]",
  next: "bg-[hsl(var(--paper-3))] text-[hsl(var(--ink))] border-[hsl(var(--rule-strong))]",
  later: "bg-transparent text-[hsl(var(--muted-ink))] border-[hsl(var(--rule))]",
  shipped: "bg-[hsl(var(--ink))] text-[hsl(var(--paper))] border-[hsl(var(--ink))]"
};

const DOT: Record<RoadmapStatus, string> = {
  "in-progress": "bg-[hsl(var(--accent-bg))] animate-pulse",
  next: "bg-[hsl(var(--ink))]",
  later: "bg-[hsl(var(--muted-ink))]",
  shipped: "bg-[hsl(var(--paper))]"
};

export function StatusBadge({ status, withDot = true }: { status: RoadmapStatus; withDot?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] ${STYLES[status]}`}
    >
      {withDot ? <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${DOT[status]}`} /> : null}
      {LABELS[status]}
    </span>
  );
}
