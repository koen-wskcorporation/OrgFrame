"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from "react";
import { AlertTriangle, Eye, EyeOff, Plus, Save, Trash2 } from "lucide-react";
import { StructureCanvas } from "@orgframe/ui/modules/core/components/StructureCanvas";
import { StructureNode } from "@orgframe/ui/modules/core/components/StructureNode";
import { Button } from "@orgframe/ui/ui/button";
import { Checkbox } from "@orgframe/ui/ui/checkbox";
import { FormField } from "@orgframe/ui/ui/form-field";
import { Input } from "@orgframe/ui/ui/input";
import { Panel } from "@orgframe/ui/ui/panel";
import { Popup } from "@orgframe/ui/ui/popup";
import { Select } from "@orgframe/ui/ui/select";
import { useToast } from "@orgframe/ui/ui/toast";
import type { CanvasViewportHandle } from "@orgframe/ui/ui/canvas-viewport";
import type { OrgManagePage, OrgSiteStructureNode, ResolvedOrgSiteStructureNode } from "@/modules/site-builder/types";

type SiteStructureSaveAction =
  | {
      type: "create-node";
      parentId?: string | null;
      label: string;
      nodeKind: "static_page" | "static_link" | "dynamic_page" | "dynamic_link";
      pageSlug?: string | null;
      externalUrl?: string | null;
      sourceType?: "none" | "programs_tree" | "published_forms" | "published_events";
      pageLifecycle?: "permanent" | "temporary";
      temporaryWindowStartUtc?: string | null;
      temporaryWindowEndUtc?: string | null;
      isClickable?: boolean;
      isVisible?: boolean;
      childBehavior?: "manual" | "generated_locked" | "generated_with_manual_overrides";
      routeBehaviorJson?: Record<string, unknown>;
      generationRulesJson?: Record<string, unknown>;
      labelBehavior?: "manual" | "source_name";
    }
  | {
      type: "update-node";
      nodeId: string;
      label?: string;
      nodeKind?: "static_page" | "static_link" | "dynamic_page" | "dynamic_link";
      pageSlug?: string | null;
      externalUrl?: string | null;
      sourceType?: "none" | "programs_tree" | "published_forms" | "published_events";
      pageLifecycle?: "permanent" | "temporary";
      temporaryWindowStartUtc?: string | null;
      temporaryWindowEndUtc?: string | null;
      isClickable?: boolean;
      isVisible?: boolean;
      childBehavior?: "manual" | "generated_locked" | "generated_with_manual_overrides";
      parentId?: string | null;
      routeBehaviorJson?: Record<string, unknown>;
      generationRulesJson?: Record<string, unknown>;
      labelBehavior?: "manual" | "source_name";
    }
  | {
      type: "delete-node";
      nodeId: string;
    }
  | {
      type: "update-page-lifecycle";
      pageId: string;
      pageLifecycle: "permanent" | "temporary";
      temporaryWindowStartUtc?: string | null;
      temporaryWindowEndUtc?: string | null;
    }
  | {
      type: "reorder";
      items: Array<{ id: string; parentId: string | null; sortIndex: number }>;
    };

type SiteStructureEditorPopupProps = {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  pages: OrgManagePage[];
  nodes: OrgSiteStructureNode[];
  resolved: ResolvedOrgSiteStructureNode[];
  onSave: (action: SiteStructureSaveAction) => Promise<void>;
  onOpenPageEditor: (pageSlug: string) => void;
};

type NodeDraft = {
  label: string;
  nodeKind: "static_page" | "static_link" | "dynamic_page" | "dynamic_link";
  pageSlug: string;
  externalUrl: string;
  sourceType: "none" | "programs_tree" | "published_forms" | "published_events";
  pageLifecycle: "permanent" | "temporary";
  temporaryWindowStartUtc: string;
  temporaryWindowEndUtc: string;
  isClickable: boolean;
  isVisible: boolean;
  childBehavior: "manual" | "generated_locked" | "generated_with_manual_overrides";
  labelBehavior: "manual" | "source_name";
  fallbackBehavior: "show_empty" | "hide_root";
  exposeNestedLevels: boolean;
  emptyStateLabel: string;
  routeBasePath: string;
};

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return "";
  }

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function toUtcIso(value: string) {
  if (!value.trim()) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return null;
  }
  return date.toISOString();
}

