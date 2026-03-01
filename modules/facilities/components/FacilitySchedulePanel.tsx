"use client";

import { useMemo, useState } from "react";
import { CalendarPlus2, Clock4, Plus, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BlackoutEditorPanel } from "@/modules/facilities/components/BlackoutEditorPanel";
import { FacilityStatusBadge } from "@/modules/facilities/components/FacilityStatusBadge";
import { ReservationEditorPanel, type ReservationEditorSubmitInput } from "@/modules/facilities/components/ReservationEditorPanel";
import type { FacilityReservation, FacilityReservationRule, FacilitySpace } from "@/modules/facilities/types";

type RuleDraft = {
  ruleId?: string;
  spaceId: string;
  mode: FacilityReservationRule["mode"];
  reservationKind: FacilityReservationRule["reservationKind"];
  defaultStatus: FacilityReservationRule["defaultStatus"];
  publicLabel: string;
  internalNotes: string;
  timezone: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  intervalCount: string;
  intervalUnit: "day" | "week" | "month";
  byWeekday: string;
  byMonthday: string;
  endMode: FacilityReservationRule["endMode"];
  untilDate: string;
  maxOccurrences: string;
  conflictOverride: boolean;
  specificDates: string;
};

type FacilitySchedulePanelProps = {
  spaces: FacilitySpace[];
  reservations: FacilityReservation[];
  rules: FacilityReservationRule[];
  canWrite: boolean;
  onCreateReservation: (input: ReservationEditorSubmitInput) => void;
  onUpdateReservation: (input: ReservationEditorSubmitInput) => void;
  onApproveReservation: (reservationId: string) => void;
  onRejectReservation: (reservationId: string) => void;
  onCancelReservation: (reservationId: string) => void;
  onRestoreReservation: (reservationId: string) => void;
  onCreateBlackout: (input: ReservationEditorSubmitInput) => void;
  onUpdateBlackout: (input: ReservationEditorSubmitInput) => void;
  onCancelBlackout: (reservationId: string) => void;
  onSaveRule: (input: RuleDraft) => void;
  onDeleteRule: (ruleId: string) => void;
};

function toRuleDraft(rule?: FacilityReservationRule | null): RuleDraft {
  const specificDatesRaw = Array.isArray(rule?.configJson.specificDates) ? rule?.configJson.specificDates : [];
  const specificDates = specificDatesRaw.filter((value): value is string => typeof value === "string").join(", ");

  return {
    ruleId: rule?.id,
    spaceId: rule?.spaceId ?? "",
    mode: rule?.mode ?? "multiple_specific_dates",
    reservationKind: rule?.reservationKind ?? "booking",
    defaultStatus: rule?.defaultStatus ?? "pending",
    publicLabel: rule?.publicLabel ?? "",
    internalNotes: rule?.internalNotes ?? "",
    timezone: rule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    startDate: rule?.startDate ?? "",
    endDate: rule?.endDate ?? "",
    startTime: rule?.startTime ?? "",
    endTime: rule?.endTime ?? "",
    intervalCount: (rule?.intervalCount ?? 1).toString(),
    intervalUnit: rule?.intervalUnit ?? "week",
    byWeekday: Array.isArray(rule?.byWeekday) ? rule.byWeekday.join(",") : "",
    byMonthday: Array.isArray(rule?.byMonthday) ? rule.byMonthday.join(",") : "",
    endMode: rule?.endMode ?? "until_date",
    untilDate: rule?.untilDate ?? "",
    maxOccurrences: rule?.maxOccurrences?.toString() ?? "",
    conflictOverride: rule?.conflictOverride ?? false,
    specificDates
  };
}

function parseNumberCsv(value: string, min: number, max: number) {
  return value
    .split(",")
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((item) => Number.isInteger(item) && item >= min && item <= max);
}

