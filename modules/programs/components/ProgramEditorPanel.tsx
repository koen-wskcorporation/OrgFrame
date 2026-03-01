"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DndContext, PointerSensor, closestCenter, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Building2, Eye, EyeOff, GripVertical, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CalendarPicker } from "@/components/ui/calendar-picker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip } from "@/components/ui/chip";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { PublishStatusIcon } from "@/components/ui/publish-status-icon";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AssetTile } from "@/components/ui/asset-tile";
import { useToast } from "@/components/ui/toast";
import { getOrgAssetPublicUrl } from "@/lib/branding/getOrgAssetPublicUrl";
import { cn } from "@/lib/utils";
import { FormCreatePanel } from "@/modules/forms/components/FormCreatePanel";
import type { OrgForm } from "@/modules/forms/types";
import { saveProgramHierarchyAction, saveProgramScheduleAction, updateProgramAction } from "@/modules/programs/actions";
import { ScheduleBuilderPage } from "@/modules/programs/schedule/components/ScheduleBuilderPage";
import type { ProgramNode, ProgramOccurrence, ProgramScheduleException, ProgramScheduleRule, ProgramWithDetails } from "@/modules/programs/types";
import { isProgramNodePublished } from "@/modules/programs/utils";

type ProgramEditorPanelProps = {
  orgSlug: string;
  data: ProgramWithDetails;
  forms: OrgForm[];
  canWritePrograms: boolean;
  canReadForms: boolean;
  canWriteForms: boolean;
  activeSection: "structure" | "schedule" | "registration";
  scheduleSeed?: {
    rules: ProgramScheduleRule[];
    occurrences: ProgramOccurrence[];
    exceptions: ProgramScheduleException[];
    timelineSource: "v2" | "legacy";
    timelineOccurrences: ProgramOccurrence[];
  };
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function splitDateTimeLocal(value: string) {
  if (!value) {
    return {
      date: "",
      time: ""
    };
  }

  const [datePart = "", timePart = ""] = value.split("T");
  return {
    date: datePart,
    time: timePart.slice(0, 5)
  };
}

function combineDateTimeLocal(date: string, time: string) {
  if (!date) {
    return "";
  }

  return `${date}T${time || "00:00"}`;
}

const ROOT_PARENT_KEY = "__root__";

function parentKey(parentId: string | null) {
  return parentId ?? ROOT_PARENT_KEY;
}

function containerDropId(parentId: string | null) {
  return `container:${parentKey(parentId)}`;
}

function intoDropId(nodeId: string) {
  return `into:${nodeId}`;
}

function parentFromContainerDropId(value: string): string | null | undefined {
  if (!value.startsWith("container:")) {
    return undefined;
  }

  const key = value.slice("container:".length);
  if (!key || key === ROOT_PARENT_KEY) {
    return null;
  }

  return key;
}

function buildNodeGroups(nodes: ProgramNode[]) {
  const groups = new Map<string, ProgramNode[]>();

  for (const node of [...nodes].sort((a, b) => a.sortIndex - b.sortIndex || a.name.localeCompare(b.name))) {
    const key = parentKey(node.parentId);
    const current = groups.get(key) ?? [];
    current.push(node);
    groups.set(key, current);
  }

  return groups;
}

function collectDescendantIds(nodes: ProgramNode[], rootId: string) {
  const childrenByParent = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) {
      continue;
    }

    const current = childrenByParent.get(node.parentId) ?? [];
    current.push(node.id);
    childrenByParent.set(node.parentId, current);
  }

  const stack = [...(childrenByParent.get(rootId) ?? [])];
  const descendants = new Set<string>();
  while (stack.length > 0) {
    const next = stack.pop();
    if (!next || descendants.has(next)) {
      continue;
    }

    descendants.add(next);
    const nested = childrenByParent.get(next) ?? [];
    for (const childId of nested) {
      stack.push(childId);
    }
  }

  return descendants;
}

