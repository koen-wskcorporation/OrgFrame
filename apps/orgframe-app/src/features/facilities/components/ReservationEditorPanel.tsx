"use client";

import { useEffect, useState } from "react";
import { Button } from "@orgframe/ui/primitives/button";
import { Checkbox } from "@orgframe/ui/primitives/checkbox";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { Panel } from "@orgframe/ui/primitives/panel";
import { Select } from "@orgframe/ui/primitives/select";
import { Textarea } from "@orgframe/ui/primitives/textarea";
import { X } from "lucide-react";
import type { FacilityReservation, FacilityReservationStatus, FacilitySpace } from "@/src/features/facilities/types";

export type ReservationEditorSubmitInput = {
  reservationId?: string;
  spaceId: string;
  reservationKind: "booking" | "blackout";
  status: FacilityReservationStatus;
  localDate: string;
  localStartTime: string;
  localEndTime: string;
  timezone: string;
  publicLabel: string;
  internalNotes: string;
  eventId: string;
  programId: string;
  conflictOverride: boolean;
};

type ReservationEditorPanelProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: ReservationEditorSubmitInput) => void;
  canWrite: boolean;
  spaces: FacilitySpace[];
  reservation?: FacilityReservation | null;
  kind?: "booking" | "blackout";
};

function toDraft(reservation: FacilityReservation | null | undefined, kind?: "booking" | "blackout"): ReservationEditorSubmitInput {
  return {
    reservationId: reservation?.id,
    spaceId: reservation?.spaceId ?? "",
    reservationKind: kind ?? reservation?.reservationKind ?? "booking",
    status: reservation?.status ?? (kind === "blackout" ? "approved" : "pending"),
    localDate: reservation?.localDate ?? "",
    localStartTime: reservation?.localStartTime ?? "00:00",
    localEndTime: reservation?.localEndTime ?? "23:59",
    timezone: reservation?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    publicLabel: reservation?.publicLabel ?? "",
    internalNotes: reservation?.internalNotes ?? "",
    eventId: reservation?.eventId ?? "",
    programId: reservation?.programId ?? "",
    conflictOverride: reservation?.conflictOverride ?? false
  };
}

export function ReservationEditorPanel({ open, onClose, onSubmit, canWrite, spaces, reservation, kind }: ReservationEditorPanelProps) {
  const [draft, setDraft] = useState<ReservationEditorSubmitInput>(() => toDraft(reservation, kind));

  useEffect(() => {
    setDraft(toDraft(reservation, kind));
  }, [reservation, kind, open]);

  const title = reservation ? (kind === "blackout" ? "Edit blackout" : "Edit reservation") : kind === "blackout" ? "Create blackout" : "Create reservation";

  return (
    <Panel
      footer={
        <Button
          disabled={!canWrite || !draft.spaceId || !draft.localDate}
          onClick={() => {
            onSubmit(draft);
          }}
          type="button"
        >
          {reservation ? "Save" : "Create"}
        </Button>
      }
      onClose={onClose}
      open={open}
      subtitle="Pending and approved reservations block availability and conflicts."
      title={title}
    >
      <div className="space-y-4">
        <FormField label="Space">
          <Select
            disabled={!canWrite}
            onChange={(event) => setDraft((current) => ({ ...current, spaceId: event.target.value }))}
            options={spaces.map((space) => ({
              value: space.id,
              label: `${space.name} (${space.spaceKind})`
            }))}
            value={draft.spaceId}
          />
        </FormField>

        <FormField label="Status">
          <Select
            disabled={!canWrite}
            onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as FacilityReservationStatus }))}
            options={[
              { value: "pending", label: "Pending" },
              { value: "approved", label: "Approved" },
              { value: "rejected", label: "Rejected" },
              { value: "cancelled", label: "Cancelled" }
            ]}
            value={draft.status}
          />
        </FormField>

        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Date">
            <Input disabled={!canWrite} onChange={(event) => setDraft((current) => ({ ...current, localDate: event.target.value }))} type="date" value={draft.localDate} />
          </FormField>
          <FormField label="Timezone">
            <Input disabled={!canWrite} onChange={(event) => setDraft((current) => ({ ...current, timezone: event.target.value }))} value={draft.timezone} />
          </FormField>
          <FormField label="Start time">
            <Input
              disabled={!canWrite}
              onChange={(event) => setDraft((current) => ({ ...current, localStartTime: event.target.value }))}
              type="time"
              value={draft.localStartTime}
            />
          </FormField>
          <FormField label="End time">
            <Input
              disabled={!canWrite}
              onChange={(event) => setDraft((current) => ({ ...current, localEndTime: event.target.value }))}
              type="time"
              value={draft.localEndTime}
            />
          </FormField>
        </div>

        <FormField label="Public label">
          <Input
            disabled={!canWrite}
            onChange={(event) => setDraft((current) => ({ ...current, publicLabel: event.target.value }))}
            placeholder={kind === "blackout" ? "Maintenance" : "Practice"}
            value={draft.publicLabel}
          />
        </FormField>

        <FormField label="Internal notes">
          <Textarea
            className="min-h-[90px]"
            disabled={!canWrite}
            onChange={(event) => setDraft((current) => ({ ...current, internalNotes: event.target.value }))}
            value={draft.internalNotes}
          />
        </FormField>

        {kind !== "blackout" ? (
          <>
            <FormField hint="Optional" label="Program ID">
              <Input disabled={!canWrite} onChange={(event) => setDraft((current) => ({ ...current, programId: event.target.value }))} value={draft.programId} />
            </FormField>
            <FormField hint="Optional" label="Event ID">
              <Input disabled={!canWrite} onChange={(event) => setDraft((current) => ({ ...current, eventId: event.target.value }))} value={draft.eventId} />
            </FormField>
          </>
        ) : null}

        <label className="ui-inline-toggle">
          <Checkbox
            checked={draft.conflictOverride}
            disabled={!canWrite}
            onChange={(event) => setDraft((current) => ({ ...current, conflictOverride: event.target.checked }))}
          />
          Allow conflict override
        </label>
      </div>
    </Panel>
  );
}
