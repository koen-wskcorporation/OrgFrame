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
  "forms-summary": {
    type: "forms-summary",
    title: "Forms",
    description: "Form counts by status and total submissions.",
    requiredAnyPermission: ["forms.read", "forms.write"]
  },
  "events-summary": {
    type: "events-summary",
    title: "Events",
    description: "Upcoming calendar items and totals.",
    requiredAnyPermission: ["calendar.read", "calendar.write", "events.read", "events.write"]
  },
  "programs-summary": {
    type: "programs-summary",
    title: "Programs",
    description: "Program totals.",
    requiredAnyPermission: ["programs.read", "programs.write"]
  },
  "ai-summary": {
    type: "ai-summary",
    title: "AI Daily Brief",
    description: "AI-generated snapshot of what's changed and what needs attention.",
    colSpan: "full"
  },
  "quick-links": {
    type: "quick-links",
    title: "Quick Links",
    description: "Your own curated shortcuts."
  }
};

export function hasAnyPermission(granted: Permission[], required?: Permission[]) {
  if (!required || required.length === 0) {
    return true;
  }
  const set = new Set(granted);
  return required.some((p) => set.has(p));
}
