"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ProgramNode } from "@/modules/programs/types";
import { buildScheduleRuleSummary } from "@/modules/programs/schedule/schedule-summary";
import type { ScheduleRuleDraft } from "@/modules/programs/schedule/components/types";

const weekdayItems = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 }
];

type RuleBuilderPanelProps = {
  draft: ScheduleRuleDraft;
  nodes: ProgramNode[];
  canWrite: boolean;
  isSaving: boolean;
  onChange: (next: ScheduleRuleDraft) => void;
  onSave: () => void;
};

export function RuleBuilderPanel({ draft, nodes: _nodes, canWrite, isSaving, onChange, onSave }: RuleBuilderPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [specificDateInput, setSpecificDateInput] = useState("");

  const summary = useMemo(
    () =>
      buildScheduleRuleSummary({
        id: draft.ruleId ?? "draft",
        programId: "draft",
        programNodeId: draft.programNodeId || null,
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
        configJson: { specificDates: draft.specificDates },
        ruleHash: "",
        createdAt: "",
        updatedAt: ""
      }),
    [draft]
  );

  return (
    <Card className="border-border bg-surface shadow-card">
      <CardHeader className="space-y-1">
        <CardTitle>Rule Builder</CardTitle>
        <CardDescription>{summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <FormField hint="Optional" label="Title">
          <Input
            disabled={!canWrite}
            onChange={(event) =>
              onChange({
                ...draft,
                title: event.target.value
              })
            }
            value={draft.title}
          />
        </FormField>

        {draft.mode === "single_date" || draft.mode === "multiple_specific_dates" || draft.mode === "custom_advanced" ? (
          <div className="space-y-2">
            <FormField label="Time range">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  disabled={!canWrite}
                  onChange={(event) => onChange({ ...draft, startTime: event.target.value })}
                  type="time"
                  value={draft.startTime}
                />
                <Input
                  disabled={!canWrite}
                  onChange={(event) => onChange({ ...draft, endTime: event.target.value })}
                  type="time"
                  value={draft.endTime}
                />
              </div>
            </FormField>
            <FormField label="Add date">
              <div className="flex gap-2">
                <Input
                  disabled={!canWrite}
                  onChange={(event) => {
                    const nextDate = event.target.value;
                    setSpecificDateInput(nextDate);
                    if (!nextDate) {
                      return;
                    }
                    if (draft.specificDates.includes(nextDate)) {
                      return;
                    }
                    onChange({
                      ...draft,
                      startDate: [...draft.specificDates, nextDate].sort()[0] ?? nextDate,
                      endDate: [...draft.specificDates, nextDate].sort()[0] ?? nextDate,
                      specificDates: [...draft.specificDates, nextDate].sort()
                    });
                    setSpecificDateInput("");
                  }}
                  type="date"
                  value={specificDateInput}
                />
              </div>
            </FormField>
            <div className="flex flex-wrap gap-1">
              {draft.specificDates.length === 0 ? <p className="text-xs text-text-muted">No dates selected yet.</p> : null}
              {draft.specificDates.map((date) => (
                <button
                  className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs text-text-muted hover:bg-surface"
                  disabled={!canWrite}
                  key={date}
                  onClick={() =>
                    onChange({
                      ...draft,
                      specificDates: draft.specificDates.filter((item) => item !== date),
                      startDate: draft.specificDates.filter((item) => item !== date)[0] ?? "",
                      endDate: draft.specificDates.filter((item) => item !== date)[0] ?? ""
                    })
                  }
                  type="button"
                >
                  {date} ×
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {draft.mode === "continuous_date_range" ? (
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Start date">
              <Input
                disabled={!canWrite}
                onChange={(event) => onChange({ ...draft, startDate: event.target.value })}
                type="date"
                value={draft.startDate}
              />
            </FormField>
            <FormField label="End date">
              <Input
                disabled={!canWrite}
                onChange={(event) => onChange({ ...draft, endDate: event.target.value })}
                type="date"
                value={draft.endDate}
              />
            </FormField>
          </div>
        ) : null}

        <label className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-sm text-text">
          <Checkbox
            checked={draft.repeatEnabled}
            disabled={!canWrite}
            onChange={(event) =>
              onChange({
                ...draft,
                repeatEnabled: event.target.checked
              })
            }
          />
          Repeat this pattern
        </label>

        {draft.repeatEnabled ? (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <FormField label="Starts on">
                <Input
                  disabled={!canWrite}
                  onChange={(event) => onChange({ ...draft, startDate: event.target.value })}
                  type="date"
                  value={draft.startDate}
                />
              </FormField>
              <FormField label="Time range">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    disabled={!canWrite}
                    onChange={(event) => onChange({ ...draft, startTime: event.target.value })}
                    type="time"
                    value={draft.startTime}
                  />
                  <Input
                    disabled={!canWrite}
                    onChange={(event) => onChange({ ...draft, endTime: event.target.value })}
                    type="time"
                    value={draft.endTime}
                  />
                </div>
              </FormField>
            </div>
            <div className="grid gap-3 md:grid-cols-[120px_1fr]">
              <FormField label="Every">
                <Input
                  disabled={!canWrite}
                  min={1}
                  onChange={(event) => {
                    const next = Number.parseInt(event.target.value, 10);
                    onChange({ ...draft, intervalCount: Number.isFinite(next) && next > 0 ? next : 1 });
                  }}
                  type="number"
                  value={draft.intervalCount}
                />
              </FormField>
              <FormField label="Unit">
                <select
                  className="h-10 w-full rounded-control border border-border bg-surface px-3 text-sm text-text"
                  disabled={!canWrite}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      intervalUnit: event.target.value as "day" | "week" | "month"
                    })
                  }
                  value={draft.intervalUnit}
                >
                  <option value="week">Weeks</option>
                  <option value="day">Days</option>
                  <option value="month">Months</option>
                </select>
              </FormField>
            </div>
            <FormField label="Days of week">
              <div className="flex flex-wrap gap-1">
                {weekdayItems.map((item) => {
                  const active = draft.byWeekday.includes(item.value);
                  return (
                    <button
                      className={cn(
                        "rounded-control border px-2 py-1 text-xs font-semibold transition-colors",
                        active ? "border-accent bg-accent/10 text-text" : "border-border bg-surface text-text-muted hover:text-text"
                      )}
                      disabled={!canWrite}
                      key={item.value}
                      onClick={() => {
                        const next = active ? draft.byWeekday.filter((value) => value !== item.value) : [...draft.byWeekday, item.value].sort((a, b) => a - b);
                        onChange({
                          ...draft,
                          byWeekday: next
                        });
                      }}
                      type="button"
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </FormField>

            <div className="grid gap-3 md:grid-cols-2">
              <FormField label="Ends">
                <select
                  className="h-10 w-full rounded-control border border-border bg-surface px-3 text-sm text-text"
                  disabled={!canWrite}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      endMode: event.target.value as ScheduleRuleDraft["endMode"]
                    })
                  }
                  value={draft.endMode}
                >
                  <option value="until_date">On date</option>
                  <option value="after_occurrences">After number of sessions</option>
                  <option value="never">Never (18-month preview)</option>
                </select>
              </FormField>
              {draft.endMode === "until_date" ? (
                <FormField label="Until date">
                  <Input
                    disabled={!canWrite}
                    onChange={(event) => onChange({ ...draft, untilDate: event.target.value })}
                    type="date"
                    value={draft.untilDate}
                  />
                </FormField>
              ) : null}
              {draft.endMode === "after_occurrences" ? (
                <FormField label="Max sessions">
                  <Input
                    disabled={!canWrite}
                    min={1}
                    onChange={(event) => onChange({ ...draft, maxOccurrences: event.target.value })}
                    type="number"
                    value={draft.maxOccurrences}
                  />
                </FormField>
              ) : null}
            </div>

            <button
              className="text-xs font-semibold text-link hover:underline"
              onClick={() => setShowAdvanced((current) => !current)}
              type="button"
            >
              {showAdvanced ? "Hide advanced pattern options" : "Show advanced pattern options"}
            </button>

            {showAdvanced ? (
              <FormField hint="Comma-separated values (1-31)." label="Month days (advanced)">
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
                  placeholder="1,15,28"
                  value={draft.byMonthday.join(",")}
                />
              </FormField>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button disabled={!canWrite || isSaving} loading={isSaving} onClick={onSave} type="button">
            {draft.ruleId ? "Update rule" : "Save rule"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
