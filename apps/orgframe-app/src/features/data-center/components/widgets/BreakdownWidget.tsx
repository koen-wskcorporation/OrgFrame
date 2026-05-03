"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { DonutChart } from "@orgframe/ui/primitives/charts";
import { formatNumberCompact } from "@/src/features/data-center/components/widgets/format";
import type { BreakdownDef } from "@/src/features/data-center/registry/types";

type BreakdownWidgetProps = {
  def: BreakdownDef;
  segments: { label: string; value: number }[];
};

export function BreakdownWidget({ def, segments }: BreakdownWidgetProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{def.label}</CardTitle>
        {def.description && <p className="text-xs text-text-muted">{def.description}</p>}
      </CardHeader>
      <CardContent className="pt-0">
        <DonutChart segments={segments} ariaLabel={def.label} valueFormatter={formatNumberCompact} />
      </CardContent>
    </Card>
  );
}
