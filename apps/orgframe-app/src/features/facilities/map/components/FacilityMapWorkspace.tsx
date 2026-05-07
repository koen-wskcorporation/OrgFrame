"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useToast } from "@orgframe/ui/primitives/toast";
import { EditorShell } from "@/src/features/canvas/components/EditorShell";
import { saveFacilityMapAction, updateFacilityAction } from "@/src/features/facilities/actions";
import type {
  Facility,
  FacilitySpace,
  FacilitySpaceStatusDef
} from "@/src/features/facilities/types";
import { FacilityMapEditor } from "@/src/features/facilities/map/components/FacilityMapEditor";
import { FacilitySpacePanel } from "@/src/features/facilities/map/components/FacilitySpacePanel";
import { SetLocationPopup } from "@/src/features/facilities/map/components/SetLocationPopup";
import { SpaceStatusManager } from "@/src/features/facilities/components/SpaceStatusManager";
import { useFacilityMapDraft } from "@/src/features/facilities/map/useFacilityMapDraft";

type Props = {
  orgSlug: string;
  orgId: string;
  facility: Facility;
  canWrite: boolean;
  /** Spaces scoped to this facility (the loader filters by `facility_id`). */
  spaces: FacilitySpace[];
  spaceStatuses: FacilitySpaceStatusDef[];
  /** When true the full-screen editor popup opens immediately on mount. */
  defaultEditorOpen?: boolean;
  /** Called when the editor popup fully closes (after unsaved-changes check). */
  onEditorClose?: () => void;
  /** When true the read-only preview card is not rendered. */
  hidePreview?: boolean;
};

function defaultTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Build a transient `FacilitySpace` view from a draft `MapShape` so the
 * side panel can render its edit form for a shape that hasn't been
 * saved yet. The id matches the draft shape's id so panel edits route
 * back through `handleSpaceUpdated` → `draft.updateShape`.
 */
// Stable timestamp for transient synth spaces. The panel's effect
// re-runs `toDraft(space)` whenever `space.updatedAt` changes, so a
// fresh `new Date().toISOString()` every render would clobber the
// user's in-progress kind/name pick before they can hit Save.
const PENDING_SHAPE_TIMESTAMP = "1970-01-01T00:00:00.000Z";

function synthesizePendingSpace(
  shape: import("@/src/features/facilities/map/types").MapShape,
  facility: Facility,
  orgId: string
): FacilitySpace {
  return {
    id: shape.id,
    orgId,
    facilityId: facility.id,
    parentSpaceId: shape.parentSpaceId,
    name: shape.label,
    slug: `space-${shape.id.slice(0, 8)}`,
    spaceKind: shape.spaceKind,
    status: shape.status,
    statusId: shape.statusId,
    isBookable: shape.isBookable,
    timezone: facility.timezone,
    capacity: null,
    metadataJson: {},
    statusLabelsJson: {},
    sortIndex: shape.zIndex,
    mapPoints: shape.points,
    mapZIndex: shape.zIndex,
    createdAt: PENDING_SHAPE_TIMESTAMP,
    updatedAt: PENDING_SHAPE_TIMESTAMP
  };
}

