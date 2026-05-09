"use client";

import { Alert } from "@orgframe/ui/primitives/alert";
import type { WidgetType } from "@/src/features/manage-dashboard/types";
import { DEFAULT_METRIC_SOURCE, METRIC_SOURCES, type MetricCardData } from "@/src/features/manage-dashboard/widgets/metric-sources";

type RenderProps = {
  orgSlug: string;
  settings?: Record<string, unknown>;
  data: { ok: true; data: unknown } | { ok: false; error: string; message?: string };
  onUpdateSettings?: (next: Record<string, unknown>) => void;
};

function Missing({ error }: { error: string }) {
  if (error === "PERMISSION_DENIED") {
    return <Alert variant="warning">You don't have permission to view this data.</Alert>;
  }
  return <Alert variant="destructive">Unable to load card.</Alert>;
}

type MetricCardSettings = { source?: string; label?: string };

function MetricCardWidget({ data, settings }: RenderProps) {
  if (!data.ok) return <Missing error={data.error} />;
  const s = (settings ?? {}) as MetricCardSettings;
  const sourceValue = s.source ?? DEFAULT_METRIC_SOURCE;
  const source = METRIC_SOURCES.find((m) => m.value === sourceValue);
  const fallbackLabel = source?.label ?? "Metric";
  const customLabel = typeof s.label === "string" ? s.label.trim() : "";
  const label = customLabel.length > 0 ? customLabel : fallbackLabel;

  const payload = data.data as MetricCardData | null;
  const value = payload?.value;
  const display = value === null || value === undefined ? "—" : value.toLocaleString();

  return (
    <div className="flex flex-col gap-1">
      <span className="ui-kv-label">{label}</span>
      <span className="text-3xl font-semibold leading-tight text-text-strong">{display}</span>
      {value === null ? <span className="text-xs text-text-muted">No permission to view this metric.</span> : null}
    </div>
  );
}

export function renderWidget(type: WidgetType, props: RenderProps) {
  switch (type) {
    case "metric-card":
      return <MetricCardWidget {...props} />;
    default:
      return null;
  }
}
