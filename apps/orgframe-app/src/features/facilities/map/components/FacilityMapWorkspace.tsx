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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(() => {
    const active = initialNodes.find((node) => node.entityId === activeSpaceId);
    return active?.id ?? initialNodes[0]?.id ?? null;
  });
  const [nodes, setNodes] = useState<FacilityMapNode[]>(() => normalizeLayout(initialNodes) as FacilityMapNode[]);

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
        <FacilityMapEditor canWrite={canWrite} nodes={nodes} onChangeNodes={setNodes} onSelectNode={setSelectedNodeId} selectedNodeId={selectedNodeId} />
      </Popup>
    </div>
  );
}
