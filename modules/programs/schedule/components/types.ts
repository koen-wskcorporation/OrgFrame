import type { ProgramOccurrence, ProgramScheduleEndMode, ProgramScheduleIntervalUnit, ProgramScheduleMode, ProgramScheduleRule } from "@/modules/programs/types";

export type ScheduleRuleDraft = {
  ruleId?: string;
  mode: ProgramScheduleMode;
  repeatEnabled: boolean;
  title: string;
  timezone: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  intervalCount: number;
  intervalUnit: ProgramScheduleIntervalUnit;
  byWeekday: number[];
  byMonthday: number[];
  endMode: ProgramScheduleEndMode;
  untilDate: string;
  maxOccurrences: string;
  programNodeId: string;
  specificDates: string[];
};

export function toRuleDraft(rule?: ProgramScheduleRule): ScheduleRuleDraft {
  const specificDatesRaw = Array.isArray(rule?.configJson.specificDates) ? rule?.configJson.specificDates : [];
  const specificDates = specificDatesRaw.filter((value): value is string => typeof value === "string");

  return {
    ruleId: rule?.id,
    mode: rule?.mode === "repeating_pattern" ? "multiple_specific_dates" : (rule?.mode ?? "multiple_specific_dates"),
    repeatEnabled: rule?.mode === "repeating_pattern",
    title: rule?.title ?? "",
    timezone: rule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    startDate: rule?.startDate ?? "",
    endDate: rule?.endDate ?? "",
    startTime: rule?.startTime ?? "",
    endTime: rule?.endTime ?? "",
    intervalCount: rule?.intervalCount ?? 1,
    intervalUnit: rule?.intervalUnit ?? "week",
    byWeekday: rule?.byWeekday ?? [],
    byMonthday: rule?.byMonthday ?? [],
    endMode: rule?.endMode ?? "until_date",
    untilDate: rule?.untilDate ?? "",
    maxOccurrences: rule?.maxOccurrences?.toString() ?? "",
    programNodeId: rule?.programNodeId ?? "",
    specificDates
  };
}

export type OccurrenceEditDraft = {
  occurrenceId?: string;
  title: string;
  timezone: string;
  localDate: string;
  localStartTime: string;
  localEndTime: string;
  programNodeId: string;
};

export function toOccurrenceEditDraft(occurrence: ProgramOccurrence): OccurrenceEditDraft {
  return {
    occurrenceId: occurrence.id,
    title: occurrence.title ?? "",
    timezone: occurrence.timezone,
    localDate: occurrence.localDate,
    localStartTime: occurrence.localStartTime ?? "",
    localEndTime: occurrence.localEndTime ?? "",
    programNodeId: occurrence.programNodeId ?? ""
  };
}
