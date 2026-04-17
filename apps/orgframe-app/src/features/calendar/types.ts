export type CalendarEntryType = "event" | "practice" | "game";

export type CalendarVisibility = "internal" | "published";

export type CalendarScopeType = "organization" | "program" | "division" | "team" | "custom";

export type CalendarPurpose =
  | "games"
  | "practices"
  | "tryouts"
  | "season_dates"
  | "meetings"
  | "fundraisers"
  | "facilities"
  | "deadlines"
  | "custom_other";

export type CalendarAudience =
  | "me"
  | "public"
  | "staff"
  | "coaches"
  | "board"
  | "parents"
  | "players"
  | "team_members_only"
  | "private_internal";

export type CalendarEntryStatus = "scheduled" | "cancelled" | "archived";

export type CalendarRuleMode = "single_date" | "multiple_specific_dates" | "repeating_pattern" | "continuous_date_range" | "custom_advanced";

export type CalendarIntervalUnit = "day" | "week" | "month";

export type CalendarRuleEndMode = "never" | "until_date" | "after_occurrences";

export type CalendarOccurrenceSourceType = "single" | "rule" | "override";

export type CalendarOccurrenceStatus = "scheduled" | "cancelled";

export type CalendarRuleExceptionKind = "skip" | "override";

export type FacilityLockMode = "exclusive" | "shared_invite_only";

export type OccurrenceTeamRole = "host" | "participant";

export type OccurrenceInviteStatus = "accepted" | "pending" | "declined" | "left";

export type CalendarEntry = {
  id: string;
  orgId: string;
  sourceId: string | null;
  entryType: CalendarEntryType;
  purpose: CalendarPurpose;
  audience: CalendarAudience;
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

export type CalendarSource = {
  id: string;
  orgId: string;
  name: string;
  scopeType: CalendarScopeType;
  scopeId: string | null;
  scopeLabel: string | null;
  parentSourceId: string | null;
  purposeDefaults: CalendarPurpose[];
  audienceDefaults: CalendarAudience[];
  isCustomCalendar: boolean;
  isActive: boolean;
  displayJson: Record<string, unknown>;
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

export type FacilitySpaceConfiguration = {
  id: string;
  orgId: string;
  spaceId: string;
  name: string;
  slug: string;
  capacityTeams: number | null;
  isActive: boolean;
  sortIndex: number;
  metadataJson: Record<string, unknown>;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FacilityAllocation = {
  id: string;
  orgId: string;
  occurrenceId: string;
  spaceId: string;
  configurationId: string;
  lockMode: FacilityLockMode;
  allowShared: boolean;
  startsAtUtc: string;
  endsAtUtc: string;
  isActive: boolean;
  metadataJson: Record<string, unknown>;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CalendarRuleFacilityAllocation = {
  id: string;
  orgId: string;
  ruleId: string;
  spaceId: string;
  configurationId: string;
  lockMode: FacilityLockMode;
  allowShared: boolean;
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
  sources: CalendarSource[];
  entries: CalendarEntry[];
  rules: CalendarRule[];
  occurrences: CalendarOccurrence[];
  exceptions: CalendarRuleException[];
  configurations: FacilitySpaceConfiguration[];
  allocations: FacilityAllocation[];
  ruleAllocations: CalendarRuleFacilityAllocation[];
  invites: OccurrenceTeamInvite[];
};

export type CalendarLensKind = "mine" | "this_page" | "public" | "operations" | "custom";

export type CalendarPageContextType = "org" | "program" | "division" | "team" | "facility" | "public" | "embedded";

export type CalendarPageContext = {
  contextType: CalendarPageContextType;
  orgId: string;
  orgSlug: string;
  programId?: string;
  divisionId?: string;
  teamId?: string;
  facilityId?: string;
};

export type CalendarLensState = {
  lens: CalendarLensKind;
  includeScopeTypes: CalendarScopeType[];
  excludeSourceIds: string[];
  includePurpose: CalendarPurpose[];
  audiencePerspective: CalendarAudience | "what_i_can_access";
  selectedLayerIds: string[];
  pinnedLayerIds: string[];
  isolatedLayerId: string | null;
  includeParentScopes: boolean;
  includeChildScopes: boolean;
  searchTerm: string;
  dateMode: "all" | "range";
  dateRange: {
    fromUtc: string | null;
    toUtc: string | null;
  };
  savedViewId: string | null;
  savedViewName: string | null;
};

export type CalendarLayerNode = {
  id: string;
  parentId: string | null;
  sourceId: string;
  label: string;
  scopeType: CalendarScopeType;
  purpose: CalendarPurpose | null;
  visible: boolean;
  pinned: boolean;
  isolated: boolean;
  muted: boolean;
};

export type CalendarWhyShown = {
  occurrenceId: string;
  entryId: string;
  sourceId: string | null;
  sourceName: string | null;
  scopeType: CalendarScopeType | null;
  purpose: CalendarPurpose;
  audience: CalendarAudience;
  reasonCodes: string[];
};

export type CalendarLensSavedView = {
  id: string;
  orgId: string;
  userId: string;
  name: string;
  contextType: CalendarPageContextType | null;
  isDefault: boolean;
  configJson: CalendarLensState;
  createdAt: string;
  updatedAt: string;
};
