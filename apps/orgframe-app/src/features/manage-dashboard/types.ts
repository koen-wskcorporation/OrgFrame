import { z } from "zod";
import { DEFAULT_METRIC_SOURCE, METRIC_SOURCES } from "@/src/features/manage-dashboard/widgets/metric-sources";

export const widgetTypes = ["metric-card"] as const;

export type WidgetType = (typeof widgetTypes)[number];

export const widgetInstanceSchema = z.object({
  id: z.string().min(1),
  type: z.enum(widgetTypes),
  settings: z.record(z.string(), z.unknown()).optional()
});

export type WidgetInstance = z.infer<typeof widgetInstanceSchema>;

export const dashboardLayoutSchema = z.object({
  version: z.literal(1).optional(),
  widgets: z.array(widgetInstanceSchema).optional()
});

export type DashboardLayout = {
  version: 1;
  widgets: WidgetInstance[];
};

const DEFAULT_CARDS: Array<{ source: string; label?: string }> = [
  { source: "forms_total" },
  { source: "forms_submissions" },
  { source: "programs_total" },
  { source: "events_upcoming" }
];

export function buildDefaultDashboardLayout(): DashboardLayout {
  const known = new Set(METRIC_SOURCES.map((s) => s.value));
  const widgets: WidgetInstance[] = DEFAULT_CARDS.map((card, i) => ({
    id: `default-${i}-${card.source}`,
    type: "metric-card" as const,
    settings: {
      source: known.has(card.source) ? card.source : DEFAULT_METRIC_SOURCE,
      ...(card.label ? { label: card.label } : {})
    }
  }));
  return { version: 1, widgets };
}

export const defaultDashboardLayout: DashboardLayout = buildDefaultDashboardLayout();

export function normalizeDashboardLayout(raw: unknown): DashboardLayout {
  const parsed = dashboardLayoutSchema.safeParse(raw);
  if (!parsed.success) {
    return { version: 1, widgets: [] };
  }
  const seen = new Set<string>();
  const widgets = (parsed.data.widgets ?? []).filter((widget) => {
    if (seen.has(widget.id)) {
      return false;
    }
    seen.add(widget.id);
    return true;
  });
  return {
    version: 1,
    widgets
  };
}
