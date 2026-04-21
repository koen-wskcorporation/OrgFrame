import { Card, CardContent, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { formatMetricValue } from "@/src/features/data/components/widgets/format";
import type { MetricDef } from "@/src/features/data/registry/types";

type MetricWidgetProps = {
  def: MetricDef;
  value: number;
  previous?: number | null;
};

function formatDelta(current: number, previous: number | null | undefined, def: MetricDef): { text: string; tone: "up" | "down" | "neutral" } | null {
  if (previous === null || previous === undefined) return null;
  const diff = current - previous;
  if (diff === 0) return { text: "0%", tone: "neutral" };
  const base = previous === 0 ? 1 : Math.abs(previous);
  const pct = (diff / base) * 100;
  const sign = diff > 0 ? "+" : "";
  const direction: "up" | "down" = diff > 0 ? "up" : "down";
  const good =
    def.goodDirection === "neutral"
      ? "neutral"
      : def.goodDirection === "down"
        ? direction === "down"
          ? "up"
          : "down"
        : direction;
  return {
    text: `${sign}${pct.toFixed(pct % 1 === 0 ? 0 : 1)}%`,
    tone: good,
  };
}

export function MetricWidget({ def, value, previous }: MetricWidgetProps) {
  const delta = formatDelta(value, previous, def);

  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-medium text-text-muted">{def.label}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums">{formatMetricValue(value, def.format)}</span>
          {delta && (
            <span
              className={
                delta.tone === "up"
                  ? "text-sm font-medium text-emerald-600"
                  : delta.tone === "down"
                    ? "text-sm font-medium text-rose-600"
                    : "text-sm font-medium text-text-muted"
              }
            >
              {delta.text}
            </span>
          )}
        </div>
        {def.description && <p className="mt-1 text-xs text-text-muted">{def.description}</p>}
      </CardContent>
    </Card>
  );
}
