"use client";

import { FacilitySpacePanel } from "@/src/features/facilities/map/components/FacilitySpacePanel";
import { SetLocationPopup } from "@/src/features/facilities/map/components/SetLocationPopup";
import { SpaceStatusManager } from "@/src/features/facilities/components/SpaceStatusManager";
import type { FacilitySpace, FacilitySpaceStatusDef } from "@/src/features/facilities/types";

export type MapPanel =
  | { kind: "space"; spaceId: string }
  | { kind: "status" }
  | { kind: "location" };

type MapPanelHostProps = {
  active: MapPanel | null;
  onClose: () => void;
  onSwitch: (next: MapPanel | null) => void;
  orgSlug: string;
  canWrite: boolean;
  spaceStatuses: FacilitySpaceStatusDef[];
  // Space panel
  selectedSpace: FacilitySpace | null;
  isPendingSpace: boolean;
  onLivePreview: (updated: FacilitySpace) => void;
  onSpaceUpdated: (updated: FacilitySpace) => void;
  onSpaceDeleted: (spaceId: string) => void;
  // Location popup
  geoAnchor: { lat: number; lng: number } | null;
  geoAddress: string | null;
  savingLocation: boolean;
  onSaveLocation: (lat: number, lng: number, address?: string) => void | Promise<void>;
};

/**
 * Single host for every panel/popup the facility map opens. The map
 * workspace flips a discriminated `active` value and this component
 * dispatches to the correct surface — the layout never sees the
 * individual `FacilitySpacePanel` / `SpaceStatusManager` /
 * `SetLocationPopup` components. Mirrors the global `Panel` →
 * `PanelContainer` shape (one container, many surfaces) but scoped to
 * the map so panels render correctly while the full-screen editor
 * popup is open.
 */
export function MapPanelHost({
  active,
  onClose,
  onSwitch,
  orgSlug,
  canWrite,
  spaceStatuses,
  selectedSpace,
  isPendingSpace,
  onLivePreview,
  onSpaceUpdated,
  onSpaceDeleted,
  geoAnchor,
  geoAddress,
  savingLocation,
  onSaveLocation
}: MapPanelHostProps) {
  // All surfaces stay mounted so their close animations run when
  // `open` flips to false. Visibility is driven entirely by `active`.
  return (
    <>
      <FacilitySpacePanel
        canWrite={canWrite}
        isPending={isPendingSpace}
        onClose={onClose}
        onLivePreview={onLivePreview}
        onManageStatuses={() => onSwitch({ kind: "status" })}
        onSpaceDeleted={onSpaceDeleted}
        onSpaceUpdated={onSpaceUpdated}
        open={active?.kind === "space"}
        orgSlug={orgSlug}
        space={selectedSpace}
        spaceStatuses={spaceStatuses}
      />
      <SpaceStatusManager
        canWrite={canWrite}
        onClose={onClose}
        onReadModel={() => undefined}
        open={active?.kind === "status"}
        orgSlug={orgSlug}
        statuses={spaceStatuses}
      />
      <SetLocationPopup
        initialAddress={geoAddress ?? ""}
        initialLat={geoAnchor?.lat ?? null}
        initialLng={geoAnchor?.lng ?? null}
        onClose={onClose}
        onSave={onSaveLocation}
        open={active?.kind === "location"}
        saving={savingLocation}
      />
    </>
  );
}
