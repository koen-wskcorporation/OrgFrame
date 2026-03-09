export type CalendarEntryType = "event" | "practice" | "game";

export type CalendarVisibility = "internal" | "published";

export type CalendarEntryStatus = "scheduled" | "cancelled" | "archived";

export type CalendarRuleMode = "single_date" | "multiple_specific_dates" | "repeating_pattern" | "continuous_date_range" | "custom_advanced";

export type CalendarIntervalUnit = "day" | "week" | "month";

export type CalendarRuleEndMode = "never" | "until_date" | "after_occurrences";

export type CalendarOccurrenceSourceType = "single" | "rule" | "override";

export type CalendarOccurrenceStatus = "scheduled" | "cancelled";

export type CalendarRuleExceptionKind = "skip" | "override";

export type OccurrenceTeamRole = "host" | "participant";

export type OccurrenceInviteStatus = "accepted" | "pending" | "declined" | "left";

export type CalendarEntry = {
  id: string;
  orgId: string;
  entryType: CalendarEntryType;
  title: string;
  summary: string | null;
  visibility: CalendarVisibility;
  status: CalendarEntryStatus;
  hostTeamId: string | null;
  defaultTimezone: string;
  settingsJson: Record<string, unknown>;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CalendarRule = {
  id: string;
  orgId: string;
  entryId: string;
  mode: CalendarRuleMode;
  timezone: string;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  intervalCount: number;
  intervalUnit: CalendarIntervalUnit | null;
  byWeekday: number[] | null;
  byMonthday: number[] | null;
  endMode: CalendarRuleEndMode;
  untilDate: string | null;
  maxOccurrences: number | null;
  sortIndex: number;
  isActive: boolean;
  configJson: Record<string, unknown>;
  ruleHash: string;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CalendarOccurrence = {
  id: string;
  orgId: string;
  entryId: string;
  sourceRuleId: string | null;
  sourceType: CalendarOccurrenceSourceType;
  sourceKey: string;
  timezone: string;
  localDate: string;
  localStartTime: string | null;
  localEndTime: string | null;
  startsAtUtc: string;
  endsAtUtc: string;
  status: CalendarOccurrenceStatus;
  metadataJson: Record<string, unknown>;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CalendarRuleException = {
  id: string;
  orgId: string;
  ruleId: string;
  sourceKey: string;
  kind: CalendarRuleExceptionKind;
  overrideOccurrenceId: string | null;
  payloadJson: Record<string, unknown>;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FacilityAllocation = {
  id: string;
  orgId: string;
  occurrenceId: string;
  nodeId: string;
  startsAtUtc: string;
  endsAtUtc: string;
  isActive: boolean;
  metadataJson: Record<string, unknown>;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OccurrenceTeamInvite = {
  id: string;
  orgId: string;
  occurrenceId: string;
  teamId: string;
  role: OccurrenceTeamRole;
  inviteStatus: OccurrenceInviteStatus;
  invitedByUserId: string | null;
  invitedAt: string | null;
  respondedByUserId: string | null;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InboxItem = {
  id: string;
  orgId: string;
  recipientUserId: string;
  itemType: string;
  title: string;
  body: string | null;
  href: string | null;
  payloadJson: Record<string, unknown>;
  isRead: boolean;
  readAt: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type CalendarPublicCatalogItem = {
  occurrenceId: string;
  entryId: string;
  entryType: Extract<CalendarEntryType, "event" | "game">;
  title: string;
  summary: string | null;
  timezone: string;
  startsAtUtc: string;
  endsAtUtc: string;
  isAllDay: boolean;
  allDayStartDate: string | null;
  allDayEndDate: string | null;
  location: string | null;
};

export type CalendarOccurrenceReadModel = {
  occurrence: CalendarOccurrence;
  entry: CalendarEntry;
  allocations: FacilityAllocation[];
  teams: OccurrenceTeamInvite[];
};

export type CalendarReadModel = {
  entries: CalendarEntry[];
  rules: CalendarRule[];
  occurrences: CalendarOccurrence[];
  exceptions: CalendarRuleException[];
  allocations: FacilityAllocation[];
  invites: OccurrenceTeamInvite[];
};
