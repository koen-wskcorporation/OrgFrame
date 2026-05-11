"use client";

import * as React from "react";
import { Button } from "@orgframe/ui/primitives/button";
import { Popup } from "@orgframe/ui/primitives/popup";
import { LocationPicker, type LocationValue } from "@/src/features/facilities/map/components/LocationPicker";

type SetLocationPopupProps = {
  open: boolean;
  onClose: () => void;
  initialLat: number | null;
  initialLng: number | null;
  initialAddress?: string;
  onSave: (lat: number, lng: number, address?: string) => Promise<void> | void;
  saving?: boolean;
};

export function SetLocationPopup({
  open,
  onClose,
  initialLat,
  initialLng,
  initialAddress = "",
  onSave,
  saving = false
}: SetLocationPopupProps) {
  const [value, setValue] = React.useState<LocationValue | null>(
    initialLat != null && initialLng != null ? { lat: initialLat, lng: initialLng, address: initialAddress } : null
  );

  React.useEffect(() => {
    if (!open) return;
    setValue(initialLat != null && initialLng != null ? { lat: initialLat, lng: initialLng, address: initialAddress } : null);
  }, [open, initialLat, initialLng, initialAddress]);

  async function handleSave() {
    if (!value) return;
    await onSave(value.lat, value.lng, value.address.trim() || undefined);
  }

  return (
    <Popup
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button disabled={!value || saving} loading={saving} onClick={handleSave} variant="primary">
            Save location
          </Button>
        </div>
      }
      onClose={onClose}
      open={open}
      size="md"
      subtitle="Search an address or click the map to drop a pin."
      title="Set facility location"
    >
      {/* key forces full remount on open so map / marker re-init cleanly */}
      {open ? <LocationPicker key={open ? "open" : "closed"} onChange={setValue} value={value} /> : null}
    </Popup>
  );
}
