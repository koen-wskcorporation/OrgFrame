"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Popup } from "@orgframe/ui/primitives/popup";
import { useToast } from "@orgframe/ui/primitives/toast";
import { WorkspaceCardShell } from "@/src/features/core/layout/components/WorkspaceCardShell";
import {
  createFacilitySpaceAction,
  saveFacilityMapAction,
  setFacilitySpaceGeoAnchorAction
} from "@/src/features/facilities/actions";
import { getSpaceKindIcon } from "@/src/features/facilities/lib/spaceKindIcon";
import type {
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
  activeSpaceId: string;
  activeSpaceName: string;
  canWrite: boolean;
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
  activeSpaceId,
  activeSpaceName: _activeSpaceName,
  canWrite,
  spaces: initialSpaces,
  spaceStatuses: initialStatuses,
  initialNodes
}: FacilityMapWorkspaceProps) {
  const { toast } = useToast();
  const [isSaving, startSaving] = useTransition();
  const [isMapOpen, setIsMapOpen] = useState(false);
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

  // The active facility is the CANVAS, not a shape ON the canvas — only its
  // descendants render as nodes. (`visibleSpaceIds` controls node filtering;
  // `visibleSpaces` keeps the active facility in the lookup map so label /
  // status / parent-id resolution still work.)
  const descendantSpaceIds = useMemo(() => {
    const childrenByParent = new Map<string, string[]>();
    for (const space of spaces) {
      const parent = space.parentSpaceId;
      if (!parent) continue;
      const list = childrenByParent.get(parent) ?? [];
      list.push(space.id);
      childrenByParent.set(parent, list);
    }
    const result = new Set<string>();
    const queue = [activeSpaceId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const child of childrenByParent.get(current) ?? []) {
        if (!result.has(child)) {
          result.add(child);
          queue.push(child);
        }
      }
    }
    return result;
  }, [spaces, activeSpaceId]);

  const visibleSpaceIds = useMemo(() => {
    const set = new Set<string>(descendantSpaceIds);
    set.add(activeSpaceId);
    return set;
  }, [descendantSpaceIds, activeSpaceId]);

  const visibleSpaces = useMemo(
    () => spaces.filter((space) => visibleSpaceIds.has(space.id)),
    [spaces, visibleSpaceIds]
  );

  const activeSpace = spaces.find((s) => s.id === activeSpaceId) ?? null;
  // Walk up to the root building to read its `environment` metadata. Indoor
  // facilities render on the design grid only; we hide the satellite + map-
  // pin toolbar buttons so users don't try to set a location.
  const rootBuilding = useMemo(() => {
    let cursor: FacilitySpace | null = activeSpace;
    const guard = new Set<string>();
    while (cursor && cursor.parentSpaceId && !guard.has(cursor.id)) {
      guard.add(cursor.id);
      const parent: FacilitySpace | undefined = spaces.find((s) => s.id === cursor!.parentSpaceId);
      if (!parent) break;
      cursor = parent;
    }
    return cursor;
  }, [activeSpace, spaces]);

  const isIndoor = (rootBuilding?.metadataJson as { environment?: string } | undefined)?.environment === "indoor";
  const geoAnchor =
    activeSpace?.geoAnchorLat != null && activeSpace?.geoAnchorLng != null
      ? { lat: activeSpace.geoAnchorLat, lng: activeSpace.geoAnchorLng }
      : null;
  const geoShowMap = Boolean(activeSpace?.geoShowMap && geoAnchor) && !isIndoor;

  async function handleToggleGeoMap() {
    if (!canWrite) return;
    if (!geoAnchor) {
      // No anchor yet — pick a location first.
      setIsLocationPopupOpen(true);
      return;
    }
    const result = await setFacilitySpaceGeoAnchorAction({
      orgSlug,
      spaceId: activeSpaceId,
      geoAnchorLat: geoAnchor.lat,
      geoAnchorLng: geoAnchor.lng,
      geoAddress: activeSpace?.geoAddress ?? null,
      geoShowMap: !geoShowMap
    });
    if (!result.ok) {
      toast({ title: "Couldn't update map", description: result.error, variant: "destructive" });
      return;
    }
    setSpaces(result.data.readModel.spaces);
  }

  async function handleSaveLocation(lat: number, lng: number, address?: string) {
    setSavingLocation(true);
    try {
      const result = await setFacilitySpaceGeoAnchorAction({
        orgSlug,
        spaceId: activeSpaceId,
        geoAnchorLat: lat,
        geoAnchorLng: lng,
        geoAddress: address ?? null,
        geoShowMap: true
      });
      if (!result.ok) {
        toast({ title: "Couldn't save location", description: result.error, variant: "destructive" });
        return;
      }
      setSpaces(result.data.readModel.spaces);
      setIsLocationPopupOpen(false);
      toast({ title: "Satellite map enabled", variant: "success" });
    } finally {
      setSavingLocation(false);
    }
  }

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(() => {
    return initialNodes.find((node) => descendantSpaceIds.has(node.entityId))?.id ?? null;
  });

  // Trust persisted geometry — the `mapRowToNode` load path already returns
  // sane points & bounds. Running through `normalizeLayout` here would re-snap
  // every polygon vertex to the 24px grid, destroying satellite-aligned shapes.
  // Filter to descendants ONLY (not the active facility itself) — the active
  // facility is the canvas, not a shape on it.
  const [nodes, setNodes] = useState<FacilityMapNode[]>(() =>
    initialNodes.filter((node) => descendantSpaceIds.has(node.entityId))
  );
  const [deletedNodeIds, setDeletedNodeIds] = useState<string[]>([]);

  const ActiveKindIcon = activeSpace ? getSpaceKindIcon(activeSpace.spaceKind) : null;
  const titleNode = (
    <span className="inline-flex items-center gap-2">
      {ActiveKindIcon ? <ActiveKindIcon className="h-4 w-4 text-text-muted" /> : null}
      <span>Facility Map</span>
    </span>
  );

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

  const selectedNode = selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) ?? null : null;
  const selectedSpace = selectedNode ? spaces.find((space) => space.id === selectedNode.entityId) ?? null : null;
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
    const parent = spaces.find((s) => s.id === activeSpaceId) ?? null;

    const optimistic: FacilitySpace = {
      id: tempId,
      orgId,
      parentSpaceId: activeSpaceId,
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
      geoAnchorLat: parent?.geoAnchorLat ?? null,
      geoAnchorLng: parent?.geoAnchorLng ?? null,
      geoAddress: parent?.geoAddress ?? null,
      geoShowMap: parent?.geoShowMap ?? false,
      createdAt: now,
      updatedAt: now
    };

    setSpaces((current) => [...current, optimistic]);

    void createFacilitySpaceAction({
      orgSlug,
      parentSpaceId: activeSpaceId,
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
        setSpaces(result.data.readModel.spaces);
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
    setSpaces(next.spaces);
    setSpaceStatuses(next.spaceStatuses);
  }, []);

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
            onClose={() => setSelectedNodeId(null)}
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
        initialAddress={activeSpace?.geoAddress ?? ""}
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
