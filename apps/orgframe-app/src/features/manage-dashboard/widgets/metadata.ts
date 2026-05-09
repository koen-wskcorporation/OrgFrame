import type { Permission } from "@/src/features/core/access";
import type { WidgetType } from "@/src/features/manage-dashboard/types";

export type WidgetMetadata = {
  type: WidgetType;
  title: string;
  description: string;
  requiredAnyPermission?: Permission[];
  colSpan?: "full" | "default";
};

export const widgetMetadata: Record<WidgetType, WidgetMetadata> = {
  "metric-card": {
    type: "metric-card",
    title: "Metric Card",
    description: "A single metric of your choice."
  }
};

export function hasAnyPermission(granted: Permission[], required?: Permission[]) {
  if (!required || required.length === 0) {
    return true;
  }
  const set = new Set(granted);
  return required.some((p) => set.has(p));
}
