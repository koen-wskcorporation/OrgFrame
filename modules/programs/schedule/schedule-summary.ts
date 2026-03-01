import type { ProgramScheduleRule } from "@/modules/programs/types";

const weekdayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function joinWords(values: string[]) {
  if (values.length <= 1) {
    return values[0] ?? "";
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

export function buildScheduleRuleSummary(rule: ProgramScheduleRule): string {
  if (rule.mode === "single_date") {
    if (!rule.startDate) {
      return "Single date";
    }

    return `Single date on ${rule.startDate}`;
  }

  if (rule.mode === "multiple_specific_dates") {
    const specificDates = Array.isArray(rule.configJson.specificDates) ? rule.configJson.specificDates.length : 0;
    return `${specificDates || 0} specific date${specificDates === 1 ? "" : "s"}`;
  }

  if (rule.mode === "continuous_date_range") {
    if (rule.startDate && rule.endDate) {
      return `Continuous from ${rule.startDate} to ${rule.endDate}`;
    }

    return "Continuous date range";
  }

  if (rule.mode === "custom_advanced") {
    return "Custom advanced schedule";
  }

  const intervalCount = Math.max(1, rule.intervalCount || 1);
  const intervalUnit = rule.intervalUnit ?? "week";
  const cadence = intervalCount === 1 ? `Every ${intervalUnit}` : `Every ${intervalCount} ${intervalUnit}s`;
  const weekdays = (rule.byWeekday ?? [])
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6)
    .map((value) => weekdayLabels[value])
    .filter(Boolean);
  const weekdayText = weekdays.length > 0 ? ` on ${joinWords(weekdays)}` : "";
  const untilText =
    rule.endMode === "after_occurrences" && rule.maxOccurrences
      ? `, ${rule.maxOccurrences} total sessions`
      : rule.endMode === "until_date" && rule.untilDate
        ? `, until ${rule.untilDate}`
        : "";

  return `${titleCase(cadence)}${weekdayText}${untilText}`;
}
