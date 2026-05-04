"use client";

import * as React from "react";
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useToast } from "@orgframe/ui/primitives/toast";
import { useRouter } from "next/navigation";
import type { CanvasBounds } from "@/src/features/canvas/core/types";
import { EditorShell } from "@/src/features/canvas/components/EditorShell";
import { saveProgramMapAction } from "@/src/features/programs/map/actions";
import { CreateDivisionWizard } from "@/src/features/programs/map/components/CreateDivisionWizard";
import { CreateTeamWizard } from "@/src/features/programs/map/components/CreateTeamWizard";
import { EditNodeWizard } from "@/src/features/programs/map/components/EditNodeWizard";
import { ProgramMapEditor } from "@/src/features/programs/map/components/ProgramMapEditor";
import { ProgramAssignmentsPanel } from "@/src/features/programs/map/components/ProgramAssignmentsPanel";
import type { AssignmentCandidate } from "@/src/features/programs/map/types";
import { useProgramMapDraft } from "@/src/features/programs/map/useProgramMapDraft";
import { addTeamMemberAction, addTeamStaffAction } from "@/src/features/programs/teams/actions";
import type { ProgramNode } from "@/src/features/programs/types";

type ProgramMapWorkspaceProps = {
  orgSlug: string;
  programId: string;
  programName: string;
  canWrite: boolean;
  initialNodes: ProgramNode[];
  teamIdByNodeId: Record<string, string>;
  assignmentDock: { players: AssignmentCandidate[]; coaches: AssignmentCandidate[] };
  /** Open the fullscreen editor immediately on mount. */
  defaultEditorOpen?: boolean;
  /** Skip rendering the read-only preview card; useful when this workspace
   *  is mounted on a dedicated page rather than a tabbed shell. */
  hidePreview?: boolean;
  onEditorClose?: () => void;
};

type AddTeamRequest = { parentId: string | null };

