"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Popup } from "@orgframe/ui/primitives/popup";
import { useToast } from "@orgframe/ui/primitives/toast";
import { WorkspaceCardShell } from "@/src/features/core/layout/components/WorkspaceCardShell";
import {
  createFacilitySpaceAction,
  saveFacilityMapAction,
  setFacilitySpaceGeoAnchorAction,
  updateFacilityAction
} from "@/src/features/facilities/actions";
import { getSpaceKindIcon } from "@/src/features/facilities/lib/spaceKindIcon";
import type {
  Facility,
  FacilityReservationReadModel,
  FacilitySpace,
  FacilitySpaceStatusDef
} from "@/src/features/facilities/types";
import type { FacilityMapNode } from "@/src/features/facilities/map/types";
import { FacilityMapEditor } from "@/src/features/facilities/map/components/FacilityMapEditor";
import { FacilitySpacePanel } from "@/src/features/facilities/map/components/FacilitySpacePanel";
import { SetLocationPopup } from "@/src/features/facilities/map/components/SetLocationPopup";
import { SpaceStatusManager } from "@/src/features/facilities/components/SpaceStatusManager";

type FacilityMapWorkspaceProps = {
  orgSlug: string;
  orgId: string;
  facility: Facility;
  canWrite: boolean;
  /** Spaces scoped to this facility — query layer filters by `facility_id`. */
  spaces: FacilitySpace[];
  spaceStatuses: FacilitySpaceStatusDef[];
  initialNodes: FacilityMapNode[];
};

function pickNextSpaceName(existing: FacilitySpace[]) {
  const names = new Set(existing.map((space) => space.name));
  let i = 1;
  let candidate = "New space";
  while (names.has(candidate)) {
    i += 1;
    candidate = `New space ${i}`;
  }
  return candidate;
}

function makeRandomSlugSuffix() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

function defaultTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function FacilityMapWorkspace({
  orgSlug,
  orgId,
  facility: initialFacility,
  canWrite,
  spaces: initialSpaces,
  spaceStatuses: initialStatuses,
  initialNodes
}: FacilityMapWorkspaceProps) {
  const { toast } = useToast();
  const [isSaving, startSaving] = useTransition();
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [facility, setFacility] = useState<Facility>(initialFacility);
  useEffect(() => {
    setFacility(initialFacility);
  }, [initialFacility]);
  const facilityId = facility.id;
  // Increment whenever the popup opens so the editor remounts and runs its
  // initial-fit effect again. Without this the user's last zoom/pan would
  // persist across close→reopen.
  const [popupSession, setPopupSession] = useState(0);
  useEffect(() => {
    if (isMapOpen) setPopupSession((s) => s + 1);
  }, [isMapOpen]);

  // The SSR-rendered SVG path of the inline preview disagrees with the
  // client-rendered one by sub-bit float precision (`Math.hypot` et al), which
  // React reports as a hydration mismatch. Defer the inline canvas to the
  // first client paint — the page is interactive only after mount anyway.
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [isStatusManagerOpen, setIsStatusManagerOpen] = useState(false);
  const [isLocationPopupOpen, setIsLocationPopupOpen] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);
  const [spaces, setSpaces] = useState<FacilitySpace[]>(initialSpaces);
  const [spaceStatuses, setSpaceStatuses] = useState<FacilitySpaceStatusDef[]>(initialStatuses);

  // Spaces are already scoped to this facility by the loader. We still
  // exclude archived spaces from the canvas (they stay in the DB so they
  // can be un-archived later, but no point cluttering the map).
  const visibleSpaces = useMemo(
    () => spaces.filter((space) => space.status !== "archived"),
    [spaces]
  );
  const visibleSpaceIdSet = useMemo(() => new Set(visibleSpaces.map((s) => s.id)), [visibleSpaces]);

  const isIndoor = facility.environment === "indoor";
  const geoAnchor =
    facility.geoAnchorLat != null && facility.geoAnchorLng != null
      ? { lat: facility.geoAnchorLat, lng: facility.geoAnchorLng }
      : null;
  const geoShowMap = Boolean(facility.geoShowMap && geoAnchor) && !isIndoor;

  async function handleToggleGeoMap() {
    if (!canWrite) return;
    if (!geoAnchor) {
      // No anchor yet — pick a location first.
      setIsLocationPopupOpen(true);
      return;
    }
    const result = await updateFacilityAction({
      orgSlug,
      facilityId,
      name: facility.name,
      slug: facility.slug,
      timezone: facility.timezone,
      environment: facility.environment,
      geoAnchorLat: facility.geoAnchorLat,
      geoAnchorLng: facility.geoAnchorLng,
      geoAddress: facility.geoAddress,
      geoShowMap: !geoShowMap
    });
    if (!result.ok) {
      toast({ title: "Couldn't update map", description: result.error, variant: "destructive" });
      return;
    }
    setFacility(result.data.facility);
  }

  async function handleSaveLocation(lat: number, lng: number, address?: string) {
    setSavingLocation(true);
    try {
      const result = await updateFacilityAction({
        orgSlug,
        facilityId,
        name: facility.name,
        slug: facility.slug,
        timezone: facility.timezone,
        environment: "outdoor",
        geoAnchorLat: lat,
        geoAnchorLng: lng,
        geoAddress: address ?? null,
        geoShowMap: true
      });
      if (!result.ok) {
        toast({ title: "Couldn't save location", description: result.error, variant: "destructive" });
        return;
      }
      setFacility(result.data.facility);
      setIsLocationPopupOpen(false);
      toast({ title: "Satellite map enabled", variant: "success" });
    } finally {
      setSavingLocation(false);
    }
  }
  // Stub kept so other handlers that still take this signature compile.
  // Will be removed in a follow-up. eslint-disable-next-line @typescript-eslint/no-unused-vars
  void setFacilitySpaceGeoAnchorAction;

  // The query layer already scopes spaces (and therefore nodes) to this
  // facility — `getFacilityMapManageDetail` filters by `facility_id`. Here
  // we just need to keep the in-memory node list aligned with the visible
  // (non-archived) spaces.
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(() => {
    return initialNodes.find((node) => visibleSpaceIdSet.has(node.entityId))?.id ?? null;
  });

  // Trust persisted geometry — the `mapRowToNode` load path already returns
  // sane points & bounds. Running through `normalizeLayout` here would re-snap
  // every polygon vertex to the 24px grid, destroying satellite-aligned shapes.
  const [nodes, setNodes] = useState<FacilityMapNode[]>(() =>
    initialNodes.filter((node) => visibleSpaceIdSet.has(node.entityId))
  );
  const [deletedNodeIds, setDeletedNodeIds] = useState<string[]>([]);

  const titleNode = (
    <span className="inline-flex items-center gap-2">
      <span>Facility Map</span>
    </span>
  );
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void getSpaceKindIcon;

  function handleDeleteNode(nodeId: string) {
    setNodes((current) => current.filter((node) => node.id !== nodeId));
    setDeletedNodeIds((current) => (current.includes(nodeId) ? current : [...current, nodeId]));
    setSelectedNodeId((current) => (current === nodeId ? null : current));
  }

  function handleSpaceDeleted(spaceId: string) {
    const orphanNodes = nodes.filter((node) => node.entityId === spaceId).map((node) => node.id);
    setSpaces((current) => current.filter((space) => space.id !== spaceId));
    setNodes((current) => current.filter((node) => node.entityId !== spaceId));
    setDeletedNodeIds((current) => Array.from(new Set([...current, ...orphanNodes])));
    setSelectedNodeId(null);
    setPanelSpaceId((current) => (current === spaceId ? null : current));
  }

  function handleSpaceUpdated(updated: FacilitySpace) {
    setSpaces((current) => current.map((space) => (space.id === updated.id ? updated : space)));
    setNodes((current) =>
      current.map((node) =>
        node.entityId === updated.id
          ? {
              ...node,
              label: updated.name,
              parentEntityId: updated.parentSpaceId,
              parentSpaceId: updated.parentSpaceId
            }
          : node
      )
    );
  }

  // The side panel is keyed off `panelSpaceId`, NOT the editor's
  // `selectedNodeId`. Selecting a polygon (clicking its body) shows
  // vertex handles + enables drag/reshape; the panel only opens when
  // the user clicks the title pill. Two separate intents, two separate
  // pieces of state.
  const [panelSpaceId, setPanelSpaceId] = useState<string | null>(null);
  const selectedSpace = panelSpaceId ? spaces.find((space) => space.id === panelSpaceId) ?? null : null;
  const isPanelOpen = selectedSpace !== null;

  // Optimistic create. Returns a FacilitySpace synchronously with a temp UUID
  // so the caller can drop a node on the canvas immediately. The server
  // create runs in the background; on success the temp UUID is swapped for
  // the real one in both spaces and nodes lists. On failure the optimistic
  // entries roll back.
  function handleCreateSpace(): FacilitySpace | null {
    if (!canWrite) return null;
    const name = pickNextSpaceName(spaces);
    const slug = `space-${makeRandomSlugSuffix()}`;
    const defaultStatus = spaceStatuses.find((s) => s.isSystem && s.behavesAs === "open") ?? spaceStatuses[0] ?? null;
    const tempId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `temp-${Math.random().toString(36).slice(2)}`;
    const now = new Date().toISOString();

    const optimistic: FacilitySpace = {
      id: tempId,
      orgId,
      facilityId,
      parentSpaceId: null,
      name,
      slug,
      spaceKind: "custom",
      status: defaultStatus?.behavesAs ?? "open",
      statusId: defaultStatus?.id ?? null,
      isBookable: true,
      timezone: defaultTimezone(),
      capacity: null,
      metadataJson: {},
      statusLabelsJson: {},
      sortIndex: 0,
      geoAnchorLat: null,
      geoAnchorLng: null,
      geoAddress: null,
      geoShowMap: false,
      createdAt: now,
      updatedAt: now
    };

    setSpaces((current) => [...current, optimistic]);

    void createFacilitySpaceAction({
      orgSlug,
      facilityId,
      parentSpaceId: null,
      name,
      slug,
      spaceKind: "custom",
      statusId: defaultStatus?.id ?? null,
      isBookable: true,
      timezone: defaultTimezone(),
      capacity: null,
      sortIndex: 0
    })
      .then((result) => {
        if (!result.ok) {
          toast({
            title: "Couldn't add space",
            description: result.error,
            variant: "destructive"
          });
          setSpaces((current) => current.filter((s) => s.id !== tempId));
          setNodes((current) => current.filter((n) => n.entityId !== tempId));
          setSelectedNodeId((current) => {
            if (!current) return current;
            const node = nodes.find((n) => n.id === current);
            return node && node.entityId === tempId ? null : current;
          });
          return;
        }
        const realSpace = result.data.space;
        setSpaces(result.data.readModel.spaces.filter((s) => s.facilityId === facilityId));
        setSpaceStatuses(result.data.readModel.spaceStatuses);
        setNodes((current) =>
          current.map((n) =>
            n.entityId === tempId
              ? { ...n, entityId: realSpace.id, spaceId: realSpace.id, label: realSpace.name }
              : n
          )
        );
      })
      .catch((err) => {
        toast({
          title: "Couldn't add space",
          description: err instanceof Error ? err.message : "Unexpected error.",
          variant: "destructive"
        });
        setSpaces((current) => current.filter((s) => s.id !== tempId));
        setNodes((current) => current.filter((n) => n.entityId !== tempId));
      });

    return optimistic;
  }

  const handleReadModel = useCallback((next: FacilityReservationReadModel) => {
    setSpaces(next.spaces.filter((s) => s.facilityId === facilityId));
    setSpaceStatuses(next.spaceStatuses);
  }, [facilityId]);

  function handleSave() {
    if (!canWrite) {
      return;
    }

    startSaving(async () => {
      const result = await saveFacilityMapAction({
        orgSlug,
        nodes,
        deletedNodeIds
      });

      if (!result.ok) {
        toast({
          title: "Unable to save facility map",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setNodes(result.data.nodes);
      setDeletedNodeIds([]);
      toast({
        title: "Facility map saved",
        variant: "success"
      });
    });
  }

  return (
    <div className="ui-stack-page">
      {!canWrite ? <Alert variant="info">You have read-only access to the facility map.</Alert> : null}

      <WorkspaceCardShell
        contentClassName="flex flex-col"
        description="Read-only preview, auto-fit to your spaces. Click Edit to open the full canvas."
        title={titleNode}
      >
        <div className="relative min-h-[420px] w-full flex-1 overflow-hidden rounded-card border border-border bg-canvas">
          {isMounted ? (
            <FacilityMapEditor
              canWrite={false}
              geoAnchor={geoAnchor}
              geoShowMap={geoShowMap}
              indoor={isIndoor}
              isSaving={false}
              nodes={nodes}
              onChangeNodes={() => undefined}
              onCreateSpace={() => null}
              onDeleteNode={() => undefined}
              onEdit={() => setIsMapOpen(true)}
              onEditGeoLocation={() => undefined}
              onSave={() => undefined}
              onSelectNode={() => undefined}
              onToggleGeoMap={() => undefined}
              orgId={orgId}
              readOnly
              selectedNodeId={null}
              spaceStatuses={spaceStatuses}
              spaces={visibleSpaces}
            />
          ) : null}
        </div>
      </WorkspaceCardShell>

      <Popup
        closeOnBackdrop={false}
        contentClassName="!p-0"
        onClose={() => {
          setIsMapOpen(false);
          setSelectedNodeId(null);
          setPanelSpaceId(null);
        }}
        open={isMapOpen}
        size="full"
        subtitle="Pan, zoom, drag vertices to reshape, and save when you're happy."
        title={titleNode}
      >
        <div className="relative h-full w-full">
          <div
            className="absolute inset-y-0 left-0 motion-reduce:transition-none"
            style={{
              right: isPanelOpen ? 360 : 0,
              transition: "right 220ms cubic-bezier(0.22, 1, 0.36, 1)",
              willChange: "right"
            }}
          >
            <FacilityMapEditor
              key={`editor-${popupSession}`}
              canWrite={canWrite}
              geoAnchor={geoAnchor}
              geoShowMap={geoShowMap}
              indoor={isIndoor}
              isSaving={isSaving}
              nodes={nodes}
              onChangeNodes={setNodes}
              onCreateSpace={handleCreateSpace}
              onDeleteNode={handleDeleteNode}
              onEditGeoLocation={() => setIsLocationPopupOpen(true)}
              onOpenSpaceDetails={setPanelSpaceId}
              onSave={handleSave}
              onSelectNode={setSelectedNodeId}
              onToggleGeoMap={handleToggleGeoMap}
              orgId={orgId}
              selectedNodeId={selectedNodeId}
              spaceStatuses={spaceStatuses}
              spaces={visibleSpaces}
            />
          </div>
          <div
            className="pointer-events-none absolute inset-y-0 right-0 w-[360px] max-w-full"
            data-panel-context="popup"
            id="popup-panel-dock"
          />
          <FacilitySpacePanel
            canWrite={canWrite}
            onClose={() => setPanelSpaceId(null)}
            onManageStatuses={() => setIsStatusManagerOpen(true)}
            onSpaceDeleted={handleSpaceDeleted}
            onSpaceUpdated={handleSpaceUpdated}
            open={isPanelOpen}
            orgSlug={orgSlug}
            space={selectedSpace}
            spaceStatuses={spaceStatuses}
          />
        </div>
      </Popup>

      <SpaceStatusManager
        canWrite={canWrite}
        onClose={() => setIsStatusManagerOpen(false)}
        onReadModel={handleReadModel}
        open={isStatusManagerOpen}
        orgSlug={orgSlug}
        statuses={spaceStatuses}
      />

      <SetLocationPopup
        initialAddress={facility.geoAddress ?? ""}
        initialLat={geoAnchor?.lat ?? null}
        initialLng={geoAnchor?.lng ?? null}
        onClose={() => setIsLocationPopupOpen(false)}
        onSave={handleSaveLocation}
        open={isLocationPopupOpen}
        saving={savingLocation}
      />
    </div>
  );
}
