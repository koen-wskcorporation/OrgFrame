export type EventStatus = "draft" | "published" | "archived";

export type OrgEvent = {
  id: string;
  orgId: string;
  title: string;
  summary: string | null;
  location: string | null;
  timezone: string;
  status: EventStatus;
  isAllDay: boolean;
  allDayStartDate: string | null;
  allDayEndDate: string | null;
  startsAtUtc: string;
  endsAtUtc: string;
  settingsJson: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EventCatalogItem = {
  id: string;
  title: string;
  summary: string | null;
  location: string | null;
  timezone: string;
  isAllDay: boolean;
  allDayStartDate: string | null;
  allDayEndDate: string | null;
  startsAtUtc: string;
  endsAtUtc: string;
};
