"use client";

import { Chip, ChipPicker, type ChipVariant } from "@orgframe/ui/primitives/chip";
import type { FacilityPublicSpaceStatus, FacilityReservationStatus, FacilitySpaceStatus, FacilitySpaceStatusDef } from "@/src/features/facilities/types";

type StatusLike = FacilitySpaceStatus | FacilityReservationStatus | FacilityPublicSpaceStatus;

function resolveVariant(status: StatusLike): ChipVariant {
  if (status === "open" || status === "approved") return "success";
  if (status === "pending" || status === "booked") return "warning";
  if (status === "closed" || status === "cancelled" || status === "archived" || status === "rejected") return "destructive";
  return "neutral";
}

function resolveLabel(status: StatusLike) {
  return status.replace(/_/g, " ");
}

function colorFromStatus(status: FacilitySpaceStatus): string {
  if (status === "open") return "emerald";
  if (status === "closed") return "rose";
  return "slate";
}

type FacilityStatusBadgeProps = {
  status: StatusLike;
  label?: string;
  disabled?: boolean;
  /** Full status definitions from the saved status system (preferred over spaceStatusOptions). */
  spaceStatuses?: FacilitySpaceStatusDef[];
  /** @deprecated Pass `spaceStatuses` instead. */
  spaceStatusOptions?: { value: FacilitySpaceStatus; label: string }[];
  onSelectSpaceStatus?: (status: FacilitySpaceStatus) => void;
};

export function FacilityStatusBadge({
  status,
  label,
  disabled = false,
  spaceStatuses,
  spaceStatusOptions,
  onSelectSpaceStatus
}: FacilityStatusBadgeProps) {
  const displayLabel = label ?? resolveLabel(status);

  const pickerOptions = spaceStatuses
    ? spaceStatuses.map((s) => ({ value: s.id, label: s.label, color: s.color }))
    : (spaceStatusOptions ?? []).map((s) => ({ value: s.value, label: s.label, color: colorFromStatus(s.value) }));

  const canPick = Boolean(onSelectSpaceStatus && pickerOptions.length > 0);

  if (canPick) {
    return (
      <ChipPicker
        disabled={disabled}
        onChange={(value) => onSelectSpaceStatus!(value as FacilitySpaceStatus)}
        options={pickerOptions}
        value={status}
      />
    );
  }

  return (
    <Chip status={true} variant={resolveVariant(status)}>
      {displayLabel}
    </Chip>
  );
}
