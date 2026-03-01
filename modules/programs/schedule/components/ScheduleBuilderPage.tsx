"use client";

import { useMemo, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import {
  deleteProgramScheduleRuleAction,
  restoreProgramOccurrenceAction,
  skipProgramOccurrenceAction,
  updateProgramOccurrenceAction,
  upsertProgramScheduleRuleAction
} from "@/modules/programs/schedule/actions";
import { OccurrenceEditDialog } from "@/modules/programs/schedule/components/OccurrenceEditDialog";
import { OccurrencePreviewPanel, type OccurrencePreviewFilter } from "@/modules/programs/schedule/components/OccurrencePreviewPanel";
import { ScheduleCalendar, type CalendarSelectionMode } from "@/modules/programs/schedule/components/ScheduleCalendar";
import { TimelineView } from "@/modules/programs/schedule/components/TimelineView";
import { toOccurrenceEditDraft, toRuleDraft, type OccurrenceEditDraft, type ScheduleRuleDraft } from "@/modules/programs/schedule/components/types";
import type { ProgramNode, ProgramOccurrence, ProgramScheduleException, ProgramScheduleRule } from "@/modules/programs/types";

const weekdayItems = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 }
];

type ScheduleBuilderPageProps = {
  orgSlug: string;
  programId: string;
  canWrite: boolean;
  nodes: ProgramNode[];
  initialRules: ProgramScheduleRule[];
  initialOccurrences: ProgramOccurrence[];
  initialExceptions: ProgramScheduleException[];
  initialLegacyOccurrences?: ProgramOccurrence[];
  initialSource?: "v2" | "legacy";
};

function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function sortDatePair(a: string, b: string) {
  return a <= b ? [a, b] : [b, a];
}

function parseDateKey(value: string) {
  return new Date(`${value}T00:00:00`);
}