function buildDraft(node: OrgSiteStructureNode | null): NodeDraft {
  if (!node) {
    return {
      label: "",
      nodeKind: "static_page",
      pageSlug: "home",
      externalUrl: "",
      sourceType: "none",
      pageLifecycle: "permanent",
      temporaryWindowStartUtc: "",
      temporaryWindowEndUtc: "",
      isClickable: true,
      isVisible: true,
      childBehavior: "manual"
      ,
      labelBehavior: "manual",
      fallbackBehavior: "show_empty",
      exposeNestedLevels: true,
      emptyStateLabel: "",
      routeBasePath: ""
    };
  }

  return {
    label: node.label,
    nodeKind: node.nodeKind === "system_generated" ? "static_page" : node.nodeKind,
    pageSlug: node.pageSlug ?? "",
    externalUrl: node.externalUrl ?? "",
    sourceType: node.sourceType,
    pageLifecycle: node.pageLifecycle,
    temporaryWindowStartUtc: toDateTimeLocal(node.temporaryWindowStartUtc),
    temporaryWindowEndUtc: toDateTimeLocal(node.temporaryWindowEndUtc),
    isClickable: node.isClickable,
    isVisible: node.isVisible,
    childBehavior: node.childBehavior,
    labelBehavior: node.labelBehavior,
    fallbackBehavior: node.generationRulesJson.fallbackBehavior === "hide_root" ? "hide_root" : "show_empty",
    exposeNestedLevels: node.generationRulesJson.exposeNestedLevels !== false,
    emptyStateLabel: typeof node.generationRulesJson.emptyStateLabel === "string" ? node.generationRulesJson.emptyStateLabel : "",
    routeBasePath: typeof node.routeBehaviorJson.basePath === "string" ? node.routeBehaviorJson.basePath : ""
  };
}

function flattenResolved(nodes: ResolvedOrgSiteStructureNode[], depth = 0): Array<{ node: ResolvedOrgSiteStructureNode; depth: number }> {
  const rows: Array<{ node: ResolvedOrgSiteStructureNode; depth: number }> = [];
  for (const node of nodes) {
    rows.push({ node, depth });
    rows.push(...flattenResolved(node.children, depth + 1));
  }
  return rows;
}

