import { z } from "zod";

export const dataCenterWidgetKinds = ["metric", "timeseries", "breakdown", "table"] as const;
export type DataCenterWidgetKind = (typeof dataCenterWidgetKinds)[number];

export const dataCenterWidgetInstanceSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(dataCenterWidgetKinds),
  /** References MetricDef.key / SeriesDef.key / BreakdownDef.key / TableDef.key */
  refKey: z.string().min(1),
  spanColumns: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  maxRows: z.number().int().positive().optional(),
});

export type DataCenterWidgetInstance = z.infer<typeof dataCenterWidgetInstanceSchema>;

export const dataCenterLayoutSchema = z.object({
  version: z.literal(1).optional(),
  widgets: z.array(dataCenterWidgetInstanceSchema).optional(),
});

export type DataCenterLayout = {
  version: 1;
  widgets: DataCenterWidgetInstance[];
};

export const emptyLayout: DataCenterLayout = { version: 1, widgets: [] };

export function normalizeLayout(raw: unknown): DataCenterLayout {
  const parsed = dataCenterLayoutSchema.safeParse(raw);
  if (!parsed.success) return emptyLayout;
  const seen = new Set<string>();
  const widgets = (parsed.data.widgets ?? []).filter((w) => {
    if (seen.has(w.id)) return false;
    seen.add(w.id);
    return true;
  });
  return { version: 1, widgets };
}
