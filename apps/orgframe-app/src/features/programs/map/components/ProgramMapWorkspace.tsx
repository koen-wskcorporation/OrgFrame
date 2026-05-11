"use client";

import * as React from "react";
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useToast } from "@orgframe/ui/primitives/toast";
import { useRouter } from "next/navigation";
import { EditorShell } from "@/src/features/canvas/components/EditorShell";
import { saveProgramHierarchyAction, updateProgramAction } from "@/src/features/programs/actions";
import { CreateNodeWizard } from "@/src/features/programs/map/components/CreateNodeWizard";
import { EditNodeWizard } from "@/src/features/programs/map/components/EditNodeWizard";
import { ProgramMapEditor } from "@/src/features/programs/map/components/ProgramMapEditor";
import { ProgramAssignmentsPanel } from "@/src/features/programs/map/components/ProgramAssignmentsPanel";
import type { AssignmentCandidate, ProgramMapNode } from "@/src/features/programs/map/types";
import type { ProgramMapNodeCounts } from "@/src/features/programs/map/queries";
import { addTeamMemberAction, addTeamStaffAction } from "@/src/features/programs/teams/actions";
import type { Program, ProgramNode, ProgramStatus } from "@/src/features/programs/types";

type ProgramMapWorkspaceProps = {
  orgSlug: string;
  programId: string;
  /** Full program record — drives the central root node's title + status picker. */
  program: Program;
  canWrite: boolean;
  initialNodes: ProgramNode[];
  teamIdByNodeId: Record<string, string>;
  nodeCounts: ProgramMapNodeCounts;
  assignmentDock: { players: AssignmentCandidate[]; coaches: AssignmentCandidate[] };
  /** Open the fullscreen editor immediately on mount. */
  defaultEditorOpen?: boolean;
  /** Skip rendering the read-only preview card; useful when this workspace
   *  is mounted on a dedicated page rather than a tabbed shell. */
  hidePreview?: boolean;
  onEditorClose?: () => void;
};

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft", color: "amber" },
  { value: "published", label: "Published", color: "emerald" },
  { value: "archived", label: "Archived", color: "rose" }
];

function mapNodesForEditor(nodes: ProgramNode[]): ProgramMapNode[] {
  return nodes.map((node) => ({
    id: node.id,
    programId: node.programId,
    parentId: node.parentId,
    name: node.name,
    slug: node.slug,
    nodeKind: node.nodeKind,
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    zIndex: 0,
    capacity: node.capacity,
    isPublished: node.settingsJson?.published === true,
    placedByFallback: false
  }));
}

