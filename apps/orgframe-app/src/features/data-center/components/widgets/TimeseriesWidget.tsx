"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { LineChart } from "@orgframe/ui/primitives/charts";
import { formatDateLabel, formatNumberCompact } from "@/src/features/data-center/components/widgets/format";
import type { SeriesDef } from "@/src/features/data-center/registry/types";

type TimeseriesWidgetProps = {
  def: SeriesDef;
  points: { t: string; v: number }[];
};

export function TimeseriesWidget({ def, points }: TimeseriesWidgetProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{def.label}</CardTitle>
        {def.description && <p className="text-xs text-text-muted">{def.description}</p>}
      </CardHeader>
      <CardContent className="h-56 pt-0">
        <LineChart
          points={points}
          ariaLabel={def.label}
          xFormatter={formatDateLabel}
          yFormatter={formatNumberCompact}
        />
      </CardContent>
    </Card>
  );
}
