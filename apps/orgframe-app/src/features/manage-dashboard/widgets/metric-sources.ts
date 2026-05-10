import type { Permission } from "@/src/features/core/access";

export type MetricSource = {
  value: string;
  label: string;
  group: "Forms" | "Programs" | "Calendar";
  requiredAnyPermission?: Permission[];
};

export const METRIC_SOURCES: MetricSource[] = [
  { value: "forms_total", label: "Forms total", group: "Forms", requiredAnyPermission: ["forms.read", "forms.write"] },
  { value: "forms_published", label: "Forms published", group: "Forms", requiredAnyPermission: ["forms.read", "forms.write"] },
  { value: "forms_draft", label: "Forms draft", group: "Forms", requiredAnyPermission: ["forms.read", "forms.write"] },
  { value: "forms_submissions", label: "Form submissions", group: "Forms", requiredAnyPermission: ["forms.read", "forms.write"] },
  { value: "programs_total", label: "Programs total", group: "Programs", requiredAnyPermission: ["programs.read", "programs.write"] },
  { value: "programs_published", label: "Programs published", group: "Programs", requiredAnyPermission: ["programs.read", "programs.write"] },
  { value: "programs_draft", label: "Programs draft", group: "Programs", requiredAnyPermission: ["programs.read", "programs.write"] },
  { value: "events_total", label: "Calendar items total", group: "Calendar", requiredAnyPermission: ["calendar.read", "calendar.write", "events.read", "events.write"] },
  { value: "events_upcoming", label: "Upcoming events (30 days)", group: "Calendar", requiredAnyPermission: ["calendar.read", "calendar.write", "events.read", "events.write"] }
];

export const DEFAULT_METRIC_SOURCE = "forms_total";

export type MetricCardData = {
  source: string;
  label: string;
  value: number | null;
};
