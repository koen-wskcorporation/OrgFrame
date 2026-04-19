"use client";

import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { Popup } from "@orgframe/ui/primitives/popup";
import type { CalendarReadModel, FacilitySpaceConfiguration } from "@/src/features/calendar/types";
import type { FacilityReservationReadModel, FacilitySpace } from "@/src/features/facilities/types";
import type { FacilityBookingSelection, FacilityBookingWindow } from "@/src/features/calendar/components/facility-booking-utils";

type FacilityBookingDialogProps = {
  open: boolean;
  onClose: () => void;
  facilityId: string | null;
  spaces: FacilitySpace[];
  configurations: FacilitySpaceConfiguration[];
  calendarReadModel: CalendarReadModel;
  facilityReadModel: FacilityReservationReadModel;
  selections: FacilityBookingSelection[];
  onSelectionsChange: (next: FacilityBookingSelection[]) => void;
  occurrenceWindows: FacilityBookingWindow[];
  ignoreOccurrenceId?: string | null;
  allowPartialConflicts?: boolean;
  saveLabel?: string;
  onSave: () => void;
};

export function FacilityBookingDialog({ open, onClose, saveLabel = "Apply booking", onSave }: FacilityBookingDialogProps) {
  return (
    <Popup
      closeOnBackdrop={false}
      onClose={onClose}
      open={open}
      size="lg"
      subtitle="Facility map booking is temporarily disabled."
      title="Facility booking placeholder"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button onClick={onSave} type="button">
            {saveLabel}
          </Button>
        </div>
      }
    >
      <Alert variant="info">Canvas-based facility booking has been removed for now. Use this as a placeholder.</Alert>
    </Popup>
  );
}
