import { cn } from "@orgframe/ui/primitives/utils";
import { MetricWidget } from "@/src/features/data/components/widgets/MetricWidget";
import { TimeseriesWidget } from "@/src/features/data/components/widgets/TimeseriesWidget";
import { BreakdownWidget } from "@/src/features/data/components/widgets/BreakdownWidget";
import { TableWidget } from "@/src/features/data/components/widgets/TableWidget";
import type { DataCenterLayout, DataCenterWidgetInstance } from "@/src/features/data/layout";
import type { DataSourceSnapshot, ResolvedDataSource } from "@/src/features/data/registry/types";

type DashboardViewProps = {
  source: ResolvedDataSource;
  snapshot: DataSourceSnapshot;
  layout: DataCenterLayout;
};

function spanClass(span: 1 | 2 | 3 | undefined): string {
  if (span === 3) return "lg:col-span-3 sm:col-span-2";
  if (span === 2) return "sm:col-span-2";
  return "";
}

function renderWidget(widget: DataCenterWidgetInstance, source: ResolvedDataSource, snapshot: DataSourceSnapshot) {
  if (widget.kind === "metric") {
    const def = source.metrics.find((m) => m.key === widget.refKey);
    if (!def) return null;
    const entry = snapshot.metrics[widget.refKey];
    return <MetricWidget def={def} value={entry?.value ?? 0} previous={entry?.previous ?? null} />;
  }
  if (widget.kind === "timeseries") {
    const def = source.series.find((s) => s.key === widget.refKey);
    if (!def) return null;
    const entry = snapshot.series[widget.refKey];
    return <TimeseriesWidget def={def} points={entry?.points ?? []} />;
  }
  if (widget.kind === "breakdown") {
    const def = source.breakdowns.find((b) => b.key === widget.refKey);
    if (!def) return null;
    const entry = snapshot.breakdowns[widget.refKey];
    return <BreakdownWidget def={def} segments={entry?.segments ?? []} />;
  }
  const def = source.tables.find((t) => t.key === widget.refKey);
  if (!def) return null;
  const entry = snapshot.tables[widget.refKey];
  return (
    <TableWidget
      def={def}
      rows={entry?.rows ?? []}
      total={entry?.total}
      maxRows={widget.maxRows ?? 10}
      storageKey={`data:${source.fqKey}:table:${widget.refKey}`}
    />
  );
}

export function DashboardView({ source, snapshot, layout }: DashboardViewProps) {
  if (layout.widgets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface-panel p-8 text-center text-sm text-text-muted">
        This dashboard is empty.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {layout.widgets.map((widget) => (
        <div key={widget.id} className={cn(spanClass(widget.spanColumns))}>
          {renderWidget(widget, source, snapshot)}
        </div>
      ))}
    </div>
  );
}
