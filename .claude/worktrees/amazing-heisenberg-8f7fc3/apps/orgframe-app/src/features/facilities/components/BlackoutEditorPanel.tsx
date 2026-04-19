"use client";

import type { FacilityReservation, FacilitySpace } from "@/src/features/facilities/types";
import { ReservationEditorPanel, type ReservationEditorSubmitInput } from "@/src/features/facilities/components/ReservationEditorPanel";

type BlackoutEditorPanelProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: ReservationEditorSubmitInput) => void;
  canWrite: boolean;
  spaces: FacilitySpace[];
  reservation?: FacilityReservation | null;
};

export function BlackoutEditorPanel({ open, onClose, onSubmit, canWrite, spaces, reservation }: BlackoutEditorPanelProps) {
  return (
    <ReservationEditorPanel
      canWrite={canWrite}
      kind="blackout"
      onClose={onClose}
      onSubmit={onSubmit}
      open={open}
      reservation={reservation}
      spaces={spaces}
    />
  );
}