function moveNodeInHierarchy(nodes: ProgramNode[], activeId: string, targetParentId: string | null, targetIndex: number): ProgramNode[] | null {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const activeNode = nodeById.get(activeId);
  if (!activeNode) {
    return null;
  }

  if (targetParentId === activeId) {
    return null;
  }

  if (activeNode.nodeKind === "team") {
    if (!targetParentId) {
      return null;
    }

    const targetParent = nodeById.get(targetParentId);
    if (!targetParent || targetParent.nodeKind !== "division") {
      return null;
    }
  }

  if (activeNode.nodeKind === "division" && targetParentId) {
    const targetParent = nodeById.get(targetParentId);
    if (targetParent?.nodeKind === "team") {
      return null;
    }
  }

  const descendants = collectDescendantIds(nodes, activeId);
  if (targetParentId && descendants.has(targetParentId)) {
    return null;
  }

  const groups = buildNodeGroups(nodes);
  const sourceKey = parentKey(activeNode.parentId);
  const sourceNodes = [...(groups.get(sourceKey) ?? [])];
  const sourceIndex = sourceNodes.findIndex((node) => node.id === activeId);
  if (sourceIndex < 0) {
    return null;
  }

  sourceNodes.splice(sourceIndex, 1);
  groups.set(sourceKey, sourceNodes);

  const targetKey = parentKey(targetParentId);
  const targetNodes = [...(groups.get(targetKey) ?? [])];
  let resolvedTargetIndex = Math.max(0, Math.min(targetIndex, targetNodes.length));
  if (sourceKey === targetKey && resolvedTargetIndex > sourceIndex) {
    resolvedTargetIndex -= 1;
  }

  targetNodes.splice(resolvedTargetIndex, 0, activeNode);
  groups.set(targetKey, targetNodes);

  const nextById = new Map(nodes.map((node) => [node.id, { ...node }]));
  for (const [key, siblings] of groups.entries()) {
    const resolvedParentId = key === ROOT_PARENT_KEY ? null : key;
    siblings.forEach((node, index) => {
      const next = nextById.get(node.id);
      if (!next) {
        return;
      }

      next.parentId = resolvedParentId;
      next.sortIndex = index;
    });
  }

  return nodes.map((node) => nextById.get(node.id) ?? node);
}

function HierarchyDropZone({ id, active }: { id: string; active: boolean }) {
  const { isOver, setNodeRef } = useDroppable({
    id
  });

  return (
    <div
      className={cn(
        !active && "hidden",
        "rounded-control border border-dashed px-2 py-1.5 text-center text-[11px] text-text-muted transition-colors",
        isOver ? "border-accent bg-accent/10 text-text" : "border-border bg-surface-muted/30"
      )}
      ref={setNodeRef}
    >
      Drop to place here
    </div>
  );
}

