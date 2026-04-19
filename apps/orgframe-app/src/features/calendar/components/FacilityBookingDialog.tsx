"use client";

import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { Popup } from "@orgframe/ui/primitives/popup";
import { Check, X } from "lucide-react";
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

export function FacilityBookingDialog({ open, onClose, saveLabel = "Apply Booking", onSave }: FacilityBookingDialogProps) {
  return (
    <Popup
      closeOnBackdrop={false}
      onClose={onClose}
      open={open}
      size="lg"
      subtitle="Facility booking panel placeholder."
      title="Facility booking placeholder"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button onClick={onClose} type="button" variant="ghost">
            <X className="h-4 w-4" />
            Cancel
          </Button>
          <Button onClick={onSave} type="button">
            <Check className="h-4 w-4" />
            {saveLabel}
          </Button>
        </div>
      }
    >
      <Alert variant="info">Facility booking UI is currently simplified while facility map v1 is being rolled out.</Alert>
    </Popup>
  );
}
