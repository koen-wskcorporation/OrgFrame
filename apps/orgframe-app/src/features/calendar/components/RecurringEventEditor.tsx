"use client";

import { useMemo, useState } from "react";
import { Button } from "@orgframe/ui/primitives/button";
import { CalendarPicker } from "@orgframe/ui/primitives/calendar-picker";
import { Checkbox } from "@orgframe/ui/primitives/checkbox";
import { Input } from "@orgframe/ui/primitives/input";
import { cn } from "@orgframe/ui/primitives/utils";
import { buildScheduleRuleSummary } from "@/src/features/programs/schedule/schedule-summary";
import type { ScheduleRuleDraft } from "@/src/features/programs/schedule/components/types";

const weekdayItems = [
  { label: "S", value: 0 },
  { label: "M", value: 1 },
  { label: "T", value: 2 },
  { label: "W", value: 3 },
  { label: "Th", value: 4 },
  { label: "F", value: 5 },
  { label: "Sa", value: 6 }
];

type RecurringEventEditorProps = {
  draft: ScheduleRuleDraft;
  canWrite: boolean;
  onChange: (next: ScheduleRuleDraft) => void;
  className?: string;
};

function buildSummary(draft: ScheduleRuleDraft) {
  return buildScheduleRuleSummary({
    id: "draft",
    programId: "draft",
    programNodeId: null,
    mode: draft.repeatEnabled ? "repeating_pattern" : draft.mode,
    title: draft.title || null,
    timezone: draft.timezone,
    startDate: draft.startDate || null,
    endDate: draft.endDate || null,
    startTime: draft.startTime || null,
    endTime: draft.endTime || null,
    intervalCount: draft.intervalCount,
    intervalUnit: draft.intervalUnit,
    byWeekday: draft.byWeekday,
    byMonthday: draft.byMonthday,
    endMode: draft.endMode,
    untilDate: draft.untilDate || null,
    maxOccurrences: draft.maxOccurrences ? Number.parseInt(draft.maxOccurrences, 10) : null,
    sortIndex: 0,
    isActive: true,
    configJson: {
      specificDates: draft.specificDates
    },
    ruleHash: "",
    createdAt: "",
    updatedAt: ""
  });
}