function StructureTreeRow({
  node,
  activeNodeId,
  disabled,
  isPublished,
  isPublishToggling,
  onDelete,
  onAddChild,
  onEdit,
  onTogglePublished,
  children,
  childrenPlacement = "outside"
}: {
  node: ProgramNode;
  activeNodeId: string | null;
  disabled: boolean;
  isPublished: boolean;
  isPublishToggling: boolean;
  onDelete: (nodeId: string) => void;
  onAddChild: (parentNodeId: string, nodeKind: ProgramNode["nodeKind"]) => void;
  onEdit: (node: ProgramNode) => void;
  onTogglePublished: (node: ProgramNode) => void;
  children: ReactNode;
  childrenPlacement?: "inside" | "outside";
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
    disabled
  });
  const { isOver: isIntoOver, setNodeRef: setIntoRef } = useDroppable({
    id: intoDropId(node.id),
    disabled
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };
  const showDropHints = Boolean(activeNodeId && activeNodeId !== node.id);
  const nodeTypeLabel = node.nodeKind === "team" ? "Team" : "Division";

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (rowRef.current?.contains(target)) {
        return;
      }

      setIsMenuOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isMenuOpen, rowRef]);

  return (
    <div className="flex w-full flex-col items-center" ref={rowRef}>
      <div
        className={cn(
          "w-full rounded-control border bg-surface shadow-sm transition-shadow",
          node.nodeKind === "division" ? "p-2" : "px-2 py-1",
          isDragging && "shadow-card opacity-80",
          isIntoOver && "border-accent bg-accent/5"
        )}
        ref={setNodeRef}
        style={style}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-1">
            <button
              aria-label={`Drag ${node.name}`}
              className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center text-text-muted hover:text-text"
              disabled={disabled}
              type="button"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-3 w-3" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="mt-0.5 flex items-center gap-1">
                <PublishStatusIcon
                  disabled={disabled}
                  isLoading={isPublishToggling}
                  isPublished={isPublished}
                  onToggle={() => onTogglePublished(node)}
                  statusLabel={isPublished ? `Published status for ${node.name}` : `Unpublished status for ${node.name}`}
                />
                <p className="truncate text-xs font-semibold text-text">{node.name}</p>
                <Chip size="small">{nodeTypeLabel}</Chip>
              </div>
            </div>
          </div>
          <div className="relative shrink-0">
            <div className="flex items-center gap-1">
              {node.nodeKind === "division" ? (
                <button
                  aria-label={`Add team to ${node.name}`}
                  className="h-6 w-6 rounded-control border border-border bg-surface-muted text-text-muted hover:bg-surface hover:text-text"
                  disabled={disabled}
                  onClick={() => onAddChild(node.id, "team")}
                  type="button"
                >
                  <Plus className="mx-auto h-3.5 w-3.5" />
                </button>
              ) : null}
              <button
                aria-label="Open node actions"
                className="h-6 w-6 rounded-control border border-border bg-surface-muted text-text-muted hover:bg-surface hover:text-text"
                disabled={disabled}
                onClick={() => setIsMenuOpen((current) => !current)}
                type="button"
              >
                <MoreHorizontal className="mx-auto h-3.5 w-3.5" />
              </button>
            </div>
            {isMenuOpen ? (
              <div className="absolute right-0 top-8 z-20 w-44 rounded-control border bg-surface p-2 shadow-floating">
                <div className="space-y-1">
                  <Button
                    className="w-full justify-start"
                    onClick={() => {
                      onTogglePublished(node);
                      setIsMenuOpen(false);
                    }}
                    size="sm"
                    type="button"
                    variant={isPublished ? "secondary" : "primary"}
                  >
                    {isPublished ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {isPublished ? "Unpublish" : "Publish"}
                  </Button>
                  <Button
                    className="w-full justify-start"
                    onClick={() => {
                      onEdit(node);
                      setIsMenuOpen(false);
                    }}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit details
                  </Button>
                  <Button
                    className="w-full justify-start"
                    onClick={() => {
                      onDelete(node.id);
                      setIsMenuOpen(false);
                    }}
                    size="sm"
                    type="button"
                    variant="destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <div className={cn("pt-2", showDropHints ? "block" : "hidden")}>
          <div
            className={cn(
              "rounded-control border border-dashed px-2 py-1.5 text-center text-[11px] text-text-muted transition-colors",
              isIntoOver ? "border-accent bg-accent/10 text-text" : "border-border bg-surface-muted/30"
            )}
            ref={setIntoRef}
          >
            Drop here to nest under {node.name}
          </div>
        </div>
        {childrenPlacement === "inside" ? (
          <div className="mt-2">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-text-muted">Teams</p>
            <div className="rounded-control border-2 border-dotted border-border/80 p-2">{children}</div>
          </div>
        ) : null}
      </div>
      {childrenPlacement === "outside" ? children : null}
    </div>
  );
}

export function ProgramEditorPanel({
  orgSlug,
  data,
  forms: initialForms,
  canWritePrograms,
  canReadForms,
  canWriteForms,
  activeSection,
  scheduleSeed
}: ProgramEditorPanelProps) {
  const { toast } = useToast();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSavingProgram, startSavingProgram] = useTransition();
  const [isMutatingNodes, startMutatingNodes] = useTransition();
  const [isMutatingSchedule, startMutatingSchedule] = useTransition();
  const [isProgramSettingsOpen, setIsProgramSettingsOpen] = useState(false);
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [isDivisionCreateOpen, setIsDivisionCreateOpen] = useState(false);
  const [isRootMenuOpen, setIsRootMenuOpen] = useState(false);
  const [isNodeEditOpen, setIsNodeEditOpen] = useState(false);
  const [activeDragNodeId, setActiveDragNodeId] = useState<string | null>(null);
  const [publishToggleNodeId, setPublishToggleNodeId] = useState<string | null>(null);
  const [nodes, setNodes] = useState(data.nodes);
  const [scheduleBlocks, setScheduleBlocks] = useState(data.scheduleBlocks);
  const [savedSlug, setSavedSlug] = useState(data.program.slug);

  const [name, setName] = useState(data.program.name);
  const [slug, setSlug] = useState(data.program.slug);
  const [description, setDescription] = useState(data.program.description ?? "");
  const [programType, setProgramType] = useState(data.program.programType);
  const [customTypeLabel, setCustomTypeLabel] = useState(data.program.customTypeLabel ?? "");
  const [status, setStatus] = useState(data.program.status);
  const [startDate, setStartDate] = useState(data.program.startDate ?? "");
  const [endDate, setEndDate] = useState(data.program.endDate ?? "");
  const [coverImagePath, setCoverImagePath] = useState(data.program.coverImagePath ?? "");

  const [nodeName, setNodeName] = useState("");
  const [nodeSlug, setNodeSlug] = useState("");
  const [nodeKind, setNodeKind] = useState<"division" | "team">("division");
  const [parentId, setParentId] = useState<string>("");
  const [capacity, setCapacity] = useState("");
  const [waitlistEnabled, setWaitlistEnabled] = useState(true);
  const [editingNodeId, setEditingNodeId] = useState("");
  const [editingNodeName, setEditingNodeName] = useState("");
  const [editingNodeSlug, setEditingNodeSlug] = useState("");
  const [editingNodeKind, setEditingNodeKind] = useState<"division" | "team">("division");
  const [editingCapacity, setEditingCapacity] = useState("");
  const [editingWaitlistEnabled, setEditingWaitlistEnabled] = useState(true);
  const [editingPublished, setEditingPublished] = useState(true);

  const [scheduleType, setScheduleType] = useState<"date_range" | "meeting_pattern" | "one_off">("date_range");
  const [scheduleTitle, setScheduleTitle] = useState("");
  const [scheduleNodeId, setScheduleNodeId] = useState("");
  const [scheduleStartDate, setScheduleStartDate] = useState("");
  const [scheduleEndDate, setScheduleEndDate] = useState("");
  const [scheduleStartTime, setScheduleStartTime] = useState("");
  const [scheduleEndTime, setScheduleEndTime] = useState("");
  const [scheduleByDay, setScheduleByDay] = useState("");
  const [scheduleOneOffAt, setScheduleOneOffAt] = useState("");
  const scheduleOneOffParts = splitDateTimeLocal(scheduleOneOffAt);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6
      }
    })
  );

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const nodeGroups = useMemo(() => buildNodeGroups(nodes), [nodes]);
  const linkedForms = useMemo(() => initialForms.filter((form) => form.programId === data.program.id), [initialForms, data.program.id]);
  const editingNode = editingNodeId ? nodeById.get(editingNodeId) : null;
  const editingParentNode = editingNode?.parentId ? nodeById.get(editingNode.parentId) : null;
  const canSetEditingNodeToTeam = Boolean(editingNode && editingParentNode?.nodeKind === "division");

  useEffect(() => {
    if (searchParams.get("panel") === "settings") {
      setIsProgramSettingsOpen(true);
    }
  }, [searchParams]);

  const parentOptions = useMemo(
    () => [
      { value: "", label: "(Program root)" },
      ...nodes.map((node) => ({
        value: node.id,
        label: `${node.name} (${node.nodeKind})`
      }))
    ],
    [nodes]
  );
  const divisionParentOptions = useMemo(
    () =>
      nodes
        .filter((node) => node.nodeKind === "division")
        .map((node) => ({
          value: node.id,
          label: `${node.name} (division)`
        })),
    [nodes]
  );
  const createParentOptions = nodeKind === "team" ? divisionParentOptions : parentOptions;

  async function handleProgramSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startSavingProgram(async () => {
      const result = await updateProgramAction({
        orgSlug,
        programId: data.program.id,
        slug,
        name,
        description,
        programType,
        customTypeLabel,
        status,
        startDate,
        endDate,
        coverImagePath,
        registrationOpenAt: data.program.registrationOpenAt ?? undefined,
        registrationCloseAt: data.program.registrationCloseAt ?? undefined
      });

      if (!result.ok) {
        toast({
          title: "Unable to save program",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Program saved",
        variant: "success"
      });
      setSavedSlug(slug);
      setIsProgramSettingsOpen(false);
      if (searchParams.get("panel") === "settings") {
        router.replace(pathname);
      }
    });
  }

  function handleNodeCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const resolvedSlug = nodeSlug || slugify(nodeName);
    if (!resolvedSlug) {
      toast({
        title: "Missing node slug",
        variant: "destructive"
      });
      return;
    }

    if (nodeKind === "team" && !parentId) {
      toast({
        title: "Division required",
        description: "Teams must be created inside a division.",
        variant: "destructive"
      });
      return;
    }

    startMutatingNodes(async () => {
      const result = await saveProgramHierarchyAction({
        orgSlug,
        programId: data.program.id,
        action: "create",
        parentId: parentId || null,
        name: nodeName,
        slug: resolvedSlug,
        nodeKind,
        capacity: capacity ? Number.parseInt(capacity, 10) : null,
        waitlistEnabled
      });

      if (!result.ok) {
        toast({
          title: "Unable to add node",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setNodeName("");
      setNodeSlug("");
      setParentId("");
      setCapacity("");
      setNodeKind("division");
      setWaitlistEnabled(true);
      setNodes(result.data.details.nodes);
      setScheduleBlocks(result.data.details.scheduleBlocks);
      setIsDivisionCreateOpen(false);
      toast({ title: "Node added", variant: "success" });
    });
  }

  function handleNodeDelete(nodeId: string) {
    startMutatingNodes(async () => {
      const result = await saveProgramHierarchyAction({
        orgSlug,
        programId: data.program.id,
        action: "delete",
        nodeId
      });

      if (!result.ok) {
        toast({
          title: "Unable to delete node",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      toast({ title: "Node deleted", variant: "success" });
      setNodes(result.data.details.nodes);
      setScheduleBlocks(result.data.details.scheduleBlocks);
    });
  }

  function openNodeEditPanel(node: ProgramNode) {
    setEditingNodeId(node.id);
    setEditingNodeName(node.name);
    setEditingNodeSlug(node.slug);
    setEditingNodeKind(node.nodeKind);
    setEditingCapacity(node.capacity?.toString() ?? "");
    setEditingWaitlistEnabled(node.waitlistEnabled);
    setEditingPublished(isProgramNodePublished(node));
    setIsNodeEditOpen(true);
  }

  function handleNodeEditSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const resolvedSlug = editingNodeSlug || slugify(editingNodeName);
    if (!resolvedSlug) {
      toast({
        title: "Missing node slug",
        variant: "destructive"
      });
      return;
    }

    startMutatingNodes(async () => {
      const result = await saveProgramHierarchyAction({
        orgSlug,
        programId: data.program.id,
        action: "update",
        nodeId: editingNodeId,
        name: editingNodeName,
        slug: resolvedSlug,
        nodeKind: editingNodeKind,
        capacity: editingCapacity ? Number.parseInt(editingCapacity, 10) : null,
        waitlistEnabled: editingWaitlistEnabled,
        isPublished: editingPublished
      });

      if (!result.ok) {
        toast({
          title: "Unable to save node",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setNodes(result.data.details.nodes);
      setScheduleBlocks(result.data.details.scheduleBlocks);
      setIsNodeEditOpen(false);
      toast({ title: "Node updated", variant: "success" });
    });
  }

  function handleNodePublishToggle(node: ProgramNode) {
    const isPublished = isProgramNodePublished(node);
    setPublishToggleNodeId(node.id);

    startMutatingNodes(async () => {
      try {
        const result = await saveProgramHierarchyAction({
          orgSlug,
          programId: data.program.id,
          action: "set-published",
          nodeId: node.id,
          isPublished: !isPublished
        });

        if (!result.ok) {
          toast({
            title: isPublished ? "Unable to unpublish node" : "Unable to publish node",
            description: result.error,
            variant: "destructive"
          });
          return;
        }

        toast({
          title: isPublished ? "Node unpublished" : "Node published",
          variant: "success"
        });
        setNodes(result.data.details.nodes);
        setScheduleBlocks(result.data.details.scheduleBlocks);
      } finally {
        setPublishToggleNodeId(null);
      }
    });
  }

  function openNodeCreatePanel(parentNodeId: string | null = null, nextNodeKind: ProgramNode["nodeKind"] = "division") {
    setNodeName("");
    setNodeSlug("");
    setCapacity("");
    setWaitlistEnabled(true);
    setParentId(parentNodeId ?? "");
    setNodeKind(nextNodeKind);
    setIsDivisionCreateOpen(true);
  }

  function handleNodeDragStart(event: DragStartEvent) {
    setActiveDragNodeId(String(event.active.id));
  }

  function handleNodeDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    setActiveDragNodeId(null);

    if (!overId || isMutatingNodes) {
      return;
    }

    let targetParentId: string | null = null;
    let targetIndex = 0;

    if (overId.startsWith("into:")) {
      targetParentId = overId.slice("into:".length) || null;
      const siblings = nodeGroups.get(parentKey(targetParentId)) ?? [];
      targetIndex = siblings.length;
    } else {
      const containerParent = parentFromContainerDropId(overId);
      if (containerParent !== undefined) {
        targetParentId = containerParent;
        const siblings = nodeGroups.get(parentKey(targetParentId)) ?? [];
        targetIndex = siblings.length;
      } else {
        const overNode = nodeById.get(overId);
        if (!overNode) {
          return;
        }

        targetParentId = overNode.parentId;
        const siblings = nodeGroups.get(parentKey(targetParentId)) ?? [];
        targetIndex = siblings.findIndex((sibling) => sibling.id === overNode.id);
        if (targetIndex < 0) {
          targetIndex = siblings.length;
        }
      }
    }

    const nextNodes = moveNodeInHierarchy(nodes, activeId, targetParentId, targetIndex);
    if (!nextNodes) {
      toast({
        title: "Invalid move",
        description: "Teams must stay inside divisions and nodes cannot move into their own descendants.",
        variant: "destructive"
      });
      return;
    }

    const previousNodes = nodes;
    const hasChanged = nextNodes.some((node, index) => {
      const previous = previousNodes[index];
      return previous.parentId !== node.parentId || previous.sortIndex !== node.sortIndex || previous.nodeKind !== node.nodeKind;
    });

    if (!hasChanged) {
      return;
    }

    setNodes(nextNodes);
    startMutatingNodes(async () => {
      const result = await saveProgramHierarchyAction({
        orgSlug,
        programId: data.program.id,
        action: "reorder",
        nodes: nextNodes.map((node) => ({
          nodeId: node.id,
          parentId: node.parentId,
          sortIndex: node.sortIndex,
          nodeKind: node.nodeKind
        }))
      });

      if (!result.ok) {
        setNodes(previousNodes);
        toast({
          title: "Unable to move node",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setNodes(result.data.details.nodes);
      setScheduleBlocks(result.data.details.scheduleBlocks);
      toast({
        title: "Hierarchy updated",
        variant: "success"
      });
    });
  }

  function renderStructureBranch(parentId: string | null, options?: { contained?: boolean }): ReactNode {
    const contained = options?.contained ?? false;
    const siblings = nodeGroups.get(parentKey(parentId)) ?? [];
    const showDropZone = Boolean(activeDragNodeId);
    const showConnectorLine = siblings.length > 1;
    const rowGapPx = 12;
    const siblingCount = Math.max(1, siblings.length);
    const siblingWidth = `calc((100% - ${(siblingCount - 1) * rowGapPx}px) / ${siblingCount})`;

    if (siblings.length === 0 && !showDropZone) {
      return null;
    }

    if (contained) {
      return (
        <div className="flex w-full flex-col gap-2">
          {siblings.length > 0 ? (
            <div className="flex w-full flex-nowrap gap-2">
              <SortableContext items={siblings.map((node) => node.id)} strategy={rectSortingStrategy}>
                {siblings.map((node) => {
                  const childContained = node.nodeKind === "division";
                  return (
                    <div className="flex min-w-[56px] flex-1 items-stretch" key={node.id}>
                      <StructureTreeRow
                        activeNodeId={activeDragNodeId}
                        childrenPlacement={childContained ? "inside" : "outside"}
                        disabled={isMutatingNodes}
                        isPublished={isProgramNodePublished(node)}
                        isPublishToggling={publishToggleNodeId === node.id}
                        node={node}
                        onAddChild={openNodeCreatePanel}
                        onDelete={handleNodeDelete}
                        onEdit={openNodeEditPanel}
                        onTogglePublished={handleNodePublishToggle}
                      >
                        {renderStructureBranch(node.id, { contained: childContained })}
                      </StructureTreeRow>
                    </div>
                  );
                })}
              </SortableContext>
            </div>
          ) : null}
          <HierarchyDropZone active={showDropZone} id={containerDropId(parentId)} />
        </div>
      );
    }

    return (
      <div className="mt-3 flex w-full flex-col items-center">
        {siblings.length > 0 ? <div className="h-4 w-px bg-border" /> : null}
        {siblings.length > 0 ? (
          <div className="relative flex w-full flex-nowrap justify-center gap-3 pt-4">
            {showConnectorLine ? <div className="absolute left-8 right-8 top-0 h-px bg-border" /> : null}
            <SortableContext items={siblings.map((node) => node.id)} strategy={rectSortingStrategy}>
              {siblings.map((node) => {
                const childContained = node.nodeKind === "division";
                return (
                  <div className="relative flex shrink-0 flex-col items-stretch" key={node.id} style={{ width: siblingWidth, minWidth: "56px" }}>
                    <div className="absolute -top-4 left-1/2 h-4 w-px -translate-x-1/2 bg-border" />
                    <StructureTreeRow
                      activeNodeId={activeDragNodeId}
                      childrenPlacement={childContained ? "inside" : "outside"}
                      disabled={isMutatingNodes}
                      isPublished={isProgramNodePublished(node)}
                      isPublishToggling={publishToggleNodeId === node.id}
                      node={node}
                      onAddChild={openNodeCreatePanel}
                      onDelete={handleNodeDelete}
                      onEdit={openNodeEditPanel}
                      onTogglePublished={handleNodePublishToggle}
                    >
                      {renderStructureBranch(node.id, { contained: childContained })}
                    </StructureTreeRow>
                  </div>
                );
              })}
            </SortableContext>
          </div>
        ) : null}
        <div className="mt-2 w-full">
          <HierarchyDropZone active={showDropZone} id={containerDropId(parentId)} />
        </div>
      </div>
    );
  }

  function handleScheduleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const byDay = scheduleByDay
      .split(",")
      .map((part) => Number.parseInt(part.trim(), 10))
      .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);

    startMutatingSchedule(async () => {
      const result = await saveProgramScheduleAction({
        orgSlug,
        programId: data.program.id,
        action: "create",
        blockType: scheduleType,
        title: scheduleTitle,
        programNodeId: scheduleNodeId || null,
        startDate: scheduleStartDate,
        endDate: scheduleEndDate,
        startTime: scheduleStartTime,
        endTime: scheduleEndTime,
        byDay: byDay.length > 0 ? byDay : undefined,
        oneOffAt: scheduleOneOffAt || undefined,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });

      if (!result.ok) {
        toast({
          title: "Unable to add schedule block",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setScheduleTitle("");
      setScheduleNodeId("");
      setScheduleStartDate("");
      setScheduleEndDate("");
      setScheduleStartTime("");
      setScheduleEndTime("");
      setScheduleByDay("");
      setScheduleOneOffAt("");
      setNodes(result.data.details.nodes);
      setScheduleBlocks(result.data.details.scheduleBlocks);
      toast({ title: "Schedule block added", variant: "success" });
    });
  }

  function handleScheduleDelete(scheduleBlockId: string) {
    startMutatingSchedule(async () => {
      const result = await saveProgramScheduleAction({
        orgSlug,
        programId: data.program.id,
        action: "delete",
        scheduleBlockId
      });

      if (!result.ok) {
        toast({
          title: "Unable to delete schedule block",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      toast({ title: "Schedule block deleted", variant: "success" });
      setNodes(result.data.details.nodes);
      setScheduleBlocks(result.data.details.scheduleBlocks);
    });
  }

  function openCreateFormPanel() {
    if (linkedForms.length > 0) {
      return;
    }

    setIsCreateFormOpen(true);
  }

  useEffect(() => {
    if (nodeKind !== "team") {
      return;
    }

    const selectedParent = nodes.find((node) => node.id === parentId);
    if (!selectedParent || selectedParent.nodeKind !== "division") {
      setParentId("");
    }
  }, [nodeKind, parentId, nodes]);

  return (
    <div className="space-y-6">
      <Panel
        footer={
          <>
            <Button onClick={() => setIsProgramSettingsOpen(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={isSavingProgram} form="program-settings-form" loading={isSavingProgram} type="submit">
              {isSavingProgram ? "Saving..." : "Save program"}
            </Button>
          </>
        }
        onClose={() => setIsProgramSettingsOpen(false)}
        open={isProgramSettingsOpen}
        panelClassName="ml-auto max-w-[300px]"
        subtitle="Configure the core program details and publish state."
        title="Program settings"
      >
        <form className="grid gap-4" id="program-settings-form" onSubmit={handleProgramSave}>
          <FormField label="Program name">
            <Input onChange={(event) => setName(event.target.value)} required value={name} />
          </FormField>
          <FormField label="Slug">
            <Input
              onChange={(event) => setSlug(slugify(event.target.value))}
              required
              slugValidation={{
                kind: "program",
                orgSlug,
                currentSlug: savedSlug
              }}
              value={slug}
            />
          </FormField>
          <FormField label="Type">
            <Select
              onChange={(event) => setProgramType(event.target.value as "league" | "season" | "clinic" | "custom")}
              options={[
                { value: "league", label: "League" },
                { value: "season", label: "Season" },
                { value: "clinic", label: "Clinic" },
                { value: "custom", label: "Custom" }
              ]}
              value={programType}
            />
          </FormField>
          <FormField label="Status">
            <Select
              onChange={(event) => setStatus(event.target.value as "draft" | "published" | "archived")}
              options={[
                { value: "draft", label: "Draft" },
                { value: "published", label: "Published" },
                { value: "archived", label: "Archived" }
              ]}
              value={status}
            />
          </FormField>
          {programType === "custom" ? (
            <FormField label="Custom type label">
              <Input onChange={(event) => setCustomTypeLabel(event.target.value)} required value={customTypeLabel} />
            </FormField>
          ) : null}
          <FormField label="Description">
            <Textarea className="min-h-[80px]" onChange={(event) => setDescription(event.target.value)} value={description} />
          </FormField>
          <FormField label="Cover photo">
            <AssetTile
              constraints={{
                accept: "image/*,.svg",
                maxSizeMB: 10,
                aspect: "wide",
                recommendedPx: {
                  w: 1600,
                  h: 900
                }
              }}
              fit="cover"
              initialPath={coverImagePath || null}
              initialUrl={getOrgAssetPublicUrl(coverImagePath)}
              kind="org"
              onChange={(asset) => setCoverImagePath(asset.path)}
              onRemove={() => setCoverImagePath("")}
              orgSlug={orgSlug}
              purpose="program-cover"
              specificationText="PNG, JPG, WEBP, HEIC, or SVG"
              title="Program cover"
            />
          </FormField>
          <FormField label="Start date">
            <CalendarPicker onChange={setStartDate} value={startDate} />
          </FormField>
          <FormField label="End date">
            <CalendarPicker onChange={setEndDate} value={endDate} />
          </FormField>
        </form>
      </Panel>

      {activeSection === "registration" ? (
        <>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Linked forms</CardTitle>
                  <CardDescription>Forms connected to this program.</CardDescription>
                </div>
                <Button disabled={!canWriteForms || linkedForms.length > 0} onClick={openCreateFormPanel} type="button" variant="secondary">
                  Create + link form
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!canReadForms ? <Alert variant="info">You do not have permission to view forms.</Alert> : null}
              {canReadForms && !canWriteForms ? <Alert variant="info">You have read-only access to forms.</Alert> : null}

              {canReadForms ? (
                <>
                  {linkedForms.length === 0 ? <Alert variant="info">No forms are linked to this program yet.</Alert> : null}
                  {linkedForms.map((form) => (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border bg-surface px-3 py-3" key={form.id}>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-text">{form.name}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link className="text-sm font-semibold text-link hover:underline" href={`/${orgSlug}/tools/forms/${form.id}/editor`}>
                          Manage form
                        </Link>
                      </div>
                    </div>
                  ))}
                </>
              ) : null}
            </CardContent>
          </Card>

          <FormCreatePanel
            canWrite={canWriteForms}
            fixedProgram={{
              id: data.program.id,
              name: data.program.name
            }}
            onClose={() => setIsCreateFormOpen(false)}
            open={isCreateFormOpen}
            orgSlug={orgSlug}
            programs={[]}
          />
        </>
      ) : null}

      {activeSection === "structure" ? (
        <>
          <Card>
            <CardHeader className="pb-6">
              <CardTitle>Program structure</CardTitle>
              <CardDescription>Map out divisions and teams. Teams must always be nested under a division.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex w-full flex-col items-center gap-3">
                <div className="w-[280px] max-w-[min(82vw,280px)] rounded-control border bg-surface px-4 py-3 text-center shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-text-muted">Program</p>
                  <p className="font-semibold text-text">{name}</p>
                </div>
                <div className="relative">
                  <Button
                    aria-label="Open root actions"
                    className="h-8 w-8 px-0"
                    disabled={isMutatingNodes}
                    onClick={() => setIsRootMenuOpen((current) => !current)}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                  {isRootMenuOpen ? (
                    <div className="absolute left-1/2 top-10 z-20 w-44 -translate-x-1/2 rounded-control border bg-surface p-2 shadow-floating">
                      <div className="space-y-1">
                        <Button
                          className="w-full justify-start"
                          onClick={() => {
                            openNodeCreatePanel(null, "division");
                            setIsRootMenuOpen(false);
                          }}
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          <Building2 className="h-3.5 w-3.5" />
                          Add division
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
                {nodes.length === 0 ? <Alert variant="info">No structure nodes yet. Add a division to start the map.</Alert> : null}
              </div>

              {nodes.length > 0 || activeDragNodeId ? (
                <DndContext
                  collisionDetection={closestCenter}
                  onDragCancel={() => setActiveDragNodeId(null)}
                  onDragEnd={handleNodeDragEnd}
                  onDragStart={handleNodeDragStart}
                  sensors={sensors}
                >
                  {renderStructureBranch(null)}
                </DndContext>
              ) : null}
            </CardContent>
          </Card>

          <Panel
        footer={
          <>
            <Button onClick={() => setIsNodeEditOpen(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={isMutatingNodes} form="edit-structure-node-form" loading={isMutatingNodes} type="submit" variant="secondary">
              {isMutatingNodes ? "Saving..." : "Save node"}
            </Button>
          </>
        }
        onClose={() => setIsNodeEditOpen(false)}
        open={isNodeEditOpen}
        panelClassName="ml-auto max-w-[300px]"
        subtitle="Edit node details for your structure map."
        title="Edit node"
      >
        <form className="grid gap-3" id="edit-structure-node-form" onSubmit={handleNodeEditSave}>
          <FormField label="Name">
            <Input onChange={(event) => setEditingNodeName(event.target.value)} required value={editingNodeName} />
          </FormField>
          <FormField hint="Optional, auto-generated if blank." label="Slug">
            <Input onChange={(event) => setEditingNodeSlug(slugify(event.target.value))} value={editingNodeSlug} />
          </FormField>
          <FormField label="Type">
            <Select
              onChange={(event) => setEditingNodeKind(event.target.value as "division" | "team")}
              options={[
                { value: "division", label: "Division" },
                ...(canSetEditingNodeToTeam || editingNodeKind === "team" ? [{ value: "team", label: "Team" }] : [])
              ]}
              value={editingNodeKind}
            />
          </FormField>
          <FormField hint="Optional" label="Capacity">
            <Input onChange={(event) => setEditingCapacity(event.target.value)} type="number" value={editingCapacity} />
          </FormField>
          <label className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-sm text-text">
            <Checkbox checked={editingWaitlistEnabled} onChange={(event) => setEditingWaitlistEnabled(event.target.checked)} />
            Waitlist enabled
          </label>
          <label className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-sm text-text">
            <Checkbox checked={editingPublished} onChange={(event) => setEditingPublished(event.target.checked)} />
            Published
          </label>
        </form>
          </Panel>

          <Panel
        footer={
          <>
            <Button onClick={() => setIsDivisionCreateOpen(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={isMutatingNodes} form="create-structure-node-form" loading={isMutatingNodes} type="submit" variant="secondary">
              {isMutatingNodes ? "Saving..." : "Add node"}
            </Button>
          </>
        }
        onClose={() => setIsDivisionCreateOpen(false)}
        open={isDivisionCreateOpen}
        panelClassName="ml-auto max-w-[300px]"
        subtitle="Add divisions or teams anywhere in your structure map."
        title="Add structure node"
      >
        <form className="grid gap-3" id="create-structure-node-form" onSubmit={handleNodeCreate}>
          <FormField label="Name">
            <Input onChange={(event) => setNodeName(event.target.value)} required value={nodeName} />
          </FormField>
          <FormField hint="Optional, auto-generated if blank." label="Slug">
            <Input onChange={(event) => setNodeSlug(slugify(event.target.value))} value={nodeSlug} />
          </FormField>
          <FormField label="Type">
            <Select
              onChange={(event) => setNodeKind(event.target.value as "division" | "team")}
              options={[
                { value: "division", label: "Division" },
                { value: "team", label: "Team" }
              ]}
              value={nodeKind}
            />
          </FormField>
          <FormField label="Parent">
            <Select onChange={(event) => setParentId(event.target.value)} options={createParentOptions} value={parentId} />
          </FormField>
          <FormField hint="Optional" label="Capacity">
            <Input onChange={(event) => setCapacity(event.target.value)} type="number" value={capacity} />
          </FormField>
          <label className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-sm text-text">
            <Checkbox checked={waitlistEnabled} onChange={(event) => setWaitlistEnabled(event.target.checked)} />
            Waitlist enabled
          </label>
        </form>
          </Panel>
        </>
      ) : null}

      {activeSection === "schedule" ? (
        <ScheduleBuilderPage
          canWrite={canWritePrograms}
          initialExceptions={scheduleSeed?.exceptions ?? []}
          initialLegacyOccurrences={scheduleSeed?.timelineSource === "legacy" ? scheduleSeed.timelineOccurrences : undefined}
          initialOccurrences={scheduleSeed?.occurrences ?? []}
          initialRules={scheduleSeed?.rules ?? []}
          initialSource={scheduleSeed?.timelineSource ?? "v2"}
          nodes={nodes}
          orgSlug={orgSlug}
          programId={data.program.id}
        />
      ) : null}
    </div>
  );
}