export function ProgramMapWorkspace({
  orgSlug,
  programId,
  program,
  canWrite,
  initialNodes,
  teamIdByNodeId,
  nodeCounts,
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

  const [programState, setProgramState] = React.useState(program);
  React.useEffect(() => {
    setProgramState(program);
  }, [program]);

  const mappedNodes = React.useMemo(() => mapNodesForEditor(nodesFromServer), [nodesFromServer]);

  const [editingNodeId, setEditingNodeId] = React.useState<string | null>(null);
  const [assignmentsOpen, setAssignmentsOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createDefaultParentId, setCreateDefaultParentId] = React.useState<string | null>(null);
  const [createDefaultKind, setCreateDefaultKind] = React.useState<"division" | "team" | null>(null);

  const editingNode = React.useMemo(
    () => mappedNodes.find((node) => node.id === editingNodeId) ?? null,
    [mappedNodes, editingNodeId]
  );

  const divisions = React.useMemo(
    () => mappedNodes.filter((node) => node.nodeKind === "division"),
    [mappedNodes]
  );

  const existingSlugs = React.useMemo(
    () => new Set(nodesFromServer.map((node) => node.slug)),
    [nodesFromServer]
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const refreshFromServer = React.useCallback(() => {
    router.refresh();
  }, [router]);

  const applyNodesFromAction = React.useCallback(
    (nextNodes: ProgramNode[]) => {
      setNodesFromServer(nextNodes);
      router.refresh();
    },
    [router]
  );

  const handleTogglePublished = React.useCallback(
    async (nodeId: string, next: boolean) => {
      if (!canWrite) return;
      const result = await saveProgramHierarchyAction({
        orgSlug,
        programId,
        action: "set-published",
        nodeId,
        isPublished: next
      });
      if (!result.ok) {
        toast.toast({
          title: "Couldn't update status",
          description: result.error,
          variant: "destructive"
        });
        return;
      }
      applyNodesFromAction(result.data.details.nodes);
    },
    [applyNodesFromAction, canWrite, orgSlug, programId, toast]
  );

  const handleProgramStatusChange = React.useCallback(
    async (next: ProgramStatus) => {
      if (!canWrite || next === programState.status) return;
      const previous = programState.status;
      setProgramState((current) => ({ ...current, status: next }));
      const result = await updateProgramAction({
        orgSlug,
        programId,
        slug: programState.slug,
        name: programState.name,
        description: programState.description ?? undefined,
        programType: programState.programType,
        customTypeLabel: programState.customTypeLabel ?? undefined,
        status: next,
        startDate: programState.startDate ?? undefined,
        endDate: programState.endDate ?? undefined,
        coverImagePath: programState.coverImagePath ?? undefined,
        registrationOpenAt: programState.registrationOpenAt ?? undefined,
        registrationCloseAt: programState.registrationCloseAt ?? undefined
      });
      if (!result.ok) {
        setProgramState((current) => ({ ...current, status: previous }));
        toast.toast({
          title: "Couldn't change status",
          description: result.error,
          variant: "destructive"
        });
        return;
      }
      router.refresh();
    },
    [canWrite, orgSlug, programId, programState, router, toast]
  );

  const handleAdd = React.useCallback(() => {
    if (!canWrite) return;
    let parentId: string | null = null;
    if (editingNode?.nodeKind === "division") parentId = editingNode.id;
    else if (editingNode?.nodeKind === "team") parentId = editingNode.parentId;
    setCreateDefaultParentId(parentId);
    setCreateDefaultKind(null);
    setCreateOpen(true);
  }, [canWrite, editingNode]);

  const handleAddTeamUnder = React.useCallback(
    (divisionId: string) => {
      if (!canWrite) return;
      setCreateDefaultParentId(divisionId);
      setCreateDefaultKind("team");
      setCreateOpen(true);
    },
    [canWrite]
  );

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
          description: "The team's roster row hasn't been provisioned yet — refresh and try again.",
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
    setEditingNodeId(null);
    setAssignmentsOpen(false);
    setCreateOpen(false);
  }, []);

  const editorMode: "structure" | "assignments" = assignmentsOpen ? "assignments" : "structure";

  const titleNode = (
    <span className="inline-flex items-center gap-2">
      <span>{programState.name} — Map</span>
    </span>
  );

  const programStatusPicker = canWrite
    ? {
        value: programState.status,
        onChange: handleProgramStatusChange,
        options: STATUS_OPTIONS,
        disabled: false
      }
    : undefined;

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <EditorShell
        canWrite={canWrite}
        defaultEditorOpen={defaultEditorOpen}
        hidePreview={hidePreview}
        isDirty={false}
        onDiscardDirty={handleDiscardDirty}
        onEditorClose={onEditorClose}
        popupSubtitle="Tree-laid-out view of your program. Open the Assignments panel to drag people onto teams."
        previewDescription="Read-only preview of the program tree. Click Edit to open the full canvas."
        readOnlyMessage="You have read-only access to this program's map."
        title={titleNode}
        renderEditor={({ mode: shellMode, popupSession, requestEdit }) =>
          shellMode === "preview" ? (
            <ProgramMapEditor
              key={`program-map-preview-${popupSession}`}
              nodes={mappedNodes}
              selectedNodeId={null}
              canWrite={false}
              mode="structure"
              nodeCounts={nodeCounts}
              programName={programState.name}
              programStatus={programState.status}
              isSaving={false}
              readOnly
              onSelectNode={() => undefined}
              onEdit={requestEdit}
            />
          ) : (
            <ProgramMapEditor
              key={`program-map-${popupSession}`}
              nodes={mappedNodes}
              selectedNodeId={editingNodeId}
              canWrite={canWrite}
              mode={editorMode}
              nodeCounts={nodeCounts}
              programName={programState.name}
              programStatus={programState.status}
              programStatusPicker={programStatusPicker}
              isSaving={false}
              onSelectNode={setEditingNodeId}
              assignmentsOpen={assignmentsOpen}
              onToggleAssignments={() => setAssignmentsOpen((open) => !open)}
              onAdd={handleAdd}
              onAddTeamUnder={handleAddTeamUnder}
              onTogglePublished={handleTogglePublished}
            />
          )
        }
      />

      {editingNode ? (
        <EditNodeWizard
          open={editingNode !== null}
          onClose={() => setEditingNodeId(null)}
          orgSlug={orgSlug}
          programId={programId}
          programSlug={programState.slug}
          node={editingNode}
          parentDivisionSlug={
            editingNode.nodeKind === "team"
              ? divisions.find((division) => division.id === editingNode.parentId)?.slug ?? null
              : null
          }
          canWrite={canWrite}
          existingSlugs={existingSlugs}
          onMutated={refreshFromServer}
        />
      ) : null}

      <ProgramAssignmentsPanel
        open={assignmentsOpen}
        onClose={() => setAssignmentsOpen(false)}
        players={assignmentDock.players}
        coaches={assignmentDock.coaches}
      />

      <CreateNodeWizard
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        orgSlug={orgSlug}
        programId={programId}
        programSlug={programState.slug}
        divisions={divisions}
        defaultParentId={createDefaultParentId}
        defaultKind={createDefaultKind}
        existingSlugs={existingSlugs}
        onCreated={applyNodesFromAction}
      />
    </DndContext>
  );
}