function resolveStartWeekday(draft: ScheduleRuleDraft) {
  if (draft.startDate) {
    const parsed = new Date(`${draft.startDate}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getDay();
    }
  }
  return new Date().getDay();
}

export function RecurringEventEditor({ draft, canWrite, onChange, className }: RecurringEventEditorProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const summary = useMemo(() => buildSummary(draft), [draft]);

  const intervalCount = Math.max(1, Number.isFinite(draft.intervalCount) ? draft.intervalCount : 1);
  const startWeekday = resolveStartWeekday(draft);
  const activeWeekdays = draft.byWeekday.length > 0 ? draft.byWeekday : [startWeekday];
  const untilDateValue = draft.untilDate || draft.startDate;

  return (
    <div className={cn("space-y-3 rounded-control border bg-surface p-3", className)}>
      <p className="rounded-control border border-border/70 bg-surface-muted/40 px-2 py-1 text-xs text-text-muted">{summary}</p>

      <label className="ui-inline-toggle">
        <Checkbox
          checked={draft.repeatEnabled}
          disabled={!canWrite}
          onChange={(event) =>
            onChange({
              ...draft,
              repeatEnabled: event.target.checked,
              intervalCount: 1,
              intervalUnit: "week",
              byWeekday: activeWeekdays,
              endMode: "until_date",
              untilDate: draft.untilDate || draft.startDate
            })
          }
        />
        Repeat event
      </label>

      {!draft.repeatEnabled ? <p className="text-xs text-text-muted">No recurrence. This is a single occurrence.</p> : null}

      {draft.repeatEnabled ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-text-muted">Repeats every</p>
            <Input
              className="w-20"
              disabled={!canWrite}
              min={1}
              onChange={(event) => {
                const next = Number.parseInt(event.target.value, 10);
                onChange({
                  ...draft,
                  intervalCount: Number.isFinite(next) && next > 0 ? next : 1,
                  intervalUnit: "week"
                });
              }}
              type="number"
              value={intervalCount}
            />
            <p className="text-sm text-text-muted">week{intervalCount === 1 ? "" : "s"}</p>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Repeat on</p>
            <div className="flex flex-wrap gap-1">
              {weekdayItems.map((day) => {
                const active = activeWeekdays.includes(day.value);
                return (
                  <button
                    className={cn(
                      "rounded-control border px-2 py-1 text-xs font-semibold transition-colors",
                      active ? "border-accent bg-accent/10 text-text" : "border-border bg-surface text-text-muted hover:text-text"
                    )}
                    disabled={!canWrite}
                    key={day.value}
                    onClick={() => {
                      const base = draft.byWeekday.length > 0 ? draft.byWeekday : activeWeekdays;
                      const removing = base.includes(day.value);
                      const next = removing ? base.filter((value) => value !== day.value) : [...base, day.value].sort((a, b) => a - b);
                      onChange({
                        ...draft,
                        byWeekday: next.length > 0 ? next : [day.value]
                      });
                    }}
                    type="button"
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Ends</p>
            <div className="space-y-2">
              <label className="ui-inline-toggle">
                <Checkbox
                  checked={draft.endMode === "after_occurrences"}
                  disabled={!canWrite}
                  onChange={() => onChange({ ...draft, endMode: "after_occurrences", maxOccurrences: draft.maxOccurrences || "1" })}
                />
                <span className="text-sm text-text-muted">After</span>
                <Input
                  className="w-24"
                  disabled={!canWrite || draft.endMode !== "after_occurrences"}
                  min={1}
                  onChange={(event) => onChange({ ...draft, maxOccurrences: event.target.value })}
                  type="number"
                  value={draft.maxOccurrences}
                />
                <span className="text-sm text-text-muted">occurrences</span>
              </label>

              <label className="ui-inline-toggle">
                <Checkbox
                  checked={draft.endMode === "until_date"}
                  disabled={!canWrite}
                  onChange={() => onChange({ ...draft, endMode: "until_date", untilDate: draft.untilDate || draft.startDate })}
                />
                <span className="text-sm text-text-muted">On</span>
                <CalendarPicker
                  className="w-[180px]"
                  disabled={!canWrite || draft.endMode !== "until_date"}
                  onChange={(nextValue) => onChange({ ...draft, untilDate: nextValue })}
                  value={untilDateValue}
                />
              </label>
            </div>
          </div>

          <div className="pt-1">
            <Button onClick={() => setShowAdvanced((current) => !current)} size="sm" type="button" variant="ghost">
              {showAdvanced ? "Hide advanced options" : "Show advanced options"}
            </Button>
          </div>

          {showAdvanced ? (
            <div className="grid gap-3 rounded-control border bg-surface-muted/40 p-3 md:grid-cols-2">
              <label className="space-y-1 text-xs text-text-muted">
                <span>Interval unit</span>
                <select
                  className="h-10 w-full rounded-control border border-border bg-surface px-3 text-sm text-text"
                  disabled={!canWrite}
                  onChange={(event) => onChange({ ...draft, intervalUnit: event.target.value as "day" | "week" | "month" })}
                  value={draft.intervalUnit}
                >
                  <option value="week">Weeks</option>
                  <option value="day">Days</option>
                  <option value="month">Months</option>
                </select>
              </label>

              <label className="space-y-1 text-xs text-text-muted">
                <span>End mode</span>
                <select
                  className="h-10 w-full rounded-control border border-border bg-surface px-3 text-sm text-text"
                  disabled={!canWrite}
                  onChange={(event) => onChange({ ...draft, endMode: event.target.value as ScheduleRuleDraft["endMode"] })}
                  value={draft.endMode}
                >
                  <option value="until_date">On date</option>
                  <option value="after_occurrences">After occurrences</option>
                  <option value="never">Never (18-month preview)</option>
                </select>
              </label>

              <label className="space-y-1 text-xs text-text-muted md:col-span-2">
                <span>Month days (advanced, comma-separated 1-31)</span>
                <Input
                  disabled={!canWrite}
                  onChange={(event) => {
                    const values = event.target.value
                      .split(",")
                      .map((value) => Number.parseInt(value.trim(), 10))
                      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 31);
                    onChange({
                      ...draft,
                      byMonthday: values
                    });
                  }}
                  placeholder="1, 15, 28"
                  value={draft.byMonthday.join(",")}
                />
              </label>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