function formatDateKey(value: Date) {
  return `${value.getFullYear()}-${`${value.getMonth() + 1}`.padStart(2, "0")}-${`${value.getDate()}`.padStart(2, "0")}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function dayDiff(fromDate: Date, toDate: Date) {
  return Math.floor((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000));
}

function monthDiff(fromDate: Date, toDate: Date) {
  return (toDate.getFullYear() - fromDate.getFullYear()) * 12 + (toDate.getMonth() - fromDate.getMonth());
}

function uniqueSortedDates(values: string[]) {
  return Array.from(new Set(values)).sort();
}

function buildRange(startDate: string, endDate: string) {
  if (!startDate || !endDate) {
    return [];
  }

  const [minDate, maxDate] = sortDatePair(startDate, endDate);
  const values: string[] = [];
  let cursor = parseDateKey(minDate);
  const target = parseDateKey(maxDate);
  while (cursor.getTime() <= target.getTime()) {
    values.push(formatDateKey(cursor));
    cursor = addDays(cursor, 1);
  }
  return values;
}

function weekdayFromDateKey(dateKey: string) {
  return parseDateKey(dateKey).getDay();
}

function datesFromOccurrences(occurrences: ProgramOccurrence[]) {
  return uniqueSortedDates(occurrences.map((occurrence) => occurrence.localDate));
}

function createInitialDraft(rule: ProgramScheduleRule | undefined, occurrences: ProgramOccurrence[]): ScheduleRuleDraft {
  const base = toRuleDraft(rule);
  const occurrenceDates = datesFromOccurrences(occurrences);

  if (occurrenceDates.length === 0) {
    return {
      ...base,
      mode: "multiple_specific_dates",
      repeatEnabled: false
    };
  }

  return {
    ...base,
    mode: "multiple_specific_dates",
    repeatEnabled: false,
    specificDates: occurrenceDates,
    startDate: occurrenceDates[0],
    endDate: occurrenceDates.at(-1) ?? occurrenceDates[0],
    startTime: base.startTime || occurrences[0]?.localStartTime || "",
    endTime: base.endTime || occurrences[0]?.localEndTime || ""
  };
}

function generatePatternDates(draft: ScheduleRuleDraft) {
  if (!draft.startDate || !draft.untilDate) {
    return [];
  }

  const start = parseDateKey(draft.startDate);
  const until = parseDateKey(draft.untilDate);
  if (until.getTime() < start.getTime()) {
    return [];
  }

  const intervalCount = Math.max(1, draft.intervalCount || 1);
  const intervalUnit = draft.intervalUnit || "week";
  const weekdays = draft.byWeekday.length > 0 ? draft.byWeekday : [start.getDay()];
  const monthdays = draft.byMonthday.length > 0 ? draft.byMonthday : [start.getDate()];

  const results: string[] = [];
  let cursor = new Date(start.getTime());

  while (cursor.getTime() <= until.getTime()) {
    const daysFromStart = dayDiff(start, cursor);
    const weeksFromStart = Math.floor(daysFromStart / 7);
    const monthsFromStart = monthDiff(start, cursor);
    let include = false;

    if (intervalUnit === "day") {
      include = daysFromStart % intervalCount === 0;
    } else if (intervalUnit === "week") {
      include = weeksFromStart % intervalCount === 0 && weekdays.includes(cursor.getDay());
    } else {
      include = monthsFromStart % intervalCount === 0 && monthdays.includes(cursor.getDate());
    }

    if (include) {
      results.push(formatDateKey(cursor));
    }

    cursor = addDays(cursor, 1);
  }

  return uniqueSortedDates(results);
}

export function ScheduleBuilderPage({
  orgSlug,
  programId,
  canWrite,
  nodes,
  initialRules,
  initialOccurrences,
  initialExceptions,
  initialLegacyOccurrences,
  initialSource = "v2"
}: ScheduleBuilderPageProps) {
  const { toast } = useToast();
  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const initialAllOccurrences = initialOccurrences.length > 0 ? initialOccurrences : initialLegacyOccurrences ?? [];

  const [rules, setRules] = useState<ProgramScheduleRule[]>(initialRules);
  const [occurrences, setOccurrences] = useState<ProgramOccurrence[]>(initialAllOccurrences);
  const [exceptions, setExceptions] = useState<ProgramScheduleException[]>(initialExceptions);
  const [source, setSource] = useState<"v2" | "legacy">(initialSource);

  const [draft, setDraft] = useState<ScheduleRuleDraft>(() => createInitialDraft(initialRules[0], initialAllOccurrences));
  const [calendarSelectionMode, setCalendarSelectionMode] = useState<CalendarSelectionMode>("multiple");
  const [rangeAnchorDate, setRangeAnchorDate] = useState<string | null>(null);

  const [monthAnchor, setMonthAnchor] = useState<Date>(() => {
    const seed = initialAllOccurrences[0]?.localDate;
    return seed ? parseDateKey(seed) : new Date();
  });
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [previewFilter, setPreviewFilter] = useState<OccurrencePreviewFilter>("all");
  const [detailView, setDetailView] = useState<"preview" | "timeline">("preview");

  const [occurrenceDraft, setOccurrenceDraft] = useState<OccurrenceEditDraft | null>(null);
  const [isOccurrenceDialogOpen, setIsOccurrenceDialogOpen] = useState(false);

  const [isSavingSchedule, startSavingSchedule] = useTransition();
  const [isMutatingOccurrences, startMutatingOccurrences] = useTransition();
  const [isApplyingPattern, startApplyingPattern] = useTransition();

  const selectedDateKeys = useMemo(() => uniqueSortedDates(draft.specificDates), [draft.specificDates]);
  const selectedDates = useMemo(() => new Set(selectedDateKeys), [selectedDateKeys]);

  function applyReadModel(next: { rules: ProgramScheduleRule[]; occurrences: ProgramOccurrence[]; exceptions: ProgramScheduleException[] }) {
    setRules(next.rules);
    setOccurrences(next.occurrences);
    setExceptions(next.exceptions);
    setSource("v2");
  }

  function handleSelectionModeChange(nextMode: CalendarSelectionMode) {
    setCalendarSelectionMode(nextMode);
    setRangeAnchorDate(null);
  }

  function applySelectedDateSet(nextDates: string[]) {
    const normalized = uniqueSortedDates(nextDates);
    setDraft((current) => ({
      ...current,
      mode: "multiple_specific_dates",
      specificDates: normalized,
      startDate: normalized[0] ?? current.startDate,
      endDate: normalized.at(-1) ?? current.endDate
    }));
  }

  function handleSelectDate(dateKey: string) {
    setSelectedDateKey(dateKey);
    setMonthAnchor(parseDateKey(dateKey));

    if (calendarSelectionMode === "single") {
      applySelectedDateSet([dateKey]);
      return;
    }

    if (calendarSelectionMode === "range") {
      if (!rangeAnchorDate) {
        setRangeAnchorDate(dateKey);
        return;
      }

      const nextRange = buildRange(rangeAnchorDate, dateKey);
      setRangeAnchorDate(null);
      applySelectedDateSet([...selectedDateKeys, ...nextRange]);
      return;
    }

    const exists = selectedDates.has(dateKey);
    applySelectedDateSet(exists ? selectedDateKeys.filter((value) => value !== dateKey) : [...selectedDateKeys, dateKey]);
  }

  function handleSelectRange(startDateKey: string, endDateKey: string) {
    const [startDate, endDate] = sortDatePair(startDateKey, endDateKey);
    setSelectedDateKey(endDate);

    if (calendarSelectionMode === "single") {
      applySelectedDateSet([startDate]);
      return;
    }

    const nextRange = buildRange(startDate, endDate);
    applySelectedDateSet(calendarSelectionMode === "range" ? [...selectedDateKeys, ...nextRange] : [...selectedDateKeys, ...nextRange]);
  }

  function openOccurrenceEditor(occurrenceId: string) {
    const found = occurrences.find((occurrence) => occurrence.id === occurrenceId);
    if (!found) {
      return;
    }

    setOccurrenceDraft(toOccurrenceEditDraft(found));
    setIsOccurrenceDialogOpen(true);
  }

  function handleApplyPattern() {
    startApplyingPattern(async () => {
      const generatedDates = generatePatternDates(draft);
      if (generatedDates.length === 0) {
        toast({
          title: "No dates generated",
          description: "Set a pattern start and end date to generate recurring dates.",
          variant: "destructive"
        });
        return;
      }

      applySelectedDateSet([...selectedDateKeys, ...generatedDates]);
      toast({
        title: "Pattern applied",
        description: `${generatedDates.length} date${generatedDates.length === 1 ? "" : "s"} added to the calendar selection.`,
        variant: "success"
      });
    });
  }

  function handleClearDates() {
    applySelectedDateSet([]);
    setRangeAnchorDate(null);
  }

  function handleSaveSchedule() {
    startSavingSchedule(async () => {
      if (selectedDateKeys.length === 0) {
        toast({
          title: "No schedule dates selected",
          description: "Select at least one date on the calendar before saving.",
          variant: "destructive"
        });
        return;
      }

      const keepRuleId = rules[0]?.id ?? draft.ruleId;
      const extraRuleIds = rules
        .map((rule) => rule.id)
        .filter((ruleId) => (keepRuleId ? ruleId !== keepRuleId : true));

      for (const ruleId of extraRuleIds) {
        const deleteResult = await deleteProgramScheduleRuleAction({
          orgSlug,
          programId,
          ruleId
        });

        if (!deleteResult.ok) {
          toast({
            title: "Unable to clean up old schedule rules",
            description: deleteResult.error,
            variant: "destructive"
          });
          return;
        }
      }

      const result = await upsertProgramScheduleRuleAction({
        orgSlug,
        programId,
        ruleId: keepRuleId,
        mode: "multiple_specific_dates",
        title: draft.title,
        timezone: browserTimezone,
        startDate: selectedDateKeys[0],
        endDate: selectedDateKeys.at(-1),
        startTime: draft.startTime,
        endTime: draft.endTime,
        intervalCount: 1,
        intervalUnit: "week",
        byWeekday: [],
        byMonthday: [],
        endMode: "until_date",
        untilDate: selectedDateKeys.at(-1),
        maxOccurrences: null,
        configJson: {
          specificDates: selectedDateKeys
        }
      });

      if (!result.ok) {
        toast({
          title: "Unable to save schedule",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      applyReadModel(result.data.readModel);
      const nextDraft = createInitialDraft(result.data.readModel.rules[0], result.data.readModel.occurrences);
      setDraft((current) => ({
        ...nextDraft,
        title: current.title,
        startTime: current.startTime,
        endTime: current.endTime,
        intervalCount: current.intervalCount,
        intervalUnit: current.intervalUnit,
        byWeekday: current.byWeekday,
        byMonthday: current.byMonthday,
        startDate: current.startDate,
        untilDate: current.untilDate
      }));
      toast({
        title: "Schedule saved",
        description: `${selectedDateKeys.length} date${selectedDateKeys.length === 1 ? "" : "s"} saved.`,
        variant: "success"
      });
    });
  }

  function handleSaveOccurrence() {
    if (!occurrenceDraft || !occurrenceDraft.occurrenceId) {
      return;
    }
    const occurrenceId = occurrenceDraft.occurrenceId;

    startMutatingOccurrences(async () => {
      const result = await updateProgramOccurrenceAction({
        orgSlug,
        programId,
        occurrenceId,
        title: occurrenceDraft.title,
        programNodeId: occurrenceDraft.programNodeId || null,
        timezone: browserTimezone,
        localDate: occurrenceDraft.localDate,
        localStartTime: occurrenceDraft.localStartTime,
        localEndTime: occurrenceDraft.localEndTime
      });

      if (!result.ok) {
        toast({
          title: "Unable to save occurrence",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      applyReadModel(result.data.readModel);
      setIsOccurrenceDialogOpen(false);
      setOccurrenceDraft(null);
      toast({
        title: "Occurrence saved",
        variant: "success"
      });
    });
  }

  function handleSkipOccurrence(occurrenceId: string) {
    startMutatingOccurrences(async () => {
      const result = await skipProgramOccurrenceAction({
        orgSlug,
        programId,
        occurrenceId
      });

      if (!result.ok) {
        toast({
          title: "Unable to skip occurrence",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      applyReadModel(result.data.readModel);
      toast({
        title: "Occurrence skipped",
        variant: "success"
      });
    });
  }

  function handleRestoreException(ruleId: string, sourceKey: string) {
    startMutatingOccurrences(async () => {
      const result = await restoreProgramOccurrenceAction({
        orgSlug,
        programId,
        ruleId,
        sourceKey
      });

      if (!result.ok) {
        toast({
          title: "Unable to restore occurrence",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      applyReadModel(result.data.readModel);
      toast({
        title: "Occurrence restored",
        variant: "success"
      });
    });
  }

  return (
    <div className="space-y-4">
      {source === "legacy" ? (
        <Alert variant="info">This program is still using legacy schedule blocks. Saving this page will migrate it to the new calendar-based schedule.</Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[minmax(280px,360px)_1fr]">
        <div className="space-y-4">
          <Card className="border-border bg-surface">
            <CardHeader className="space-y-1">
              <CardTitle className="text-base">Schedule Tools</CardTitle>
              <CardDescription>The saved schedule is exactly the selected dates on the calendar.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <FormField hint="Optional" label="Session title">
                <Input onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} value={draft.title} />
              </FormField>

              <FormField label="Time range">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    onChange={(event) => setDraft((current) => ({ ...current, startTime: event.target.value }))}
                    type="time"
                    value={draft.startTime}
                  />
                  <Input
                    onChange={(event) => setDraft((current) => ({ ...current, endTime: event.target.value }))}
                    type="time"
                    value={draft.endTime}
                  />
                </div>
              </FormField>

              <div className="rounded-control border border-border bg-surface-muted/40 px-3 py-2 text-sm text-text-muted">
                {selectedDateKeys.length} date{selectedDateKeys.length === 1 ? "" : "s"} selected
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button disabled={!canWrite || selectedDateKeys.length === 0} onClick={handleClearDates} size="sm" type="button" variant="ghost">
                  Clear dates
                </Button>
                <Button disabled={!canWrite || selectedDateKeys.length === 0} loading={isSavingSchedule} onClick={handleSaveSchedule} size="sm" type="button">
                  Save schedule
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-surface">
            <CardHeader className="space-y-1">
              <CardTitle className="text-base">Repeat Pattern Tool</CardTitle>
              <CardDescription>Generate recurring dates and merge them into your current calendar selection.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-[120px_1fr]">
                <FormField label="Every">
                  <Input
                    min={1}
                    onChange={(event) => {
                      const next = Number.parseInt(event.target.value, 10);
                      setDraft((current) => ({ ...current, intervalCount: Number.isFinite(next) && next > 0 ? next : 1 }));
                    }}
                    type="number"
                    value={draft.intervalCount}
                  />
                </FormField>
                <FormField label="Unit">
                  <select
                    className="h-10 w-full rounded-control border border-border bg-surface px-3 text-sm text-text"
                    onChange={(event) => setDraft((current) => ({ ...current, intervalUnit: event.target.value as "day" | "week" | "month" }))}
                    value={draft.intervalUnit}
                  >
                    <option value="week">Weeks</option>
                    <option value="day">Days</option>
                    <option value="month">Months</option>
                  </select>
                </FormField>
              </div>

              <FormField label="Days of week (for weekly patterns)">
                <div className="flex flex-wrap gap-1">
                  {weekdayItems.map((item) => {
                    const active = draft.byWeekday.includes(item.value);
                    return (
                      <button
                        className={cn(
                          "rounded-control border px-2 py-1 text-xs font-semibold transition-colors",
                          active ? "border-accent bg-accent/10 text-text" : "border-border bg-surface text-text-muted hover:text-text"
                        )}
                        key={item.value}
                        onClick={() => {
                          const next = active
                            ? draft.byWeekday.filter((value) => value !== item.value)
                            : [...draft.byWeekday, item.value].sort((a, b) => a - b);
                          setDraft((current) => ({ ...current, byWeekday: next }));
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
                <FormField label="Pattern starts">
                  <Input
                    onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))}
                    type="date"
                    value={draft.startDate}
                  />
                </FormField>
                <FormField label="Pattern ends">
                  <Input
                    onChange={(event) => setDraft((current) => ({ ...current, untilDate: event.target.value }))}
                    type="date"
                    value={draft.untilDate}
                  />
                </FormField>
              </div>

              <Button disabled={!canWrite} loading={isApplyingPattern} onClick={handleApplyPattern} size="sm" type="button" variant="secondary">
                Add pattern dates
              </Button>
            </CardContent>
          </Card>
        </div>

        <ScheduleCalendar
          monthAnchor={monthAnchor}
          occurrences={occurrences}
          onEditOccurrence={openOccurrenceEditor}
          onMonthChange={setMonthAnchor}
          onSelectionModeChange={handleSelectionModeChange}
          onSelectDate={handleSelectDate}
          onSelectRange={handleSelectRange}
          selectionMode={calendarSelectionMode}
          selectedDates={selectedDates}
        />
      </div>

      <Card className="border-border bg-surface">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Schedule Views</CardTitle>
              <CardDescription>Preview generated sessions or switch to timeline format.</CardDescription>
            </div>
            <div className="flex items-center gap-1 rounded-control border border-border bg-surface p-1">
              <button
                className={
                  detailView === "preview"
                    ? "rounded-control bg-surface-muted px-3 py-1 text-xs font-semibold text-text"
                    : "rounded-control px-3 py-1 text-xs font-semibold text-text-muted"
                }
                onClick={() => setDetailView("preview")}
                type="button"
              >
                Preview
              </button>
              <button
                className={
                  detailView === "timeline"
                    ? "rounded-control bg-surface-muted px-3 py-1 text-xs font-semibold text-text"
                    : "rounded-control px-3 py-1 text-xs font-semibold text-text-muted"
                }
                onClick={() => setDetailView("timeline")}
                type="button"
              >
                Timeline
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {detailView === "preview" ? (
            <OccurrencePreviewPanel
              canWrite={canWrite}
              exceptions={exceptions}
              filter={previewFilter}
              isMutating={isMutatingOccurrences}
              occurrences={occurrences}
              onEditOccurrence={openOccurrenceEditor}
              onFilterChange={setPreviewFilter}
              onRestoreException={handleRestoreException}
              onSkipOccurrence={handleSkipOccurrence}
              summary={`${selectedDateKeys.length} selected date${selectedDateKeys.length === 1 ? "" : "s"} in schedule`}
            />
          ) : (
            <TimelineView canWrite={canWrite} isMutating={isMutatingOccurrences} occurrences={occurrences} onEditOccurrence={openOccurrenceEditor} />
          )}
        </CardContent>
      </Card>

      <OccurrenceEditDialog
        canWrite={canWrite}
        draft={occurrenceDraft}
        isSaving={isMutatingOccurrences}
        nodes={nodes}
        onChange={(next) => setOccurrenceDraft(next)}
        onClose={() => {
          setIsOccurrenceDialogOpen(false);
          setOccurrenceDraft(null);
        }}
        onSave={handleSaveOccurrence}
        open={isOccurrenceDialogOpen}
      />
    </div>
  );
}