export function SiteStructureEditorPopup({ open, onClose, orgSlug, pages, nodes, resolved, onSave, onOpenPageEditor }: SiteStructureEditorPopupProps) {
  const { toast } = useToast();
  const canvasRef = useRef<CanvasViewportHandle | null>(null);
  const [search, setSearch] = useState("");
  const [zoomPercent, setZoomPercent] = useState(100);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<NodeDraft>(() => buildDraft(null));
  const [panelMode, setPanelMode] = useState<"none" | "create" | "edit">("none");
  const [createStep, setCreateStep] = useState<"type" | "details">("type");
  const [dragState, setDragState] = useState<{
    nodeId: string;
    startX: number;
    startY: number;
    deltaX: number;
    deltaY: number;
  } | null>(null);
  const [isSaving, startSaving] = useTransition();

  const rows = useMemo(() => flattenResolved(resolved), [resolved]);
  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedId) ?? null, [nodes, selectedId]);
  const selectedResolved = useMemo(() => rows.find((row) => row.node.id === selectedId)?.node ?? null, [rows, selectedId]);

  const selectedPage = useMemo(() => {
    if (selectedNode?.pageSlug) {
      return pages.find((page) => page.slug === selectedNode.pageSlug) ?? null;
    }
    return null;
  }, [pages, selectedNode?.pageSlug]);

  const pageOptions = useMemo(
    () => pages.map((page) => ({ value: page.slug, label: `${page.title} (${page.slug === "home" ? "/" : `/${page.slug}`})` })),
    [pages]
  );

  const resolvedSearchRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return rows;
    }

    return rows.filter((row) => row.node.label.toLowerCase().includes(query));
  }, [rows, search]);
  const isEditingDynamicNode = panelMode === "edit" && (selectedNode?.nodeKind === "dynamic_page" || selectedNode?.nodeKind === "dynamic_link");

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      setDragState((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          deltaX: event.clientX - current.startX,
          deltaY: event.clientY - current.startY
        };
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      const targetEl = (event.target as HTMLElement | null)?.closest?.("[data-structure-node-id]") as HTMLElement | null;
      const targetId = targetEl?.dataset.structureNodeId ?? null;
      if (targetId && targetId !== dragState.nodeId) {
        reorderSiblingNodes(dragState.nodeId, targetId);
      }
      setDragState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragState]);

  function handleSelect(nodeId: string) {
    setSelectedId(nodeId);
    const full = nodes.find((node) => node.id === nodeId) ?? null;
    if (!full) {
      setPanelMode("none");
      return;
    }
    setDraft(buildDraft(full));
    setPanelMode("edit");
    setCreateStep("details");
  }

  function handleStartCreate() {
    const parentNode = selectedNode;
    setDraft(
      parentNode
        ? {
            ...buildDraft(null),
            pageLifecycle: parentNode.pageLifecycle,
            isVisible: parentNode.isVisible
          }
        : buildDraft(null)
    );
    setPanelMode("create");
    setCreateStep("type");
  }

  function handleCreate() {
    startSaving(async () => {
      const label = draft.label.trim();
      if (!label) {
        toast({ title: "Label required", description: "Add a label for this node.", variant: "destructive" });
        return;
      }

      await onSave({
        type: "create-node",
        parentId: selectedNode?.id ?? null,
        label,
        nodeKind: draft.nodeKind,
        pageSlug: draft.nodeKind === "static_page" ? draft.pageSlug || "home" : null,
        externalUrl: draft.nodeKind === "static_link" ? draft.externalUrl || null : null,
        sourceType: draft.nodeKind.startsWith("dynamic") ? draft.sourceType : "none",
        pageLifecycle: draft.pageLifecycle,
        temporaryWindowStartUtc: toUtcIso(draft.temporaryWindowStartUtc),
        temporaryWindowEndUtc: toUtcIso(draft.temporaryWindowEndUtc),
        isClickable: draft.isClickable,
        isVisible: draft.isVisible,
        childBehavior: draft.nodeKind.startsWith("dynamic") ? draft.childBehavior : "manual",
        labelBehavior: draft.nodeKind.startsWith("dynamic") ? draft.labelBehavior : "manual",
        routeBehaviorJson: draft.nodeKind.startsWith("dynamic") ? { basePath: draft.routeBasePath.trim() || null } : {},
        generationRulesJson: draft.nodeKind.startsWith("dynamic")
          ? {
              fallbackBehavior: draft.fallbackBehavior,
              exposeNestedLevels: draft.exposeNestedLevels,
              emptyStateLabel: draft.emptyStateLabel.trim() || null
            }
          : {}
      });
      setPanelMode("none");
      setSelectedId(null);
      setDraft(buildDraft(null));
    });
  }

  function handleUpdate() {
    if (!selectedNode) {
      return;
    }

    startSaving(async () => {
      await onSave({
        type: "update-node",
        nodeId: selectedNode.id,
        label: draft.label.trim(),
        nodeKind: draft.nodeKind,
        pageSlug: draft.nodeKind === "static_page" ? draft.pageSlug || "home" : null,
        externalUrl: draft.nodeKind === "static_link" ? draft.externalUrl || null : null,
        sourceType: draft.nodeKind.startsWith("dynamic") ? draft.sourceType : "none",
        pageLifecycle: draft.pageLifecycle,
        temporaryWindowStartUtc: toUtcIso(draft.temporaryWindowStartUtc),
        temporaryWindowEndUtc: toUtcIso(draft.temporaryWindowEndUtc),
        isClickable: draft.isClickable,
        isVisible: draft.isVisible,
        childBehavior: draft.nodeKind.startsWith("dynamic") ? draft.childBehavior : "manual",
        labelBehavior: draft.nodeKind.startsWith("dynamic") ? draft.labelBehavior : "manual",
        routeBehaviorJson: draft.nodeKind.startsWith("dynamic") ? { basePath: draft.routeBasePath.trim() || null } : {},
        generationRulesJson: draft.nodeKind.startsWith("dynamic")
          ? {
              fallbackBehavior: draft.fallbackBehavior,
              exposeNestedLevels: draft.exposeNestedLevels,
              emptyStateLabel: draft.emptyStateLabel.trim() || null
            }
          : {}
      });
    });
  }

  function handleDelete() {
    if (!selectedNode) {
      return;
    }

    startSaving(async () => {
      await onSave({ type: "delete-node", nodeId: selectedNode.id });
      setSelectedId(null);
      setDraft(buildDraft(null));
      setPanelMode("none");
    });
  }

  function savePageLifecycle() {
    if (!selectedPage) {
      return;
    }

    startSaving(async () => {
      await onSave({
        type: "update-page-lifecycle",
        pageId: selectedPage.id,
        pageLifecycle: draft.pageLifecycle,
        temporaryWindowStartUtc: toUtcIso(draft.temporaryWindowStartUtc),
        temporaryWindowEndUtc: toUtcIso(draft.temporaryWindowEndUtc)
      });
    });
  }

  function moveSelected(direction: -1 | 1) {
    if (!selectedNode) {
      return;
    }

    const siblings = nodes.filter((node) => node.parentId === selectedNode.parentId).sort((a, b) => a.sortIndex - b.sortIndex);
    const index = siblings.findIndex((node) => node.id === selectedNode.id);
    if (index < 0) {
      return;
    }

    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= siblings.length) {
      return;
    }

    const next = [...siblings];
    const current = next[index];
    const target = next[nextIndex];
    if (!current || !target) {
      return;
    }
    next[index] = target;
    next[nextIndex] = current;

    const orderedIds = new Map(next.map((node, orderIndex) => [node.id, orderIndex]));
    const items = nodes.map((node) => ({
      id: node.id,
      parentId: node.parentId,
      sortIndex: orderedIds.get(node.id) ?? node.sortIndex
    }));

    startSaving(async () => {
      await onSave({
        type: "reorder",
        items
      });
    });
  }

  function reorderSiblingNodes(activeId: string, targetId: string) {
    const activeNode = nodes.find((node) => node.id === activeId);
    const targetNode = nodes.find((node) => node.id === targetId);
    if (!activeNode || !targetNode || activeNode.id === targetNode.id) {
      return;
    }
    if (activeNode.parentId !== targetNode.parentId) {
      return;
    }

    const siblings = nodes
      .filter((node) => node.parentId === activeNode.parentId)
      .sort((a, b) => a.sortIndex - b.sortIndex)
      .map((node) => node.id);
    const activeIndex = siblings.indexOf(activeNode.id);
    const targetIndex = siblings.indexOf(targetNode.id);
    if (activeIndex < 0 || targetIndex < 0) {
      return;
    }

    const nextIds = [...siblings];
    nextIds.splice(activeIndex, 1);
    nextIds.splice(targetIndex, 0, activeNode.id);

    const nextSortById = new Map(nextIds.map((id, index) => [id, index]));
    const items = nodes.map((node) => ({
      id: node.id,
      parentId: node.parentId,
      sortIndex: nextSortById.get(node.id) ?? node.sortIndex
    }));

    startSaving(async () => {
      await onSave({
        type: "reorder",
        items
      });
    });
  }

  function chooseCreateType(type: "page" | "dropdown" | "dynamic") {
    if (type === "page") {
      setDraft((current) => ({
        ...current,
        nodeKind: "static_page",
        pageSlug: current.pageSlug || "home",
        externalUrl: "",
        sourceType: "none",
        childBehavior: "manual",
        isClickable: true
      }));
      setCreateStep("details");
      return;
    }

    if (type === "dropdown") {
      setDraft((current) => ({
        ...current,
        nodeKind: "static_link",
        externalUrl: "",
        sourceType: "none",
        childBehavior: "manual",
        isClickable: false
      }));
      setCreateStep("details");
      return;
    }

    setDraft((current) => ({
      ...current,
      nodeKind: "dynamic_link",
      sourceType: current.sourceType === "none" ? "programs_tree" : current.sourceType,
      childBehavior: "generated_locked",
      isClickable: true
    }));
    setCreateStep("details");
  }

  function openEditNode(nodeId: string) {
    const node = nodes.find((entry) => entry.id === nodeId);
    if (!node || node.nodeKind === "system_generated") {
      return;
    }
    setSelectedId(node.id);
    setDraft(buildDraft(node));
    setPanelMode("edit");
    setCreateStep("details");
  }

  function duplicateNode(nodeId: string) {
    const source = nodes.find((entry) => entry.id === nodeId);
    if (!source || source.nodeKind === "system_generated") {
      return;
    }

    startSaving(async () => {
      await onSave({
        type: "create-node",
        parentId: source.parentId,
        label: `${source.label} Copy`,
        nodeKind: source.nodeKind === "system_generated" ? "static_page" : source.nodeKind,
        pageSlug: source.pageSlug,
        externalUrl: source.externalUrl,
        sourceType: source.sourceType,
        pageLifecycle: source.pageLifecycle,
        temporaryWindowStartUtc: source.temporaryWindowStartUtc,
        temporaryWindowEndUtc: source.temporaryWindowEndUtc,
        isClickable: source.isClickable,
        isVisible: source.isVisible,
        childBehavior: source.childBehavior,
        labelBehavior: source.labelBehavior,
        routeBehaviorJson: source.routeBehaviorJson,
        generationRulesJson: source.generationRulesJson
      });
    });
  }

  function deleteNode(nodeId: string) {
    const source = nodes.find((entry) => entry.id === nodeId);
    if (!source || source.nodeKind === "system_generated") {
      return;
    }

    startSaving(async () => {
      await onSave({
        type: "delete-node",
        nodeId
      });
      if (selectedId === nodeId) {
        setSelectedId(null);
        setPanelMode("none");
      }
    });
  }

  const disableEditFields = panelMode === "edit" && !selectedNode;
  const disableDynamicOptions = isEditingDynamicNode;

  return (
    <Popup
      closeOnBackdrop={false}
      contentClassName="overflow-hidden p-0"
      onClose={onClose}
      open={open}
      popupClassName="bg-surface"
      size="full"
      subtitle="Build static and dynamic public navigation using the same canvas interaction model used elsewhere in the app."
      title="Site Structure"
    >
      <div
        className="grid h-full w-full items-stretch transition-[grid-template-columns,column-gap] duration-200 ease-out motion-reduce:transition-none"
        data-popup-editor-root="true"
        style={{
          gridTemplateColumns: "minmax(0, 1fr) var(--popup-panel-active-width, 0px)",
          columnGap: "var(--popup-panel-gap, 0px)"
        }}
      >
        <div className="min-w-0 overflow-hidden bg-surface">
          <StructureCanvas
            addButtonAriaLabel="Add site node"
            addButtonDisabled={isSaving}
            autoFitOnOpen
            canvasContentClassName="p-0"
            canvasGridColor="hsl(var(--border) / 0.55)"
            canvasGridSize={25}
            canvasLayoutMode="free"
            canvasRef={canvasRef}
            dragInProgress={Boolean(dragState)}
            embeddedEditMode
            editContent={
              <div className="relative min-h-[900px] min-w-[1200px] p-6">
                {resolvedSearchRows.map(({ node, depth }, index) => {
                  const isGenerated = node.isGenerated || node.nodeKind === "system_generated";
                  const canDrag = !isGenerated;
                  const x = 50 + depth * 25;
                  const y = 50 + index * 107;
                  const isDragging = dragState?.nodeId === node.id;
                  return (
                    <div
                      className="absolute"
                      key={node.id}
                      style={{
                        left: `${x}px`,
                        top: `${y}px`,
                        width: "460px",
                        height: "82px",
                        zIndex: isDragging ? 30 : 1,
                        transform: isDragging ? `translate(${dragState?.deltaX ?? 0}px, ${dragState?.deltaY ?? 0}px)` : undefined
                      }}
                    >
                      <StructureNode
                        chips={
                          <>
                            <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                              {node.nodeKind.replace("_", " ")}
                            </span>
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${node.isVisible ? "text-emerald-700 border-emerald-300" : "text-text-muted"}`}>
                              {node.isVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                              {node.isVisible ? "Visible" : "Hidden"}
                            </span>
                            {node.pageLifecycle === "temporary" ? <span className="inline-flex rounded-full border border-yellow-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-yellow-700">Temp</span> : null}
                          </>
                        }
                        className={`h-full w-full ${selectedId === node.id ? "border-accent bg-accent/10" : ""}`}
                        forceSingleLine
                        draggable={canDrag}
                        dragHandleProps={
                          canDrag
                            ? {
                                listeners: {
                                  onPointerDown: (event: ReactPointerEvent) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setDragState({
                                      nodeId: node.id,
                                      startX: event.clientX,
                                      startY: event.clientY,
                                      deltaX: 0,
                                      deltaY: 0
                                    });
                                  }
                                } as Record<string, unknown>
                              }
                            : undefined
                        }
                        movementLocked={!canDrag || isGenerated}
                        nodeId={node.id}
                        onClick={() => handleSelect(node.id)}
                        onDoubleClick={() => openEditNode(node.id)}
                        quickActions={
                          isGenerated
                            ? undefined
                            : {
                                onEdit: () => openEditNode(node.id),
                                onDuplicate: () => duplicateNode(node.id),
                                onDelete: () => deleteNode(node.id),
                                canEdit: true,
                                canDuplicate: true,
                                canDelete: true
                              }
                        }
                        structural={isGenerated}
                        subtitle={isGenerated ? "System generated" : "Editable node"}
                        title={node.label}
                      />
                    </div>
                  );
                })}
              </div>
            }
            onAdd={handleStartCreate}
            onEditOpenChange={() => {
              // Popup is already open; no-op.
            }}
            onSearchQueryChange={setSearch}
            onSearchSubmit={() => {
              // Canvas search is list-based in this editor.
            }}
            onViewScaleChange={(scale) => setZoomPercent(Math.round(scale * 100))}
            rootHeader={
              <div className="w-[280px] rounded-control border bg-surface px-4 py-3 text-center shadow-sm">
                <p className="text-xs uppercase tracking-wide text-text-muted">Public Site</p>
                <p className="font-semibold text-text">/{orgSlug}</p>
              </div>
            }
            searchPlaceholder="Search structure nodes"
            searchQuery={search}
            searchResults={resolvedSearchRows.map(({ node }) => ({ id: node.id, name: node.label, kindLabel: node.nodeKind }))}
            storageKey={`site-structure-canvas:${orgSlug}`}
            viewContentInteractive
            viewEditButtonPlacement="top-right"
            viewViewportInteractive
            zoomPercent={zoomPercent}
          />
        </div>
        <div className="relative h-full" data-panel-context="popup" id="popup-panel-dock" />
      </div>

      <Panel
        onClose={() => {
          setPanelMode("none");
          if (panelMode === "create") {
            setDraft(buildDraft(null));
            setCreateStep("type");
          }
        }}
        open={panelMode !== "none"}
        subtitle={panelMode === "create" ? "Create a new site structure node." : "Edit the selected site structure node."}
        title={panelMode === "create" ? "Create node" : "Edit node"}
      >
        <div className="space-y-3">
          {selectedResolved && !selectedNode ? (
            <div className="space-y-2 rounded-control border bg-surface-muted/50 p-3">
              <p className="text-sm font-semibold text-text">Generated node</p>
              <p className="text-xs text-text-muted">{selectedResolved.reasonDisabled ?? "This node is generated from live data and cannot be edited directly."}</p>
            </div>
          ) : null}

          {panelMode === "create" && createStep === "type" ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-text">Step 1: Choose node type</p>
              <div className="grid gap-2">
                <button
                  className={`rounded-control border px-3 py-3 text-left ${draft.nodeKind === "static_page" ? "border-accent bg-accent/10" : "bg-surface"}`}
                  onClick={() => chooseCreateType("page")}
                  type="button"
                >
                  <p className="text-sm font-semibold text-text">Page</p>
                  <p className="text-xs text-text-muted">A normal page node with editable content blocks.</p>
                </button>
                <button
                  className={`rounded-control border px-3 py-3 text-left ${draft.nodeKind === "static_link" && !draft.externalUrl ? "border-accent bg-accent/10" : "bg-surface"}`}
                  onClick={() => chooseCreateType("dropdown")}
                  type="button"
                >
                  <p className="text-sm font-semibold text-text">Dropdown</p>
                  <p className="text-xs text-text-muted">A grouping container for child nodes in navigation.</p>
                </button>
                <button
                  className={`rounded-control border px-3 py-3 text-left ${draft.nodeKind.startsWith("dynamic") ? "border-accent bg-accent/10" : "bg-surface"}`}
                  onClick={() => chooseCreateType("dynamic")}
                  type="button"
                >
                  <p className="text-sm font-semibold text-text">Dynamic</p>
                  <p className="text-xs text-text-muted">System-generated structure from programs, forms, or events.</p>
                </button>
              </div>

              {draft.nodeKind.startsWith("dynamic") ? (
                <FormField label="Dynamic source">
                  <Select
                    onChange={(event) => setDraft((current) => ({ ...current, sourceType: event.target.value as NodeDraft["sourceType"] }))}
                    options={[
                      { value: "programs_tree", label: "Programs hierarchy" },
                      { value: "published_forms", label: "Published forms" },
                      { value: "published_events", label: "Published events" }
                    ]}
                    value={draft.sourceType === "none" ? "programs_tree" : draft.sourceType}
                  />
                </FormField>
              ) : null}

              <div className="flex justify-end border-t pt-3">
                <Button onClick={() => setCreateStep("details")} size="sm" type="button">
                  Continue
                </Button>
              </div>
            </div>
          ) : null}

          {!(panelMode === "create" && createStep === "type") ? (
            <>

          <FormField label="Label">
            <Input disabled={disableEditFields} onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} value={draft.label} />
          </FormField>

          <FormField label="Node type">
            <Select
              disabled={disableEditFields || panelMode === "edit"}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  nodeKind: event.target.value as NodeDraft["nodeKind"],
                  childBehavior: event.target.value.startsWith("dynamic") ? "generated_locked" : "manual"
                }))
              }
              options={[
                { value: "static_page", label: "Static page" },
                { value: "static_link", label: "Static link" },
                { value: "dynamic_page", label: "Dynamic page" },
                { value: "dynamic_link", label: "Dynamic link" }
              ]}
              value={draft.nodeKind}
            />
          </FormField>

          {draft.nodeKind === "static_page" ? (
            <>
              <FormField label="Page">
                <Select disabled={disableEditFields} onChange={(event) => setDraft((current) => ({ ...current, pageSlug: event.target.value }))} options={pageOptions} value={draft.pageSlug} />
              </FormField>
              <FormField label="Page lifecycle">
                <Select
                  disabled={disableEditFields}
                  onChange={(event) => setDraft((current) => ({ ...current, pageLifecycle: event.target.value as NodeDraft["pageLifecycle"] }))}
                  options={[
                    { value: "permanent", label: "Permanent" },
                    { value: "temporary", label: "Temporary" }
                  ]}
                  value={draft.pageLifecycle}
                />
              </FormField>
            </>
          ) : null}

          {draft.pageLifecycle === "temporary" ? (
            <>
              <FormField label="Visible from">
                <Input
                  disabled={disableEditFields}
                  onChange={(event) => setDraft((current) => ({ ...current, temporaryWindowStartUtc: event.target.value }))}
                  type="datetime-local"
                  value={draft.temporaryWindowStartUtc}
                />
              </FormField>
              <FormField label="Visible until">
                <Input
                  disabled={disableEditFields}
                  onChange={(event) => setDraft((current) => ({ ...current, temporaryWindowEndUtc: event.target.value }))}
                  type="datetime-local"
                  value={draft.temporaryWindowEndUtc}
                />
              </FormField>
            </>
          ) : null}

          {draft.nodeKind === "static_link" ? (
            <FormField label="URL">
              <Input disabled={disableEditFields} onChange={(event) => setDraft((current) => ({ ...current, externalUrl: event.target.value }))} value={draft.externalUrl} />
            </FormField>
          ) : null}

          {draft.nodeKind.startsWith("dynamic") ? (
            <>
              {isEditingDynamicNode ? (
                <div className="rounded-control border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Dynamic configuration is locked after creation. You can still adjust label and visibility.
                </div>
              ) : null}
              <FormField label="Dynamic source">
                <Select
                  disabled={disableEditFields || disableDynamicOptions}
                  onChange={(event) => setDraft((current) => ({ ...current, sourceType: event.target.value as NodeDraft["sourceType"] }))}
                  options={[
                    { value: "programs_tree", label: "Programs hierarchy" },
                    { value: "published_forms", label: "Published forms" },
                    { value: "published_events", label: "Published events" }
                  ]}
                  value={draft.sourceType === "none" ? "programs_tree" : draft.sourceType}
                />
              </FormField>
              <FormField label="Child behavior">
                <Select
                  disabled={disableEditFields || disableDynamicOptions}
                  onChange={(event) => setDraft((current) => ({ ...current, childBehavior: event.target.value as NodeDraft["childBehavior"] }))}
                  options={[
                    { value: "generated_locked", label: "Generated (locked)" },
                    { value: "generated_with_manual_overrides", label: "Generated with manual overrides" }
                  ]}
                  value={draft.childBehavior === "manual" ? "generated_locked" : draft.childBehavior}
                />
              </FormField>
              <FormField label="Label behavior">
                <Select
                  disabled={disableEditFields || disableDynamicOptions}
                  onChange={(event) => setDraft((current) => ({ ...current, labelBehavior: event.target.value as NodeDraft["labelBehavior"] }))}
                  options={[
                    { value: "manual", label: "Manual label" },
                    { value: "source_name", label: "Source-driven labels" }
                  ]}
                  value={draft.labelBehavior}
                />
              </FormField>
              <FormField label="Route base (optional)">
                <Input
                  disabled={disableEditFields || disableDynamicOptions}
                  onChange={(event) => setDraft((current) => ({ ...current, routeBasePath: event.target.value }))}
                  placeholder="/programs"
                  value={draft.routeBasePath}
                />
              </FormField>
              <FormField label="Fallback when source is empty">
                <Select
                  disabled={disableEditFields || disableDynamicOptions}
                  onChange={(event) => setDraft((current) => ({ ...current, fallbackBehavior: event.target.value as NodeDraft["fallbackBehavior"] }))}
                  options={[
                    { value: "show_empty", label: "Show root with empty state" },
                    { value: "hide_root", label: "Hide this node" }
                  ]}
                  value={draft.fallbackBehavior}
                />
              </FormField>
              <label className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-sm">
                <Checkbox
                  checked={draft.exposeNestedLevels}
                  disabled={disableDynamicOptions || draft.sourceType !== "programs_tree"}
                  onChange={(event) => setDraft((current) => ({ ...current, exposeNestedLevels: event.target.checked }))}
                />
                Expose nested generated levels
              </label>
              <FormField label="Empty state label">
                <Input
                  disabled={disableDynamicOptions || draft.fallbackBehavior !== "show_empty"}
                  onChange={(event) => setDraft((current) => ({ ...current, emptyStateLabel: event.target.value }))}
                  placeholder="No published items"
                  value={draft.emptyStateLabel}
                />
              </FormField>
            </>
          ) : null}

          <label className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-sm">
            <Checkbox checked={draft.isVisible} disabled={disableEditFields} onChange={(event) => setDraft((current) => ({ ...current, isVisible: event.target.checked }))} />
            Visible in navigation
          </label>
          <label className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-sm">
            <Checkbox
              checked={draft.isClickable}
              disabled={disableEditFields}
              onChange={(event) => setDraft((current) => ({ ...current, isClickable: event.target.checked }))}
            />
            Clickable node
          </label>

          {selectedPage ? (
            <div className="space-y-2 rounded-control border bg-surface-muted/50 p-3">
              <p className="text-sm font-semibold text-text">Page quick actions</p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => onOpenPageEditor(selectedPage.slug)} size="sm" type="button" variant="secondary">
                  Open page editor
                </Button>
                <Button disabled={isSaving} onClick={savePageLifecycle} size="sm" type="button" variant="ghost">
                  <Save className="h-4 w-4" />
                  Save lifecycle
                </Button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 border-t pt-3">
            {panelMode === "create" ? (
              <>
                <Button onClick={() => setCreateStep("type")} size="sm" type="button" variant="ghost">
                  Back
                </Button>
                <Button disabled={isSaving} onClick={handleCreate} size="sm" type="button">
                  <Plus className="h-4 w-4" />
                  Create node
                </Button>
              </>
            ) : (
              <>
                <Button disabled={!selectedNode || isSaving} onClick={handleUpdate} size="sm" type="button">
                  <Save className="h-4 w-4" />
                  Save node
                </Button>
                <Button disabled={!selectedNode || isSaving} onClick={() => moveSelected(-1)} size="sm" type="button" variant="ghost">
                  Move up
                </Button>
                <Button disabled={!selectedNode || isSaving} onClick={() => moveSelected(1)} size="sm" type="button" variant="ghost">
                  Move down
                </Button>
                <Button disabled={!selectedNode || isSaving} onClick={handleDelete} size="sm" type="button" variant="ghost">
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </>
            )}
          </div>

          <div className="rounded-control border border-yellow-500/40 bg-yellow-50 p-3 text-xs text-yellow-900">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              Dynamic hierarchy rules
            </div>
            <p className="mt-1">Generated descendants are system-driven and cannot be manually edited item-by-item when child behavior is locked.</p>
          </div>
            </>
          ) : null}
        </div>
      </Panel>
    </Popup>
  );
}
