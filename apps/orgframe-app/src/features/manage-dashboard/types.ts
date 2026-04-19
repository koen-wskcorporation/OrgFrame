import { z } from "zod";

export const widgetTypes = [
  "forms-summary",
  "events-summary",
  "programs-summary",
  "ai-summary",
  "quick-links"
] as const;

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

export const defaultDashboardLayout: DashboardLayout = {
  version: 1,
  widgets: []
};

export function normalizeDashboardLayout(raw: unknown): DashboardLayout {
  const parsed = dashboardLayoutSchema.safeParse(raw);
  if (!parsed.success) {
    return defaultDashboardLayout;
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
