import type { ProgramOccurrence, ProgramScheduleRule } from "@/modules/programs/types";

export const DEFAULT_SCHEDULE_HORIZON_MONTHS = 18;

export type GeneratedOccurrenceInput = Pick<
  ProgramOccurrence,
  | "sourceKey"
  | "programNodeId"
  | "sourceRuleId"
  | "sourceType"
  | "title"
  | "timezone"
  | "localDate"
  | "localStartTime"
  | "localEndTime"
  | "startsAtUtc"
  | "endsAtUtc"
  | "status"
  | "metadataJson"
>;

function parseDate(dateValue: string): Date {
  const [year, month, day] = dateValue.split("-").map((value) => Number.parseInt(value, 10));
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}

function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function dayDiff(fromDate: Date, toDate: Date): number {
  return Math.floor((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000));
}

function monthDiff(fromDate: Date, toDate: Date): number {
  return (toDate.getUTCFullYear() - fromDate.getUTCFullYear()) * 12 + (toDate.getUTCMonth() - fromDate.getUTCMonth());
}

function withTime(localDate: string, localTime: string): string {
  return `${localDate}T${localTime}:00`;
}

function partsFromDateInZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const parts = formatter.formatToParts(date);
  const valueByType = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number.parseInt(valueByType.get("year") ?? "0", 10),
    month: Number.parseInt(valueByType.get("month") ?? "1", 10),
    day: Number.parseInt(valueByType.get("day") ?? "1", 10),
    hour: Number.parseInt(valueByType.get("hour") ?? "0", 10),
    minute: Number.parseInt(valueByType.get("minute") ?? "0", 10),
    second: Number.parseInt(valueByType.get("second") ?? "0", 10)
  };
}

function offsetMinutesAt(date: Date, timeZone: string): number {
  const zonedParts = partsFromDateInZone(date, timeZone);
  const zonedAsUtc = Date.UTC(zonedParts.year, zonedParts.month - 1, zonedParts.day, zonedParts.hour, zonedParts.minute, zonedParts.second);
  return Math.round((zonedAsUtc - date.getTime()) / (60 * 1000));
}

export function zonedLocalToUtc(localDate: string, localTime: string, timeZone: string): Date {
  const [year, month, day] = localDate.split("-").map((value) => Number.parseInt(value, 10));
  const [hour, minute] = localTime.split(":").map((value) => Number.parseInt(value, 10));
  const baseUtc = Date.UTC(year, (month || 1) - 1, day || 1, hour || 0, minute || 0, 0);

  let candidate = baseUtc;
  for (let i = 0; i < 4; i += 1) {
    const candidateDate = new Date(candidate);
    const offset = offsetMinutesAt(candidateDate, timeZone);
    const next = baseUtc - offset * 60_000;
    if (Math.abs(next - candidate) < 1_000) {
      candidate = next;
      break;
    }

    candidate = next;
  }

  return new Date(candidate);
}

function normalizeSpecificDates(configJson: Record<string, unknown>): string[] {
  const value = configJson.specificDates;
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item));
}

function normalizeTimeBounds(rule: ProgramScheduleRule) {
  const startTime = rule.startTime ?? "00:00";
  let endTime = rule.endTime ?? "23:59";
  if (rule.startTime && !rule.endTime) {
    const [hour, minute] = startTime.split(":").map((value) => Number.parseInt(value, 10));
    const plusOneHour = hour + 1;
    endTime = `${`${plusOneHour % 24}`.padStart(2, "0")}:${`${minute || 0}`.padStart(2, "0")}`;
  }

  return {
    startTime,
    endTime
  };
}

function buildSourceKey(rule: ProgramScheduleRule, localDate: string, localStartTime: string | null) {
  return `rule:${rule.id}:${localDate}:${localStartTime ?? "all-day"}:${rule.timezone}`;
}

