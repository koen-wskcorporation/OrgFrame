import { generateOccurrencesForRule } from "@/src/features/calendar/rule-engine";
import type { CalendarRule } from "@/src/features/calendar/types";
import { toLocalParts } from "@/src/features/calendar/components/workspace-utils";
import type { ScheduleRuleDraft } from "@/src/features/programs/schedule/components/types";

export type RecurrenceOccurrenceWindow = {
  occurrenceId: string;
  startsAtUtc: string;
  endsAtUtc: string;
  label: string;
};

export function buildRuleDraftFromWindow(startsAtUtc: string, endsAtUtc: string, timezone: string): ScheduleRuleDraft {
  const startParts = toLocalParts(startsAtUtc, timezone);
  const endParts = toLocalParts(endsAtUtc, timezone);
  const startDate = startParts.localDate;
  const startWeekday = new Date(startsAtUtc).getDay();

  return {
    mode: "single_date",
    repeatEnabled: false,
    title: "",
    timezone,
    startDate,
    endDate: startDate,
    startTime: startParts.localTime,
    endTime: endParts.localTime,
    intervalCount: 1,
    intervalUnit: "week",
    byWeekday: [startWeekday],
    byMonthday: [],
    endMode: "until_date",
    untilDate: startDate,
    maxOccurrences: "",
    programNodeId: "",
    specificDates: [startDate]
  };
}

export function buildCalendarRuleInputFromDraft(input: { draft: ScheduleRuleDraft; entryId: string }) {
  const mode = input.draft.repeatEnabled ? "repeating_pattern" : input.draft.mode;
  return {
    entryId: input.entryId,
    mode,
    timezone: input.draft.timezone,
    startDate: input.draft.startDate,
    endDate: input.draft.endDate,
    startTime: input.draft.startTime,
    endTime: input.draft.endTime,
    intervalCount: input.draft.intervalCount,
    intervalUnit: input.draft.intervalUnit,
    byWeekday: input.draft.byWeekday,
    byMonthday: input.draft.byMonthday,
    endMode: input.draft.endMode,
    untilDate: input.draft.untilDate,
    maxOccurrences: input.draft.maxOccurrences ? Number.parseInt(input.draft.maxOccurrences, 10) : null,
    configJson: {
      specificDates: input.draft.specificDates
    }
  };
}

export function buildOccurrenceWindowsFromRuleDraft(input: { draft: ScheduleRuleDraft; entryId: string }): RecurrenceOccurrenceWindow[] {
  const rule = {
    id: "draft",
    orgId: "draft",
    entryId: input.entryId,
    mode: input.draft.repeatEnabled ? "repeating_pattern" : input.draft.mode,
    timezone: input.draft.timezone,
    startDate: input.draft.startDate || null,
    endDate: input.draft.endDate || null,
    startTime: input.draft.startTime || null,
    endTime: input.draft.endTime || null,
    intervalCount: input.draft.intervalCount,
    intervalUnit: input.draft.intervalUnit,
    byWeekday: input.draft.byWeekday,
    byMonthday: input.draft.byMonthday,
    endMode: input.draft.endMode,
    untilDate: input.draft.untilDate || null,
    maxOccurrences: input.draft.maxOccurrences ? Number.parseInt(input.draft.maxOccurrences, 10) : null,
    sortIndex: 0,
    isActive: true,
    configJson: {
      specificDates: input.draft.specificDates
    },
    ruleHash: "",
    createdBy: null,
    updatedBy: null,
    createdAt: "",
    updatedAt: ""
  } as const;

  return generateOccurrencesForRule(rule, { horizonMonths: 3 }).map((occurrence) => ({
    occurrenceId: occurrence.sourceKey,
    startsAtUtc: occurrence.startsAtUtc,
    endsAtUtc: occurrence.endsAtUtc,
    label: occurrence.localDate
  }));
}

export function syncRuleDraftWithWindow(current: ScheduleRuleDraft, startsAtUtc: string, endsAtUtc: string, timezone: string): ScheduleRuleDraft {
  const startParts = toLocalParts(startsAtUtc, timezone);
  const endParts = toLocalParts(endsAtUtc, timezone);
  const weekday = new Date(startsAtUtc).getDay();

  if (!current.repeatEnabled) {
    return buildRuleDraftFromWindow(startsAtUtc, endsAtUtc, timezone);
  }

  return {
    ...current,
    timezone,
    startDate: startParts.localDate,
    startTime: startParts.localTime,
    endTime: endParts.localTime,
    byWeekday: current.byWeekday.length > 0 ? current.byWeekday : [weekday],
    untilDate: current.untilDate || startParts.localDate
  };
}

export function scheduleDraftFromCalendarRule(rule: CalendarRule): ScheduleRuleDraft {
  return {
    ruleId: rule.id,
    mode: rule.mode === "repeating_pattern" ? "multiple_specific_dates" : rule.mode,
    repeatEnabled: rule.mode === "repeating_pattern",
    title: "",
    timezone: rule.timezone,
    startDate: rule.startDate ?? "",
    endDate: rule.endDate ?? "",
    startTime: rule.startTime ?? "",
    endTime: rule.endTime ?? "",
    intervalCount: rule.intervalCount ?? 1,
    intervalUnit: rule.intervalUnit ?? "week",
    byWeekday: rule.byWeekday ?? [],
    byMonthday: rule.byMonthday ?? [],
    endMode: rule.endMode ?? "until_date",
    untilDate: rule.untilDate ?? "",
    maxOccurrences: rule.maxOccurrences?.toString() ?? "",
    programNodeId: "",
    specificDates: Array.isArray(rule.configJson.specificDates)
      ? (rule.configJson.specificDates as unknown[]).filter((value): value is string => typeof value === "string")
      : []
  };
}