export function ProgramMapWorkspace({
  orgSlug,
  programId,
  programName,
  canWrite,
  initialNodes,
  teamIdByNodeId,
  assignmentDock,
  defaultEditorOpen = false,
  hidePreview = false,
  onEditorClose
}: ProgramMapWorkspaceProps) {
  const router = useRouter();
  const toast = useToast();

  const [nodesFromServer, setNodesFromServer] = React.useState(initialNodes);
  React.useEffect(() => {
    setNodesFromServer(initialNodes);
  }, [initialNodes]);

  const draft = useProgramMapDraft(nodesFromServer);
  const [editingNodeId, setEditingNodeId] = React.useState<string | null>(null);
  const [assignmentsOpen, setAssignmentsOpen] = React.useState(false);
  const [creatingDivision, setCreatingDivision] = React.useState(false);
  const [addTeamRequest, setAddTeamRequest] = React.useState<AddTeamRequest | null>(null);
  const [isSaving, setSaving] = React.useState(false);

  const editingNode = React.useMemo(
    () => draft.nodes.find((node) => node.id === editingNodeId) ?? null,
    [draft.nodes, editingNodeId]
  );

  const divisions = React.useMemo(
    () => draft.nodes.filter((node) => node.nodeKind === "division"),
    [draft.nodes]
  );

  const existingSlugs = React.useMemo(
    () => new Set(nodesFromServer.map((node) => node.slug)),
    [nodesFromServer]
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const refreshFromServer = React.useCallback(() => {
    router.refresh();
  }, [router]);

  const handleSave = React.useCallback(async () => {
    if (!canWrite) return;
    const payload = draft.buildSavePayload();
    if (payload.updates.length === 0) {
      toast.toast({ title: "Nothing to save" });
      return;
    }
    setSaving(true);
    const result = await saveProgramMapAction({
      orgSlug,
      programId,
      updates: payload.updates
    });
    setSaving(false);
    if (!result.ok) {
      toast.toast({ title: "Couldn't save map", description: result.error, variant: "destructive" });
      return;
    }
    setNodesFromServer(result.data.nodes);
    draft.commit(result.data.nodes);
    toast.toast({ title: "Map saved" });
  }, [canWrite, draft, orgSlug, programId, toast]);

  const handleAddDivision = React.useCallback(() => {
    if (!canWrite) return;
    setCreatingDivision(true);
  }, [canWrite]);

  const handleAddTeam = React.useCallback(() => {
    if (!canWrite) return;
    // Default the parent to whichever division contains the currently selected
    // node — matches the user's mental "I clicked here, add under it" intent.
    let parentId: string | null = null;
    if (editingNode?.nodeKind === "division") parentId = editingNode.id;
    else if (editingNode?.nodeKind === "team") parentId = editingNode.parentId;
    if (!parentId) parentId = divisions[0]?.id ?? null;
    if (!parentId) {
      toast.toast({
        title: "Add a division first",
        description: "Teams must live inside a division.",
        variant: "destructive"
      });
      setCreatingDivision(true);
      return;
    }
    setAddTeamRequest({ parentId });
  }, [canWrite, divisions, editingNode, toast]);

  const handleDragEnd = React.useCallback(
    async (event: DragEndEvent) => {
      const overData = event.over?.data.current as { nodeId?: string; nodeKind?: string } | undefined;
      const activeData = event.active.data.current as
        | { kind?: "player" | "coach"; item?: AssignmentCandidate }
        | undefined;
      if (!overData?.nodeId || !activeData?.item) return;
      if (overData.nodeKind !== "team") return;
      const teamId = teamIdByNodeId[overData.nodeId];
      if (!teamId) {
        toast.toast({
          title: "Team not ready",
          description: "Save the map and refresh — the team's roster row hasn't been provisioned yet.",
          variant: "destructive"
        });
        return;
      }
      const item = activeData.item;
      if (item.kind === "player") {
        const result = await addTeamMemberAction({
          orgSlug,
          teamId,
          playerId: item.playerId,
          registrationId: item.registrationId,
          status: "active",
          role: "player"
        });
        if (!result.ok) {
          toast.toast({ title: "Couldn't assign player", description: result.error, variant: "destructive" });
          return;
        }
        toast.toast({ title: "Player assigned" });
        refreshFromServer();
      } else {
        const result = await addTeamStaffAction({
          orgSlug,
          teamId,
          userId: item.userId,
          role: "assistant_coach"
        });
        if (!result.ok) {
          toast.toast({ title: "Couldn't assign coach", description: result.error, variant: "destructive" });
          return;
        }
        toast.toast({ title: "Coach assigned" });
        refreshFromServer();
      }
    },
    [orgSlug, refreshFromServer, teamIdByNodeId, toast]
  );

  const handleDiscardDirty = React.useCallback(() => {
    draft.discard();
    setEditingNodeId(null);
    setAssignmentsOpen(false);
    setCreatingDivision(false);
    setAddTeamRequest(null);
  }, [draft]);

  // Drag-drop onto teams should only register while the assignments panel is open —
  // otherwise team nodes are passive selection targets. We keep the existing
  // `mode` prop on ProgramMapEditor for now and drive it from assignmentsOpen.
  const editorMode: "structure" | "assignments" = assignmentsOpen ? "assignments" : "structure";

  const titleNode = (
    <span className="inline-flex items-center gap-2">
      <span>{programName} — Map</span>
    </span>
  );

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <EditorShell
        canWrite={canWrite}
        defaultEditorOpen={defaultEditorOpen}
        hidePreview={hidePreview}
        isDirty={draft.isDirty}
        onDiscardDirty={handleDiscardDirty}
        onEditorClose={onEditorClose}
        popupSubtitle="Drag boxes to reposition. Open the Assignments panel to drag people onto teams."
        previewDescription="Read-only preview, auto-fit to your divisions and teams. Click Edit to open the full canvas."
        readOnlyMessage="You have read-only access to this program's map."
        title={titleNode}
        renderEditor={({ mode: shellMode, popupSession, requestEdit }) =>
          shellMode === "preview" ? (
            <ProgramMapEditor
              key={`program-map-preview-${popupSession}`}
              nodes={draft.nodes}
              selectedNodeId={null}
              canWrite={false}
              mode="structure"
              isSaving={false}
              isDirty={false}
              readOnly
              onSelectNode={() => undefined}
              onChangeBounds={() => undefined}
              onBringToFront={() => undefined}
              onEdit={requestEdit}
            />
          ) : (
            <ProgramMapEditor
              key={`program-map-${popupSession}`}
              nodes={draft.nodes}
              selectedNodeId={editingNodeId}
              canWrite={canWrite}
              mode={editorMode}
              isSaving={isSaving}
              isDirty={draft.isDirty}
              onSelectNode={setEditingNodeId}
              onChangeBounds={(nodeId, bounds: CanvasBounds) => draft.setBounds(nodeId, bounds)}
              onBringToFront={draft.bringToFront}
              onSave={handleSave}
              assignmentsOpen={assignmentsOpen}
              onToggleAssignments={() => setAssignmentsOpen((open) => !open)}
              onAddDivision={handleAddDivision}
              onAddTeam={handleAddTeam}
            />
          )
        }
      />

      {/* Panels portal into the global PanelContainer (the multi-panel
          layout area), where they can be reordered, resized, and stacked
          alongside any other panels the user has open. */}
      {editingNode ? (
        <EditNodeWizard
          open={editingNode !== null}
          onClose={() => setEditingNodeId(null)}
          orgSlug={orgSlug}
          programId={programId}
          node={editingNode}
          canWrite={canWrite}
          onMutated={refreshFromServer}
        />
      ) : null}

      <ProgramAssignmentsPanel
        open={assignmentsOpen}
        onClose={() => setAssignmentsOpen(false)}
        players={assignmentDock.players}
        coaches={assignmentDock.coaches}
      />

      <CreateDivisionWizard
        open={creatingDivision}
        onClose={() => setCreatingDivision(false)}
        orgSlug={orgSlug}
        programId={programId}
        existingSlugs={existingSlugs}
        onCreated={refreshFromServer}
      />

      <CreateTeamWizard
        open={addTeamRequest !== null}
        onClose={() => setAddTeamRequest(null)}
        orgSlug={orgSlug}
        programId={programId}
        divisions={divisions}
        defaultParentId={addTeamRequest?.parentId ?? null}
        existingSlugs={existingSlugs}
        onCreated={refreshFromServer}
      />
    </DndContext>
  );
}