export function FacilityMapWorkspace({
  orgSlug,
  orgId,
  facility: initialFacility,
  canWrite,
  spaces: initialSpaces,
  spaceStatuses,
  defaultEditorOpen = false,
  onEditorClose,
  hidePreview = false
}: Props) {
  const { toast } = useToast();
  const [isSaving, startSaving] = useTransition();
  const [facility, setFacility] = useState(initialFacility);
  useEffect(() => setFacility(initialFacility), [initialFacility]);

  const [spaces, setSpaces] = useState(initialSpaces);
  useEffect(() => setSpaces(initialSpaces), [initialSpaces]);

  const draft = useFacilityMapDraft({ spaces, spaceStatuses });

  // Side-panel state — distinct from editor selection. `selectedShapeId`
  // controls which polygon shows vertex handles. `panelSpaceId` controls
  // which space's metadata appears in the right-hand details panel. Two
  // intents, two pieces of state — clicking a polygon body selects it
  // for reshape; clicking the title pill opens its details panel.
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [panelSpaceId, setPanelSpaceId] = useState<string | null>(null);

  // Status manager and location editor. The editor popup, popup-session bump,
  // mounted-guard, and beforeunload guard now live inside <EditorShell>.
  const [isStatusManagerOpen, setIsStatusManagerOpen] = useState(false);
  const [isLocationPopupOpen, setIsLocationPopupOpen] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);

  const isIndoor = facility.environment === "indoor";
  const geoAnchor =
    facility.geoAnchorLat != null && facility.geoAnchorLng != null
      ? { lat: facility.geoAnchorLat, lng: facility.geoAnchorLng }
      : null;
  const geoShowMap = Boolean(facility.geoShowMap && geoAnchor) && !isIndoor;

  // ---------------------- Geo / location ----------------------------------

  async function handleToggleGeoMap() {
    if (!canWrite) return;
    if (!geoAnchor) { setIsLocationPopupOpen(true); return; }
    const result = await updateFacilityAction({
      orgSlug, facilityId: facility.id,
      name: facility.name, slug: facility.slug, timezone: facility.timezone,
      environment: facility.environment,
      geoAnchorLat: facility.geoAnchorLat, geoAnchorLng: facility.geoAnchorLng,
      geoAddress: facility.geoAddress, geoShowMap: !geoShowMap
    });
    if (!result.ok) { toast({ title: "Couldn't update map", description: result.error, variant: "destructive" }); return; }
    setFacility(result.data.facility);
  }

  async function handleSaveLocation(lat: number, lng: number, address?: string) {
    setSavingLocation(true);
    try {
      const result = await updateFacilityAction({
        orgSlug, facilityId: facility.id,
        name: facility.name, slug: facility.slug, timezone: facility.timezone,
        environment: "outdoor", geoAnchorLat: lat, geoAnchorLng: lng,
        geoAddress: address ?? null, geoShowMap: true
      });
      if (!result.ok) { toast({ title: "Couldn't save location", description: result.error, variant: "destructive" }); return; }
      setFacility(result.data.facility);
      setIsLocationPopupOpen(false);
      toast({ title: "Satellite map enabled", variant: "success" });
    } finally { setSavingLocation(false); }
  }

  // ---------------------- Editor mutations -------------------------------

  function handleCreateShape(points: { x: number; y: number }[]) {
    if (!canWrite) return null;
    setPanelSpaceId(null);
    const id = draft.createShape(points);
    setSelectedShapeId(id);
    return id;
  }

  function handleDeleteShape(shapeId: string) {
    draft.removeShape(shapeId);
    setSelectedShapeId((current) => (current === shapeId ? null : current));
    setPanelSpaceId((current) => (current === shapeId ? null : current));
  }

  function handleSave() {
    if (!canWrite) return;
    const payload = draft.buildSavePayload({ isBookable: true, timezone: defaultTimezone() });

    // Save-time confirm for destructive intent. We list the names of the
    // spaces about to be deleted so the user can't blow away an entire
    // facility's worth of bookings on a misclick.
    if (payload.deletes.length > 0 && typeof window !== "undefined") {
      const names = payload.deletes
        .map((id) => spaces.find((s) => s.id === id)?.name ?? id)
        .map((n) => `  • ${n}`)
        .join("\n");
      const ok = window.confirm(
        `Saving will permanently delete ${payload.deletes.length} space${payload.deletes.length === 1 ? "" : "s"} ` +
        `and all their reservations:\n\n${names}\n\nProceed?`
      );
      if (!ok) return;
    }

    startSaving(async () => {
      const result = await saveFacilityMapAction({
        orgSlug, facilityId: facility.id,
        creates: payload.creates, updates: payload.updates, deletes: payload.deletes
      });
      if (!result.ok) { toast({ title: "Unable to save facility map", description: result.error, variant: "destructive" }); return; }
      setSpaces(result.data.spaces);
      draft.commit(result.data.spaces);
      toast({ title: "Facility map saved", variant: "success" });
    });
  }

  function handleDiscardDirty() {
    draft.discard();
    setSelectedShapeId(null);
    setPanelSpaceId(null);
  }

  // Side-panel update/delete from FacilitySpacePanel. For server-saved
  // spaces the panel calls the action itself and hands us the row to
  // reflect locally. For pending (just-created) shapes the panel hands
  // us its draft via `handleSpaceUpdated` and we patch the draft shape
  // — no server call until the user hits Save in the editor.
  function handleSpaceUpdated(updated: FacilitySpace) {
    if (draft.isPendingCreate(updated.id)) {
      draft.updateShape(updated.id, {
        label: updated.name,
        spaceKind: updated.spaceKind,
        statusId: updated.statusId ?? null,
        status: updated.status,
        isBookable: updated.isBookable
      });
      return;
    }
    // For server-saved spaces, also flow `isBookable` (and other panel-
    // editable fields) into the draft so the editor's hatched-fill
    // rendering reflects the new value immediately, before the next
    // server reload.
    draft.updateShape(updated.id, {
      label: updated.name,
      spaceKind: updated.spaceKind,
      statusId: updated.statusId ?? null,
      status: updated.status,
      isBookable: updated.isBookable
    });
    setSpaces((current) => current.map((s) => (s.id === updated.id ? updated : s)));
  }
  function handleSpaceDeleted(spaceId: string) {
    if (draft.isPendingCreate(spaceId)) {
      draft.removeShape(spaceId);
    } else {
      setSpaces((current) => current.filter((s) => s.id !== spaceId));
    }
    setSelectedShapeId((current) => (current === spaceId ? null : current));
    setPanelSpaceId((current) => (current === spaceId ? null : current));
  }

  // Resolve which space the side panel is showing. For server-saved
  // spaces the row in `spaces` wins. For shapes still pending creation
  // (no row yet), synthesize a transient `FacilitySpace` from the
  // draft's MapShape so the panel can render and the user can pick a
  // kind / status / name BEFORE saving. Edits on a pending shape route
  // back into the draft via `handleSpaceUpdated`.
  //
  // Memoize on stable inputs only. Without this, every workspace
  // re-render (which fires on any unrelated state tick) would mint a
  // fresh synthesized object — the panel would then see `space` change
  // identity, and any code that captures `space` (effects, memos)
  // would invalidate. Keeping identity stable keeps the panel's local
  // form state from getting clobbered mid-edit.
  const selectedSpace: FacilitySpace | null = useMemo(() => {
    if (!panelSpaceId) return null;
    const saved = spaces.find((s) => s.id === panelSpaceId);
    if (saved) return saved;
    const shape = draft.shapes.find((s) => s.id === panelSpaceId);
    if (!shape) return null;
    return synthesizePendingSpace(shape, facility, orgId);
  }, [panelSpaceId, spaces, draft.shapes, facility, orgId]);
  const isPanelOpen = selectedSpace !== null;

  const titleNode = <span className="inline-flex items-center gap-2"><span>Facility Map</span></span>;

  return (
    <EditorShell
      canWrite={canWrite}
      defaultEditorOpen={defaultEditorOpen}
      hidePreview={hidePreview}
      isDirty={draft.isDirty}
      onDiscardDirty={handleDiscardDirty}
      onEditorClose={onEditorClose}
      popupSubtitle="Pan, zoom, drag vertices to reshape, and save when you're happy."
      previewDescription="Read-only preview, auto-fit to your spaces. Click Edit to open the full canvas."
      readOnlyMessage="You have read-only access to the facility map."
      title={titleNode}
      renderEditor={({ mode, popupSession, requestEdit }) =>
        mode === "preview" ? (
          <FacilityMapEditor
            canWrite={false}
            geoAnchor={geoAnchor}
            geoShowMap={geoShowMap}
            indoor={isIndoor}
            isSaving={false}
            nodes={draft.shapes}
            onChangeNodes={() => undefined}
            onCreateShape={() => null}
            onDeleteNode={() => undefined}
            onEdit={requestEdit}
            onEditGeoLocation={() => undefined}
            onSave={() => undefined}
            onSelectNode={() => undefined}
            onToggleGeoMap={() => undefined}
            readOnly
            selectedNodeId={null}
            spaceStatuses={spaceStatuses}
          />
        ) : (
          <FacilityMapEditor
            key={`editor-${popupSession}`}
            canWrite={canWrite}
            geoAnchor={geoAnchor}
            geoShowMap={geoShowMap}
            indoor={isIndoor}
            isSaving={isSaving}
            nodes={draft.shapes}
            onChangeNodes={draft.setShapes}
            onCreateShape={handleCreateShape}
            onDeleteNode={handleDeleteShape}
            onEditGeoLocation={() => setIsLocationPopupOpen(true)}
            onOpenSpaceDetails={setPanelSpaceId}
            onSave={handleSave}
            onSelectNode={setSelectedShapeId}
            onToggleGeoMap={handleToggleGeoMap}
            selectedNodeId={selectedShapeId}
            spaceStatuses={spaceStatuses}
          />
        )
      }
      popupExtras={
        <>
          {/* FacilitySpacePanel is itself a `<Panel>` — it auto-portals
              into the global PanelContainer when open, so it sits inside
              the multi-panel layout area regardless of whether the editor
              popup is open. */}
          <FacilitySpacePanel
            canWrite={canWrite}
            isPending={panelSpaceId ? draft.isPendingCreate(panelSpaceId) : false}
            onClose={() => setPanelSpaceId(null)}
            onLivePreview={(updated) => {
              draft.updateShape(updated.id, {
                label: updated.name,
                spaceKind: updated.spaceKind,
                statusId: updated.statusId ?? null,
                status: updated.status,
                isBookable: updated.isBookable
              });
            }}
            onManageStatuses={() => setIsStatusManagerOpen(true)}
            onSpaceDeleted={handleSpaceDeleted}
            onSpaceUpdated={handleSpaceUpdated}
            open={isPanelOpen}
            orgSlug={orgSlug}
            space={selectedSpace}
            spaceStatuses={spaceStatuses}
          />
          <SpaceStatusManager
            canWrite={canWrite}
            onClose={() => setIsStatusManagerOpen(false)}
            onReadModel={() => undefined}
            open={isStatusManagerOpen}
            orgSlug={orgSlug}
            statuses={spaceStatuses}
          />
          <SetLocationPopup
            initialLat={geoAnchor?.lat ?? null}
            initialLng={geoAnchor?.lng ?? null}
            initialAddress={facility.geoAddress ?? ""}
            onClose={() => setIsLocationPopupOpen(false)}
            onSave={handleSaveLocation}
            open={isLocationPopupOpen}
            saving={savingLocation}
          />
        </>
      }
    />
  );
}
