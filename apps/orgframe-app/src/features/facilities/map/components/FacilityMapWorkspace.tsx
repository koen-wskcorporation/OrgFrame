"use client";

import { useMemo, useState, useTransition } from "react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { Popup } from "@orgframe/ui/primitives/popup";
import { useToast } from "@orgframe/ui/primitives/toast";
import { Check } from "lucide-react";
import { WorkspaceCardShell } from "@/src/features/core/layout/components/WorkspaceCardShell";
import { saveFacilityMapAction } from "@/src/features/facilities/actions";
import { normalizeLayout } from "@/src/features/canvas/core/layout";
import type { FacilitySpace } from "@/src/features/facilities/types";
import type { FacilityMapNode } from "@/src/features/facilities/map/types";
import { FacilityMapEditor } from "@/src/features/facilities/map/components/FacilityMapEditor";

type FacilityMapWorkspaceProps = {
  orgSlug: string;
  activeSpaceId: string;
  activeSpaceName: string;
  canWrite: boolean;
  spaces: FacilitySpace[];
  initialNodes: FacilityMapNode[];
};

export function FacilityMapWorkspace({ orgSlug, activeSpaceId, activeSpaceName, canWrite, spaces, initialNodes }: FacilityMapWorkspaceProps) {
  const { toast } = useToast();
  const [isSaving, startSaving] = useTransition();
  const [isMapOpen, setIsMapOpen] = useState(true);
  const [geoShowMap, setGeoShowMap] = useState(false);

  // Restrict the editor to spaces that live underneath the active facility:
  // the active space itself + every transitive descendant. Without this the
  // editor renders every space in the org on a single canvas and auto-fit
  // zooms out so far that each individual shape is unreadable.
  const visibleSpaceIds = useMemo(() => {
    const childrenByParent = new Map<string, string[]>();
    for (const space of spaces) {
      const parent = space.parentSpaceId;
      if (!parent) continue;
      const list = childrenByParent.get(parent) ?? [];
      list.push(space.id);
      childrenByParent.set(parent, list);
    }
    const result = new Set<string>([activeSpaceId]);
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

  const visibleSpaces = useMemo(
    () => spaces.filter((space) => visibleSpaceIds.has(space.id)),
    [spaces, visibleSpaceIds]
  );

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(() => {
    const active = initialNodes.find((node) => node.entityId === activeSpaceId);
    return active?.id ?? initialNodes.find((node) => visibleSpaceIds.has(node.entityId))?.id ?? null;
  });
  const [nodes, setNodes] = useState<FacilityMapNode[]>(() =>
    normalizeLayout(initialNodes.filter((node) => visibleSpaceIds.has(node.entityId))) as FacilityMapNode[]
  );

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const activeLabel = selectedNode?.label ?? activeSpaceName;

  function handleSave() {
    if (!canWrite) {
      return;
    }

    startSaving(async () => {
      const result = await saveFacilityMapAction({
        orgSlug,
        nodes
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
        actions={
          <Button onClick={() => setIsMapOpen(true)} type="button">
            Open full screen map
          </Button>
        }
        contentClassName="space-y-4"
        description="Open the full screen facility map canvas for editing and layout management."
        title={`Facility Map · ${activeLabel}`}
      >
        <p className="text-sm text-text-muted">Spaces in map: {spaces.length}</p>
        <p className="text-sm text-text-muted">Canvas is now presented in a full screen popup.</p>
      </WorkspaceCardShell>

      <Popup
        closeOnBackdrop={false}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button onClick={() => setIsMapOpen(false)} type="button" variant="ghost">
              Close
            </Button>
            <Button disabled={!canWrite} loading={isSaving} onClick={handleSave} type="button">
              <Check className="h-4 w-4" />
              Save Map
            </Button>
          </div>
        }
        onClose={() => setIsMapOpen(false)}
        open={isMapOpen}
        size="full"
        subtitle="Unified grid canvas with deterministic snapping, collision controls, and parent/child connectors."
        title={`Facility Map · ${activeLabel}`}
      >
        <FacilityMapEditor
          canWrite={canWrite}
          // Per-space lat/lng anchoring (the "Edit location" map-pin flow)
          // hasn't been restored from the lost session yet, so the editor
          // can't actually center the satellite layer on real imagery —
          // toggling satellite while `geoAnchor` is null leaves the canvas
          // showing the grid. The toolbar's satellite button is still
          // exposed so the affordance is visible.
          geoAnchor={null}
          geoShowMap={geoShowMap}
          isSaving={isSaving}
          nodes={nodes}
          onChangeNodes={setNodes}
          // Adding a space from inside the editor requires a server-side
          // create flow (`createFacilitySpaceAction` + draft state) that
          // also hasn't been recovered. Returning null keeps the toolbar's
          // "+" wired but no-ops it.
          onCreateSpace={() => null}
          onDeleteNode={(nodeId) => setNodes((current) => current.filter((node) => node.id !== nodeId))}
          onEdit={() => setIsMapOpen(true)}
          onEditGeoLocation={() => {
            toast({
              title: "Set facility location",
              description: "Saving a lat/lng anchor for the satellite layer is part of recovery still in progress."
            });
          }}
          onSave={handleSave}
          onSelectNode={setSelectedNodeId}
          onToggleGeoMap={() => {
            setGeoShowMap((current) => !current);
            // Without a geo anchor the satellite layer can't render — surface
            // that as a toast so the toggle isn't silently a no-op.
            if (!geoShowMap) {
              toast({
                title: "Set facility location to use satellite",
                description: "This facility doesn't have a saved lat/lng yet. The map-pin / location editor is still being recovered."
              });
            }
          }}
          orgId=""
          selectedNodeId={selectedNodeId}
          spaces={visibleSpaces}
          spaceStatuses={[]}
        />
      </Popup>
    </div>
  );
}
