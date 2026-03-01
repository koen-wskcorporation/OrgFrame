export type FacilitySpaceKind = "building" | "room" | "field" | "court" | "custom";

export type FacilitySpaceStatus = "open" | "closed" | "archived";

export type FacilityReservationKind = "booking" | "blackout";

export type FacilityReservationStatus = "pending" | "approved" | "rejected" | "cancelled";

export type FacilityReservationRuleMode = "single_date" | "multiple_specific_dates" | "repeating_pattern" | "continuous_date_range" | "custom_advanced";

export type FacilityReservationRuleIntervalUnit = "day" | "week" | "month";

export type FacilityReservationRuleEndMode = "never" | "until_date" | "after_occurrences";

export type FacilityReservationExceptionKind = "skip" | "override";

export type FacilitySpace = {
  id: string;
  orgId: string;
  parentSpaceId: string | null;
  name: string;
  slug: string;
  spaceKind: FacilitySpaceKind;
  status: FacilitySpaceStatus;
  isBookable: boolean;
  timezone: string;
  capacity: number | null;
  metadataJson: Record<string, unknown>;
  sortIndex: number;
  createdAt: string;
  updatedAt: string;
};

export type FacilityReservationRule = {
  id: string;
  orgId: string;
  spaceId: string;
  mode: FacilityReservationRuleMode;
  reservationKind: FacilityReservationKind;
  defaultStatus: FacilityReservationStatus;
  publicLabel: string | null;
  internalNotes: string | null;
  timezone: string;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  intervalCount: number;
  intervalUnit: FacilityReservationRuleIntervalUnit | null;
  byWeekday: number[] | null;
  byMonthday: number[] | null;
  endMode: FacilityReservationRuleEndMode;
  untilDate: string | null;
  maxOccurrences: number | null;
  eventId: string | null;
  programId: string | null;
  conflictOverride: boolean;
  sortIndex: number;
  isActive: boolean;
  configJson: Record<string, unknown>;
  ruleHash: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FacilityReservation = {
  id: string;
  orgId: string;
  spaceId: string;
  sourceRuleId: string | null;
  sourceKey: string;
  reservationKind: FacilityReservationKind;
  status: FacilityReservationStatus;
  timezone: string;
  localDate: string;
  localStartTime: string | null;
  localEndTime: string | null;
  startsAtUtc: string;
  endsAtUtc: string;
  publicLabel: string | null;
  internalNotes: string | null;
  eventId: string | null;
  programId: string | null;
  conflictOverride: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  metadataJson: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FacilityReservationException = {
  id: string;
  orgId: string;
  ruleId: string;
  sourceKey: string;
  kind: FacilityReservationExceptionKind;
  overrideReservationId: string | null;
  payloadJson: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FacilityReservationReadModel = {
  spaces: FacilitySpace[];
  rules: FacilityReservationRule[];
  reservations: FacilityReservation[];
  exceptions: FacilityReservationException[];
};

export type FacilityPublicSpaceStatus = "open" | "closed" | "booked";

export type FacilityPublicReservation = {
  id: string;
  spaceId: string;
  reservationKind: FacilityReservationKind;
  status: Extract<FacilityReservationStatus, "pending" | "approved">;
  publicLabel: string | null;
  startsAtUtc: string;
  endsAtUtc: string;
  timezone: string;
};

export type FacilityPublicSpaceAvailability = {
  id: string;
  parentSpaceId: string | null;
  name: string;
  slug: string;
  spaceKind: FacilitySpaceKind;
  status: FacilitySpaceStatus;
  isBookable: boolean;
  timezone: string;
  currentStatus: FacilityPublicSpaceStatus;
  nextAvailableAtUtc: string | null;
};

export type FacilityPublicAvailabilitySnapshot = {
  generatedAtUtc: string;
  spaces: FacilityPublicSpaceAvailability[];
  reservations: FacilityPublicReservation[];
};