function computeCandidateDates(rule: ProgramScheduleRule, nowDate: Date, horizonMonths: number): string[] {
  const { mode } = rule;
  const ruleStart = rule.startDate ? parseDate(rule.startDate) : nowDate;
  const untilFromMode = rule.endMode === "until_date" ? (rule.untilDate ? parseDate(rule.untilDate) : null) : null;
  const explicitEnd = rule.endDate ? parseDate(rule.endDate) : null;
  const horizonEnd = addMonths(nowDate, horizonMonths);
  const windowEnd = [untilFromMode, explicitEnd, horizonEnd].filter((value): value is Date => Boolean(value)).sort((a, b) => a.getTime() - b.getTime())[0] ?? horizonEnd;

  if (windowEnd.getTime() < ruleStart.getTime()) {
    return [];
  }

  if (mode === "single_date") {
    return rule.startDate ? [rule.startDate] : [];
  }

  if (mode === "multiple_specific_dates" || mode === "custom_advanced") {
    const specificDates = normalizeSpecificDates(rule.configJson);
    return specificDates
      .filter((date) => {
        const parsed = parseDate(date);
        return parsed.getTime() >= ruleStart.getTime() && parsed.getTime() <= windowEnd.getTime();
      })
      .sort();
  }

  if (mode === "continuous_date_range") {
    const values: string[] = [];
    let cursor = ruleStart;
    while (cursor.getTime() <= windowEnd.getTime()) {
      values.push(formatDate(cursor));
      cursor = addDays(cursor, 1);
    }
    return values;
  }

  const values: string[] = [];
  const intervalCount = Math.max(1, rule.intervalCount || 1);
  const intervalUnit = rule.intervalUnit ?? "week";
  const weekdays = (rule.byWeekday ?? []).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
  const monthdays = (rule.byMonthday ?? []).filter((value) => Number.isInteger(value) && value >= 1 && value <= 31);
  let cursor = ruleStart;

  while (cursor.getTime() <= windowEnd.getTime()) {
    const cursorWeekday = cursor.getUTCDay();
    const cursorMonthday = cursor.getUTCDate();
    const daysFromStart = dayDiff(ruleStart, cursor);
    const monthsFromStart = monthDiff(ruleStart, cursor);
    const weeksFromStart = Math.floor(daysFromStart / 7);

    let include = false;
    if (intervalUnit === "day") {
      include = daysFromStart % intervalCount === 0;
    } else if (intervalUnit === "week") {
      const weekdayMatch = weekdays.length === 0 ? cursorWeekday === ruleStart.getUTCDay() : weekdays.includes(cursorWeekday);
      include = weekdayMatch && weeksFromStart % intervalCount === 0;
    } else if (intervalUnit === "month") {
      const monthdayMatch = monthdays.length === 0 ? cursorMonthday === ruleStart.getUTCDate() : monthdays.includes(cursorMonthday);
      include = monthdayMatch && monthsFromStart % intervalCount === 0;
    }

    if (include) {
      values.push(formatDate(cursor));
    }

    cursor = addDays(cursor, 1);
  }

  return values;
}

export function generateOccurrencesForRule(rule: ProgramScheduleRule, options?: { nowDate?: Date; horizonMonths?: number }): GeneratedOccurrenceInput[] {
  if (!rule.isActive) {
    return [];
  }

  const nowDate = options?.nowDate ?? new Date();
  const horizonMonths = options?.horizonMonths ?? DEFAULT_SCHEDULE_HORIZON_MONTHS;
  const candidateDates = computeCandidateDates(rule, nowDate, horizonMonths);
  const { startTime, endTime } = normalizeTimeBounds(rule);
  const maxCount = rule.endMode === "after_occurrences" ? Math.max(0, rule.maxOccurrences ?? 0) : null;
  const selectedDates = maxCount ? candidateDates.slice(0, maxCount) : candidateDates;

  return selectedDates.map((localDate) => {
    const startUtc = zonedLocalToUtc(localDate, startTime, rule.timezone);
    let endUtc = zonedLocalToUtc(localDate, endTime, rule.timezone);
    if (endUtc.getTime() <= startUtc.getTime()) {
      endUtc = new Date(startUtc.getTime() + 60 * 60 * 1000);
    }

    return {
      sourceKey: buildSourceKey(rule, localDate, startTime),
      programNodeId: rule.programNodeId,
      sourceRuleId: rule.id,
      sourceType: "rule",
      title: rule.title,
      timezone: rule.timezone,
      localDate,
      localStartTime: startTime,
      localEndTime: endTime,
      startsAtUtc: startUtc.toISOString(),
      endsAtUtc: endUtc.toISOString(),
      status: "scheduled",
      metadataJson: {
        mode: rule.mode,
        generatedAt: new Date().toISOString(),
        sourceDateTime: withTime(localDate, startTime)
      }
    } satisfies GeneratedOccurrenceInput;
  });
}