function formatReservationRange(reservation: FacilityReservation) {
  const start = new Date(reservation.startsAtUtc);
  const end = new Date(reservation.endsAtUtc);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return reservation.localDate;
  }

  const formatter = new Intl.DateTimeFormat(undefined, {
    timeZone: reservation.timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

export function FacilitySchedulePanel({
  spaces,
  reservations,
  rules,
  canWrite,
  onCreateReservation,
  onUpdateReservation,
  onApproveReservation,
  onRejectReservation,
  onCancelReservation,
  onRestoreReservation,
  onCreateBlackout,
  onUpdateBlackout,
  onCancelBlackout,
  onSaveRule,
  onDeleteRule
}: FacilitySchedulePanelProps) {
  const [isReservationPanelOpen, setIsReservationPanelOpen] = useState(false);
  const [isBlackoutPanelOpen, setIsBlackoutPanelOpen] = useState(false);
  const [editingReservation, setEditingReservation] = useState<FacilityReservation | null>(null);
  const [ruleDraft, setRuleDraft] = useState<RuleDraft>(() => toRuleDraft());
  const [isRulePanelOpen, setIsRulePanelOpen] = useState(false);

  const sortedReservations = useMemo(() => {
    return [...reservations].sort((a, b) => a.startsAtUtc.localeCompare(b.startsAtUtc));
  }, [reservations]);

  const sortedRules = useMemo(() => {
    return [...rules].sort((a, b) => a.sortIndex - b.sortIndex || a.createdAt.localeCompare(b.createdAt));
  }, [rules]);

  function openCreateReservation() {
    setEditingReservation(null);
    setIsReservationPanelOpen(true);
  }

  function openCreateBlackout() {
    setEditingReservation(null);
    setIsBlackoutPanelOpen(true);
  }

  function openEditReservation(reservation: FacilityReservation) {
    setEditingReservation(reservation);
    if (reservation.reservationKind === "blackout") {
      setIsBlackoutPanelOpen(true);
    } else {
      setIsReservationPanelOpen(true);
    }
  }

  function openCreateRule() {
    setRuleDraft(toRuleDraft());
    setIsRulePanelOpen(true);
  }

  function openEditRule(rule: FacilityReservationRule) {
    setRuleDraft(toRuleDraft(rule));
    setIsRulePanelOpen(true);
  }

  function saveRuleDraft() {
    onSaveRule(ruleDraft);
    setIsRulePanelOpen(false);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Reservations</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button disabled={!canWrite} onClick={openCreateReservation} type="button">
                <CalendarPlus2 className="h-4 w-4" />
                New reservation
              </Button>
              <Button disabled={!canWrite} onClick={openCreateBlackout} type="button" variant="secondary">
                <Clock4 className="h-4 w-4" />
                New blackout
              </Button>
            </div>
          </div>
          <CardDescription>Pending and approved reservations both block availability and overlap conflicts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sortedReservations.length === 0 ? <Alert variant="info">No reservations yet.</Alert> : null}
          {sortedReservations.map((reservation) => {
            const space = spaces.find((item) => item.id === reservation.spaceId);

            return (
              <article className="rounded-control border bg-surface px-3 py-3" key={reservation.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-text">{reservation.publicLabel || "Untitled reservation"}</p>
                  <FacilityStatusBadge status={reservation.status} />
                  <span className="text-xs text-text-muted">{reservation.reservationKind}</span>
                  {space ? <span className="text-xs text-text-muted">{space.name}</span> : null}
                </div>
                <p className="mt-1 text-sm text-text-muted">{formatReservationRange(reservation)}</p>
                {reservation.internalNotes ? <p className="mt-1 text-sm text-text-muted">{reservation.internalNotes}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={() => openEditReservation(reservation)} size="sm" type="button" variant="secondary">
                    Edit
                  </Button>
                  {reservation.status !== "approved" ? (
                    <Button disabled={!canWrite} onClick={() => onApproveReservation(reservation.id)} size="sm" type="button" variant="secondary">
                      Approve
                    </Button>
                  ) : null}
                  {reservation.status !== "rejected" ? (
                    <Button disabled={!canWrite} onClick={() => onRejectReservation(reservation.id)} size="sm" type="button" variant="secondary">
                      Reject
                    </Button>
                  ) : null}
                  {reservation.status !== "cancelled" ? (
                    <Button disabled={!canWrite} onClick={() => (reservation.reservationKind === "blackout" ? onCancelBlackout(reservation.id) : onCancelReservation(reservation.id))} size="sm" type="button" variant="ghost">
                      Cancel
                    </Button>
                  ) : (
                    <Button disabled={!canWrite} onClick={() => onRestoreReservation(reservation.id)} size="sm" type="button" variant="ghost">
                      Restore
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Recurring Rules</CardTitle>
            <Button disabled={!canWrite} onClick={openCreateRule} type="button" variant="secondary">
              <Plus className="h-4 w-4" />
              New rule
            </Button>
          </div>
          <CardDescription>Rules generate future reservations and respect skip/override exceptions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sortedRules.length === 0 ? <Alert variant="info">No recurring rules yet.</Alert> : null}
          {sortedRules.map((rule) => {
            const space = spaces.find((item) => item.id === rule.spaceId);
            return (
              <article className="rounded-control border bg-surface px-3 py-3" key={rule.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-text">{rule.publicLabel || "Untitled rule"}</p>
                  <span className="text-xs text-text-muted">{rule.mode}</span>
                  <span className="text-xs text-text-muted">{space?.name ?? "Unknown space"}</span>
                  <FacilityStatusBadge status={rule.defaultStatus} />
                </div>
                <p className="mt-1 text-sm text-text-muted">Timezone: {rule.timezone}</p>
                <div className="mt-3 flex gap-2">
                  <Button onClick={() => openEditRule(rule)} size="sm" type="button" variant="secondary">
                    Edit
                  </Button>
                  <Button disabled={!canWrite} onClick={() => onDeleteRule(rule.id)} size="sm" type="button" variant="ghost">
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </article>
            );
          })}
        </CardContent>
      </Card>

      <ReservationEditorPanel
        canWrite={canWrite}
        onClose={() => setIsReservationPanelOpen(false)}
        onSubmit={(input) => {
          if (input.reservationId) {
            onUpdateReservation(input);
          } else {
            onCreateReservation(input);
          }
          setIsReservationPanelOpen(false);
        }}
        open={isReservationPanelOpen}
        reservation={editingReservation?.reservationKind === "booking" ? editingReservation : null}
        spaces={spaces}
      />

      <BlackoutEditorPanel
        canWrite={canWrite}
        onClose={() => setIsBlackoutPanelOpen(false)}
        onSubmit={(input) => {
          if (input.reservationId) {
            onUpdateBlackout(input);
          } else {
            onCreateBlackout(input);
          }
          setIsBlackoutPanelOpen(false);
        }}
        open={isBlackoutPanelOpen}
        reservation={editingReservation?.reservationKind === "blackout" ? editingReservation : null}
        spaces={spaces}
      />

      <Panel
        footer={
          <>
            <Button onClick={() => setIsRulePanelOpen(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={!canWrite || !ruleDraft.spaceId} onClick={saveRuleDraft} type="button">
              Save rule
            </Button>
          </>
        }
        onClose={() => setIsRulePanelOpen(false)}
        open={isRulePanelOpen}
        subtitle="Configure recurrence for bookings or blackouts."
        title={ruleDraft.ruleId ? "Edit rule" : "Create rule"}
      >
        <div className="space-y-4">
          <FormField label="Space">
            <Select
              onChange={(event) => setRuleDraft((current) => ({ ...current, spaceId: event.target.value }))}
              options={spaces.map((space) => ({
                value: space.id,
                label: `${space.name} (${space.spaceKind})`
              }))}
              value={ruleDraft.spaceId}
            />
          </FormField>
          <FormField label="Mode">
            <Select
              onChange={(event) => setRuleDraft((current) => ({ ...current, mode: event.target.value as FacilityReservationRule["mode"] }))}
              options={[
                { value: "single_date", label: "Single date" },
                { value: "multiple_specific_dates", label: "Multiple specific dates" },
                { value: "repeating_pattern", label: "Repeating pattern" },
                { value: "continuous_date_range", label: "Continuous date range" },
                { value: "custom_advanced", label: "Custom advanced" }
              ]}
              value={ruleDraft.mode}
            />
          </FormField>
          <FormField label="Kind">
            <Select
              onChange={(event) => setRuleDraft((current) => ({ ...current, reservationKind: event.target.value as RuleDraft["reservationKind"] }))}
              options={[
                { value: "booking", label: "Booking" },
                { value: "blackout", label: "Blackout" }
              ]}
              value={ruleDraft.reservationKind}
            />
          </FormField>
          <FormField label="Default status">
            <Select
              onChange={(event) => setRuleDraft((current) => ({ ...current, defaultStatus: event.target.value as RuleDraft["defaultStatus"] }))}
              options={[
                { value: "pending", label: "Pending" },
                { value: "approved", label: "Approved" },
                { value: "rejected", label: "Rejected" },
                { value: "cancelled", label: "Cancelled" }
              ]}
              value={ruleDraft.defaultStatus}
            />
          </FormField>
          <FormField label="Public label">
            <Input onChange={(event) => setRuleDraft((current) => ({ ...current, publicLabel: event.target.value }))} value={ruleDraft.publicLabel} />
          </FormField>
          <FormField label="Internal notes">
            <Textarea className="min-h-[90px]" onChange={(event) => setRuleDraft((current) => ({ ...current, internalNotes: event.target.value }))} value={ruleDraft.internalNotes} />
          </FormField>
          <FormField label="Timezone">
            <Input onChange={(event) => setRuleDraft((current) => ({ ...current, timezone: event.target.value }))} value={ruleDraft.timezone} />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Start date">
              <Input onChange={(event) => setRuleDraft((current) => ({ ...current, startDate: event.target.value }))} type="date" value={ruleDraft.startDate} />
            </FormField>
            <FormField label="End date">
              <Input onChange={(event) => setRuleDraft((current) => ({ ...current, endDate: event.target.value }))} type="date" value={ruleDraft.endDate} />
            </FormField>
            <FormField label="Start time">
              <Input onChange={(event) => setRuleDraft((current) => ({ ...current, startTime: event.target.value }))} type="time" value={ruleDraft.startTime} />
            </FormField>
            <FormField label="End time">
              <Input onChange={(event) => setRuleDraft((current) => ({ ...current, endTime: event.target.value }))} type="time" value={ruleDraft.endTime} />
            </FormField>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Interval count">
              <Input
                min={1}
                onChange={(event) => setRuleDraft((current) => ({ ...current, intervalCount: event.target.value }))}
                type="number"
                value={ruleDraft.intervalCount}
              />
            </FormField>
            <FormField label="Interval unit">
              <Select
                onChange={(event) => setRuleDraft((current) => ({ ...current, intervalUnit: event.target.value as RuleDraft["intervalUnit"] }))}
                options={[
                  { value: "day", label: "Day" },
                  { value: "week", label: "Week" },
                  { value: "month", label: "Month" }
                ]}
                value={ruleDraft.intervalUnit}
              />
            </FormField>
            <FormField hint="Comma-separated (0=Sun..6=Sat)" label="Weekdays">
              <Input onChange={(event) => setRuleDraft((current) => ({ ...current, byWeekday: event.target.value }))} value={ruleDraft.byWeekday} />
            </FormField>
            <FormField hint="Comma-separated (1-31)" label="Month days">
              <Input onChange={(event) => setRuleDraft((current) => ({ ...current, byMonthday: event.target.value }))} value={ruleDraft.byMonthday} />
            </FormField>
          </div>
          <FormField label="End mode">
            <Select
              onChange={(event) => setRuleDraft((current) => ({ ...current, endMode: event.target.value as RuleDraft["endMode"] }))}
              options={[
                { value: "never", label: "Never" },
                { value: "until_date", label: "Until date" },
                { value: "after_occurrences", label: "After occurrences" }
              ]}
              value={ruleDraft.endMode}
            />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Until date">
              <Input onChange={(event) => setRuleDraft((current) => ({ ...current, untilDate: event.target.value }))} type="date" value={ruleDraft.untilDate} />
            </FormField>
            <FormField label="Max occurrences">
              <Input
                min={1}
                onChange={(event) => setRuleDraft((current) => ({ ...current, maxOccurrences: event.target.value }))}
                type="number"
                value={ruleDraft.maxOccurrences}
              />
            </FormField>
          </div>
          <FormField hint="Used by multiple-specific-dates mode" label="Specific dates (comma-separated)">
            <Input onChange={(event) => setRuleDraft((current) => ({ ...current, specificDates: event.target.value }))} value={ruleDraft.specificDates} />
          </FormField>
          <label className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-sm text-text">
            <Checkbox
              checked={ruleDraft.conflictOverride}
              onChange={(event) => setRuleDraft((current) => ({ ...current, conflictOverride: event.target.checked }))}
            />
            Allow conflict override for generated reservations
          </label>
        </div>
      </Panel>
    </div>
  );
}

export function toRulePayloadFromDraft(draft: RuleDraft) {
  return {
    ruleId: draft.ruleId,
    spaceId: draft.spaceId,
    mode: draft.mode,
    reservationKind: draft.reservationKind,
    defaultStatus: draft.defaultStatus,
    publicLabel: draft.publicLabel,
    internalNotes: draft.internalNotes,
    timezone: draft.timezone,
    startDate: draft.startDate,
    endDate: draft.endDate,
    startTime: draft.startTime,
    endTime: draft.endTime,
    intervalCount: Number.parseInt(draft.intervalCount || "1", 10) || 1,
    intervalUnit: draft.intervalUnit,
    byWeekday: parseNumberCsv(draft.byWeekday, 0, 6),
    byMonthday: parseNumberCsv(draft.byMonthday, 1, 31),
    endMode: draft.endMode,
    untilDate: draft.untilDate,
    maxOccurrences: draft.maxOccurrences.trim().length > 0 ? Number.parseInt(draft.maxOccurrences, 10) : null,
    conflictOverride: draft.conflictOverride,
    configJson: {
      specificDates: draft.specificDates
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    }
  };
}

export type { RuleDraft };
