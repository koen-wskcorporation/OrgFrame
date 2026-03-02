"use client";

import Link from "next/link";
import { DndContext, PointerSensor, closestCenter, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { Eye, EyeOff, GripVertical, MoreHorizontal, Pencil, Plus, Search, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CalendarPicker } from "@/components/ui/calendar-picker";
import { CanvasViewport, type CanvasViewportHandle } from "@/components/ui/canvas-viewport";
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
  activeSection: "structure" | "schedule" | "registration" | "settings";
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
const DIVISION_CARD_WIDTH_PX = 240;

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
  isSearchMatch,
  isFocused,
  canvasScale,
  activeDragNodeKind,
  divisionBreadcrumb,
  disabled,
  isPublished,
  isPublishToggling,
  onDelete,
  onAddChild,
  onActivateDivision,
  onEdit,
  onTogglePublished,
  teamCount,
  teamChildren,
  branchChildren
}: {
  node: ProgramNode;
  activeNodeId: string | null;
  isSearchMatch: boolean;
  isFocused: boolean;
  canvasScale: number;
  activeDragNodeKind: ProgramNode["nodeKind"] | null;
  divisionBreadcrumb: string[] | null;
  disabled: boolean;
  isPublished: boolean;
  isPublishToggling: boolean;
  onDelete: (nodeId: string) => void;
  onAddChild: (parentNodeId: string, nodeKind: ProgramNode["nodeKind"]) => void;
  onActivateDivision: (nodeId: string) => void;
  onEdit: (node: ProgramNode) => void;
  onTogglePublished: (node: ProgramNode) => void;
  teamCount: number;
  teamChildren?: ReactNode;
  branchChildren?: ReactNode;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRowHovered, setIsRowHovered] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
    disabled
  });
  const allowNestDrop = node.nodeKind === "division" && activeDragNodeKind === "team";
  const { isOver: isIntoOver, setNodeRef: setIntoRef } = useDroppable({
    id: intoDropId(node.id),
    disabled: disabled || !allowNestDrop
  });

  const normalizedScale = Math.max(0.01, canvasScale);
  const style =
    transform !== null
      ? {
          // DnD deltas are in screen pixels; compensate for zoomed canvas so the dragged node tracks the cursor correctly.
          transform: `translate(${transform.x / normalizedScale}px, ${transform.y / normalizedScale}px) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})`,
          transition
        }
      : {
          transition
        };
  const showDropHints = allowNestDrop && Boolean(activeNodeId && activeNodeId !== node.id);
  const nodeTypeLabel = node.nodeKind === "team" ? "Team" : "Division";
  const breadcrumbParts = divisionBreadcrumb ?? [node.name];
  const hasNestedDivisionBreadcrumb = node.nodeKind === "division" && breadcrumbParts.length > 1;

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
    <div
      className="flex w-full flex-col items-center"
      onPointerDown={() => {
        if (node.nodeKind === "division") {
          onActivateDivision(node.id);
        }
      }}
      ref={rowRef}
    >
      <div
        className={cn(
          "w-full cursor-default rounded-control border bg-surface shadow-sm transition-shadow",
          node.nodeKind === "division" ? "min-w-[240px]" : "min-w-0",
          node.nodeKind === "division" ? "p-2" : "px-2 py-1",
          isDragging && "shadow-card",
          isFocused && "border-accent ring-2 ring-accent/60",
          isSearchMatch && "border-accent ring-1 ring-accent/40",
          isIntoOver && "border-accent bg-accent/5"
        )}
        onPointerEnter={() => setIsRowHovered(true)}
        onPointerLeave={() => setIsRowHovered(false)}
        data-canvas-pan-ignore="true"
        data-structure-node-id={node.id}
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
                {hasNestedDivisionBreadcrumb ? (
                  <p className="truncate whitespace-nowrap text-xs font-semibold text-text" title={breadcrumbParts.join(" / ")}>
                    {breadcrumbParts.map((segment, index) => (
                      <span className={index === breadcrumbParts.length - 1 ? "text-text" : "text-text-muted"} key={`${segment}-${index}`}>
                        {segment}
                        {index < breadcrumbParts.length - 1 ? " / " : ""}
                      </span>
                    ))}
                  </p>
                ) : (
                  <p className="truncate text-xs font-semibold text-text" title={node.name}>
                    {node.name}
                  </p>
                )}
                <Chip size="small">{nodeTypeLabel}</Chip>
              </div>
            </div>
          </div>
          <div className="relative shrink-0">
            <div className="flex items-center gap-1">
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
                    className="ui-button-danger w-full justify-start"
                    onClick={() => {
                      onDelete(node.id);
                      setIsMenuOpen(false);
                    }}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        {node.nodeKind === "division" ? (
          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Teams</p>
            </div>
            <div
              className={cn(
                "relative rounded-control border-2 border-dotted border-border/80 p-2",
                teamCount === 0 && !disabled ? "cursor-pointer hover:bg-surface-muted/20" : undefined
              )}
              onClick={
                teamCount === 0 && !disabled
                  ? () => {
                      onAddChild(node.id, "team");
                    }
                  : undefined
              }
            >
              {showDropHints ? (
                <div
                  className={cn(
                    "mb-2 rounded-control border border-dashed px-2 py-1.5 text-center text-[11px] text-text-muted transition-colors",
                    isIntoOver ? "border-accent bg-accent/10 text-text" : "border-border bg-surface-muted/30"
                  )}
                  ref={setIntoRef}
                >
                  Drop team here
                </div>
              ) : null}
              {teamCount === 0 ? (
                <div
                  className={cn(
                    "absolute inset-0 flex items-center justify-center transition-all duration-150",
                    isRowHovered ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0"
                  )}
                >
                  <button
                    aria-label={`Add team to ${node.name}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-text-muted transition-colors hover:text-text"
                    disabled={disabled}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onAddChild(node.id, "team");
                    }}
                    type="button"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Team
                  </button>
                </div>
              ) : (
                <>
                  {teamChildren}
                  {isRowHovered ? (
                    <button
                      aria-label={`Add another team to ${node.name}`}
                      className="mt-2 inline-flex w-full items-center justify-center gap-1 px-2 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:text-text"
                      disabled={disabled}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onAddChild(node.id, "team");
                      }}
                      type="button"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Team
                    </button>
                  ) : null}
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
      {branchChildren}
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
  const [isSavingProgram, startSavingProgram] = useTransition();
  const [isMutatingNodes, startMutatingNodes] = useTransition();
  const [isMutatingSchedule, startMutatingSchedule] = useTransition();
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [isDivisionCreateOpen, setIsDivisionCreateOpen] = useState(false);
  const [isNodeEditOpen, setIsNodeEditOpen] = useState(false);
  const [activeDragNodeId, setActiveDragNodeId] = useState<string | null>(null);
  const [publishToggleNodeId, setPublishToggleNodeId] = useState<string | null>(null);
  const [activeDivisionId, setActiveDivisionId] = useState<string | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [structureSearch, setStructureSearch] = useState("");
  const [structureScale, setStructureScale] = useState(1);
  const [structureZoomPercent, setStructureZoomPercent] = useState(100);
  const [isCanvasActive, setIsCanvasActive] = useState(false);
  const [nodes, setNodes] = useState(data.nodes);
  const [scheduleBlocks, setScheduleBlocks] = useState(data.scheduleBlocks);
  const [savedSlug, setSavedSlug] = useState(data.program.slug);
  const structureCanvasRef = useRef<CanvasViewportHandle | null>(null);
  const structureSearchInputRef = useRef<HTMLInputElement | null>(null);

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
  const divisionBreadcrumbsById = useMemo(() => {
    const breadcrumbs = new Map<string, string[]>();

    for (const node of nodes) {
      if (node.nodeKind !== "division") {
        continue;
      }

      const path = [node.name];
      let cursorId = node.parentId;
      while (cursorId) {
        const parent = nodeById.get(cursorId);
        if (!parent || parent.nodeKind !== "division") {
          break;
        }

        path.unshift(parent.name);
        cursorId = parent.parentId;
      }

      breadcrumbs.set(node.id, path);
    }

    return breadcrumbs;
  }, [nodeById, nodes]);
  const nodeGroups = useMemo(() => buildNodeGroups(nodes), [nodes]);
  const linkedForms = useMemo(() => initialForms.filter((form) => form.programId === data.program.id), [initialForms, data.program.id]);
  const normalizedStructureSearch = structureSearch.trim().toLowerCase();
  const matchingNodes = useMemo(() => {
    if (!normalizedStructureSearch) {
      return [];
    }

    return nodes.filter((node) => node.name.toLowerCase().includes(normalizedStructureSearch));
  }, [nodes, normalizedStructureSearch]);
  const highlightedNodeIds = useMemo(() => new Set(matchingNodes.map((node) => node.id)), [matchingNodes]);
  const editingNode = editingNodeId ? nodeById.get(editingNodeId) : null;
  const editingParentNode = editingNode?.parentId ? nodeById.get(editingNode.parentId) : null;
  const canSetEditingNodeToTeam = Boolean(editingNode && editingParentNode?.nodeKind === "division");

  useEffect(() => {
    if (!activeDivisionId) {
      return;
    }

    const activeDivision = nodeById.get(activeDivisionId);
    if (!activeDivision || activeDivision.nodeKind !== "division") {
      setActiveDivisionId(null);
    }
  }, [activeDivisionId, nodeById]);

  useEffect(() => {
    if (activeSection !== "structure" || !isCanvasActive) {
      return;
    }

    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      if (target.isContentEditable) {
        return true;
      }

      return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        setStructureSearch((current) => current.slice(0, -1));
        structureSearchInputRef.current?.focus();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setStructureSearch("");
        structureSearchInputRef.current?.focus();
        return;
      }

      if (event.key.length !== 1) {
        return;
      }

      event.preventDefault();
      setStructureSearch((current) => `${current}${event.key}`);
      structureSearchInputRef.current?.focus();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeSection, isCanvasActive]);

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

  useEffect(() => {
    if (activeSection !== "structure") {
      return;
    }

    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      if (target.isContentEditable) {
        return true;
      }

      return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((!event.metaKey && !event.ctrlKey) || event.altKey || event.shiftKey || isEditableTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "t") {
        event.preventDefault();
        if (!activeDivisionId) {
          toast({
            title: "Select a division first",
            description: "Click a division node, then use Cmd/Ctrl + T to add a team.",
            variant: "info"
          });
          return;
        }

        openNodeCreatePanel(activeDivisionId, "team");
        return;
      }

      if (key === "d") {
        event.preventDefault();
        openNodeCreatePanel(activeDivisionId, "division");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeDivisionId, activeSection, toast]);

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

  function focusNodeInCanvas(nodeId: string) {
    const node = document.querySelector(`[data-structure-node-id="${nodeId}"]`);
    if (!(node instanceof HTMLElement)) {
      return;
    }

    structureCanvasRef.current?.focusElement(node, {
      targetScale: 1.35
    });
  }

  function focusNodeFromSearch(query: string) {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return;
    }

    const exact = matchingNodes.find((node) => node.name.toLowerCase() === normalizedQuery);
    const target = exact ?? matchingNodes[0];
    if (!target) {
      return;
    }

    setFocusedNodeId(target.id);
    setStructureSearch(target.name);
    if (target.nodeKind === "division") {
      setActiveDivisionId(target.id);
    }
    focusNodeInCanvas(target.id);
  }

  function renderStructureBranch(parentId: string | null, options?: { contained?: boolean; kindFilter?: ProgramNode["nodeKind"] }): ReactNode {
    const contained = options?.contained ?? false;
    const kindFilter = options?.kindFilter;
    const allSiblings = nodeGroups.get(parentKey(parentId)) ?? [];
    const siblings = kindFilter ? allSiblings.filter((node) => node.nodeKind === kindFilter) : allSiblings;
    const activeKind = activeDragNodeId ? nodeById.get(activeDragNodeId)?.nodeKind ?? null : null;
    const showDropZone =
      Boolean(activeDragNodeId) &&
      (kindFilter ? activeKind === kindFilter : true) &&
      !(parentId === null && activeKind === "team");
    const showConnectorLine = siblings.length > 1;

    if (siblings.length === 0 && !showDropZone) {
      return null;
    }

    if (contained) {
      return (
        <div className="flex w-full flex-col gap-2">
          {siblings.length > 0 ? (
            <div className="flex w-full flex-wrap gap-2">
              <SortableContext items={siblings.map((node) => node.id)} strategy={rectSortingStrategy}>
                {siblings.map((node) => {
                  const childContained = node.nodeKind === "division";
                  return (
                    <div className={cn("flex items-stretch", node.nodeKind === "team" ? "w-full" : "w-[240px] shrink-0")} key={node.id}>
                      {(() => {
                        const childNodes = nodeGroups.get(parentKey(node.id)) ?? [];
                        const teamCount = childNodes.filter((child) => child.nodeKind === "team").length;
                        return (
                      <StructureTreeRow
                        activeNodeId={activeDragNodeId}
                        activeDragNodeKind={activeKind}
                        canvasScale={structureScale}
                        divisionBreadcrumb={node.nodeKind === "division" ? (divisionBreadcrumbsById.get(node.id) ?? [node.name]) : null}
                        disabled={isMutatingNodes}
                        isFocused={focusedNodeId === node.id}
                        isPublished={isProgramNodePublished(node)}
                        isPublishToggling={publishToggleNodeId === node.id}
                        isSearchMatch={highlightedNodeIds.has(node.id)}
                        node={node}
                        onAddChild={openNodeCreatePanel}
                        onActivateDivision={setActiveDivisionId}
                        onDelete={handleNodeDelete}
                        onEdit={openNodeEditPanel}
                        onTogglePublished={handleNodePublishToggle}
                        teamCount={teamCount}
                        teamChildren={node.nodeKind === "division" ? renderStructureBranch(node.id, { contained: true, kindFilter: "team" }) : null}
                        branchChildren={node.nodeKind === "division" ? renderStructureBranch(node.id, { kindFilter: "division" }) : null}
                      />
                        );
                      })()}
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
                const childNodes = nodeGroups.get(parentKey(node.id)) ?? [];
                const teamCount = childNodes.filter((child) => child.nodeKind === "team").length;
                return (
                  <div
                    className="relative flex shrink-0 flex-col items-stretch"
                    key={node.id}
                    style={{ width: `${DIVISION_CARD_WIDTH_PX}px` }}
                  >
                    <div className="absolute -top-4 left-1/2 h-4 w-px -translate-x-1/2 bg-border" />
                    <StructureTreeRow
                      activeNodeId={activeDragNodeId}
                      activeDragNodeKind={activeKind}
                      canvasScale={structureScale}
                      divisionBreadcrumb={node.nodeKind === "division" ? (divisionBreadcrumbsById.get(node.id) ?? [node.name]) : null}
                      disabled={isMutatingNodes}
                      isFocused={focusedNodeId === node.id}
                      isPublished={isProgramNodePublished(node)}
                      isPublishToggling={publishToggleNodeId === node.id}
                      isSearchMatch={highlightedNodeIds.has(node.id)}
                      node={node}
                      onAddChild={openNodeCreatePanel}
                      onActivateDivision={setActiveDivisionId}
                      onDelete={handleNodeDelete}
                      onEdit={openNodeEditPanel}
                      onTogglePublished={handleNodePublishToggle}
                      teamCount={teamCount}
                      teamChildren={node.nodeKind === "division" ? renderStructureBranch(node.id, { contained: true, kindFilter: "team" }) : null}
                      branchChildren={node.nodeKind === "division" ? renderStructureBranch(node.id, { kindFilter: "division" }) : null}
                    />
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
    <div className="ui-stack-page">
      {activeSection === "settings" ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Program settings</CardTitle>
                <CardDescription>Configure the core program details and publish state.</CardDescription>
              </div>
              <Button disabled={isSavingProgram} form="program-settings-form" loading={isSavingProgram} type="submit">
                {isSavingProgram ? "Saving..." : "Save program"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2" id="program-settings-form" onSubmit={handleProgramSave}>
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
              <FormField className="md:col-span-2" label="Description">
                <Textarea className="min-h-[80px]" onChange={(event) => setDescription(event.target.value)} value={description} />
              </FormField>
              <FormField className="md:col-span-2" label="Cover photo">
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
          </CardContent>
        </Card>
      ) : null}

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
            <CardContent>
              <div
                className="relative h-[68vh] min-h-[460px]"
                onPointerEnter={() => setIsCanvasActive(true)}
                onPointerLeave={() => setIsCanvasActive(false)}
              >
                {/* Canvas interaction rules: wheel pans, ctrl/cmd+wheel zooms, and holding Space forces pan mode. */}
                <CanvasViewport
                  contentClassName="min-w-max"
                  dragInProgress={Boolean(activeDragNodeId)}
                  onViewChange={(view) => {
                    setStructureScale(view.scale);
                    setStructureZoomPercent(Math.round(view.scale * 100));
                  }}
                  ref={structureCanvasRef}
                  storageKey={`program-structure-canvas:${orgSlug}:${data.program.id}`}
                >
                  <div className="flex w-full min-w-[840px] flex-col items-center gap-3">
                    <div className="w-[280px] max-w-[min(82vw,280px)] rounded-control border bg-surface px-4 py-3 text-center shadow-sm">
                      <p className="text-xs uppercase tracking-wide text-text-muted">Program</p>
                      <p className="font-semibold text-text">{name}</p>
                    </div>
                    {nodes.length === 0 ? <Alert variant="info">No structure nodes yet. Add a division to start the map.</Alert> : null}

                    {nodes.length > 0 || activeDragNodeId ? (
                      <DndContext
                        collisionDetection={closestCenter}
                        onDragCancel={() => setActiveDragNodeId(null)}
                        onDragEnd={handleNodeDragEnd}
                        onDragStart={handleNodeDragStart}
                        sensors={sensors}
                      >
                        {renderStructureBranch(null, { kindFilter: "division" })}
                      </DndContext>
                    ) : null}
                  </div>
                </CanvasViewport>

                <div className="pointer-events-none absolute left-3 top-3 z-30 w-[300px] max-w-[calc(100%-140px)]">
                  <div className="pointer-events-auto relative" data-canvas-pan-ignore="true">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                      <Input
                        className="pl-9"
                        onChange={(event) => setStructureSearch(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") {
                            return;
                          }

                          event.preventDefault();
                          focusNodeFromSearch(event.currentTarget.value);
                          setStructureSearch("");
                        }}
                        placeholder="Search divisions"
                        ref={structureSearchInputRef}
                        value={structureSearch}
                      />
                    </div>
                    {normalizedStructureSearch ? (
                      <div className="mt-1 max-h-44 overflow-y-auto rounded-control border bg-surface p-1 shadow-sm">
                        <p className="px-2 py-1 text-[11px] text-text-muted">Press Enter to jump to the best match</p>
                        {matchingNodes.length === 0 ? <p className="px-2 py-1 text-xs text-text-muted">No matches</p> : null}
                        {matchingNodes.slice(0, 12).map((node) => (
                          <button
                            className="flex w-full items-center justify-between rounded-control px-2 py-1 text-left text-xs text-text hover:bg-surface-muted"
                            key={node.id}
                            onClick={() => {
                              focusNodeFromSearch(node.name);
                            }}
                            type="button"
                          >
                            <span className="truncate" title={node.name}>
                              {node.name}
                            </span>
                            <span className="ml-2 shrink-0 text-text-muted">{node.nodeKind}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="pointer-events-none absolute right-3 top-3 z-30">
                  <div className="pointer-events-auto flex items-center gap-2 rounded-control border bg-surface/95 p-2 shadow-sm" data-canvas-pan-ignore="true">
                    <Button
                      aria-label="Add division"
                      disabled={isMutatingNodes}
                      onClick={() => openNodeCreatePanel(null, "division")}
                      size="sm"
                      type="button"
                      variant="primary"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button onClick={() => structureCanvasRef.current?.zoomOut()} size="sm" type="button" variant="secondary">
                      <ZoomOut className="h-3.5 w-3.5" />
                    </Button>
                    <Button onClick={() => structureCanvasRef.current?.zoomIn()} size="sm" type="button" variant="secondary">
                      <ZoomIn className="h-3.5 w-3.5" />
                    </Button>
                    <Button onClick={() => structureCanvasRef.current?.fitToView()} size="sm" type="button" variant="secondary">
                      Reset
                    </Button>
                    <Chip size="small">{structureZoomPercent}%</Chip>
                  </div>
                </div>
              </div>
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
          <FormField label="Name">
            <Input onChange={(event) => setEditingNodeName(event.target.value)} required value={editingNodeName} />
          </FormField>
          <FormField hint="Optional, auto-generated if blank." label="Slug">
            <Input onChange={(event) => setEditingNodeSlug(slugify(event.target.value))} value={editingNodeSlug} />
          </FormField>
          
          <FormField hint="Optional" label="Capacity">
            <Input onChange={(event) => setEditingCapacity(event.target.value)} type="number" value={editingCapacity} />
          </FormField>
          <label className="ui-inline-toggle">
            <Checkbox checked={editingWaitlistEnabled} onChange={(event) => setEditingWaitlistEnabled(event.target.checked)} />
            Waitlist enabled
          </label>
          <label className="ui-inline-toggle">
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
        title="Add Element"
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
          <label className="ui-inline-toggle">
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
