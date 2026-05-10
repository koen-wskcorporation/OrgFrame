"use client";

import { Alert } from "@orgframe/ui/primitives/alert";
import type { WidgetType } from "@/src/features/manage-dashboard/types";
import type { MetricCardData } from "@/src/features/manage-dashboard/widgets/metric-sources";

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

function MetricCardWidget({ data }: RenderProps) {
  if (!data.ok) return <Missing error={data.error} />;
  const payload = data.data as MetricCardData | null;
  const value = payload?.value;
  const display = value === null || value === undefined ? "—" : value.toLocaleString();

  return (
    <div className="flex flex-col gap-1">
      <span className="text-3xl font-semibold leading-tight text-text-strong">{display}</span>
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
