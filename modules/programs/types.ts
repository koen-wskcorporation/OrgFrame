export type ProgramType = "league" | "season" | "clinic" | "custom";

export type ProgramStatus = "draft" | "published" | "archived";

export type ProgramNodeKind = "division" | "team";

export type ProgramScheduleBlockType = "date_range" | "meeting_pattern" | "one_off";
export type ProgramScheduleMode = "single_date" | "multiple_specific_dates" | "repeating_pattern" | "continuous_date_range" | "custom_advanced";
export type ProgramScheduleIntervalUnit = "day" | "week" | "month";
export type ProgramScheduleEndMode = "never" | "until_date" | "after_occurrences";
export type ProgramOccurrenceSourceType = "rule" | "manual" | "override";
export type ProgramOccurrenceStatus = "scheduled" | "cancelled";
export type ProgramScheduleExceptionKind = "skip" | "override";

export type Program = {
  id: string;
  orgId: string;
  slug: string;
  name: string;
  description: string | null;
  status: ProgramStatus;
  programType: ProgramType;
  customTypeLabel: string | null;
  registrationOpenAt: string | null;
  registrationCloseAt: string | null;
  startDate: string | null;
  endDate: string | null;
  coverImagePath: string | null;
  settingsJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ProgramNode = {
  id: string;
  programId: string;
  parentId: string | null;
  name: string;
  slug: string;
  nodeKind: ProgramNodeKind;
  sortIndex: number;
  capacity: number | null;
  waitlistEnabled: boolean;
  settingsJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ProgramScheduleBlock = {
  id: string;
  programId: string;
  programNodeId: string | null;
  blockType: ProgramScheduleBlockType;
  title: string | null;
  timezone: string | null;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  byDay: number[] | null;
  oneOffAt: string | null;
  sortIndex: number;
  settingsJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ProgramCatalogItem = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: ProgramStatus;
  programType: ProgramType;
  customTypeLabel: string | null;
  startDate: string | null;
  endDate: string | null;
  coverImagePath: string | null;
  coverImageUrl?: string | null;
  registrationOpenAt: string | null;
  registrationCloseAt: string | null;
  settingsJson: Record<string, unknown>;
};

export type ProgramWithDetails = {
  program: Program;
  nodes: ProgramNode[];
  scheduleBlocks: ProgramScheduleBlock[];
};

export type ProgramScheduleRule = {
  id: string;
  programId: string;
  programNodeId: string | null;
  mode: ProgramScheduleMode;
  title: string | null;
  timezone: string;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  intervalCount: number;
  intervalUnit: ProgramScheduleIntervalUnit | null;
  byWeekday: number[] | null;
  byMonthday: number[] | null;
  endMode: ProgramScheduleEndMode;
  untilDate: string | null;
  maxOccurrences: number | null;
  sortIndex: number;
  isActive: boolean;
  configJson: Record<string, unknown>;
  ruleHash: string;
  createdAt: string;
  updatedAt: string;
};

export type ProgramOccurrence = {
  id: string;
  programId: string;
  programNodeId: string | null;
  sourceRuleId: string | null;
  sourceType: ProgramOccurrenceSourceType;
  sourceKey: string;
  title: string | null;
  timezone: string;
  localDate: string;
  localStartTime: string | null;
  localEndTime: string | null;
  startsAtUtc: string;
  endsAtUtc: string;
  status: ProgramOccurrenceStatus;
  metadataJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ProgramScheduleException = {
  id: string;
  programId: string;
  ruleId: string;
  sourceKey: string;
  kind: ProgramScheduleExceptionKind;
  overrideOccurrenceId: string | null;
  payloadJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};
