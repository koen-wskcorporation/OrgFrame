"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Checkbox } from "@orgframe/ui/primitives/checkbox";
import { cn } from "@orgframe/ui/primitives/utils";
import type { CalendarSource } from "@/src/features/calendar/types";

type SourceNode = {
  source: CalendarSource;
  children: SourceNode[];
};

function buildSourceTree(sources: CalendarSource[]): SourceNode[] {
  const byId = new Map<string, SourceNode>();
  const roots: SourceNode[] = [];

  for (const source of sources) {
    byId.set(source.id, { source, children: [] });
  }

  for (const source of sources) {
    const node = byId.get(source.id);
    if (!node) {
      continue;
    }
    if (source.parentSourceId) {
      const parent = byId.get(source.parentSourceId);
      if (parent) {
        parent.children.push(node);
        continue;
      }
    }
    roots.push(node);
  }

  const sourceSortRank = (source: CalendarSource) => {
    const kind = typeof source.displayJson.kind === "string" ? source.displayJson.kind : "";
    if (kind === "group_programs") {
      return 0;
    }
    if (kind === "group_org") {
      return 1;
    }
    if (source.scopeType === "program") {
      return 2;
    }
    if (source.scopeType === "division") {
      return 3;
    }
    if (source.scopeType === "team") {
      return 4;
    }
    if (source.scopeType === "organization") {
      return 5;
    }
    return 6;
  };

  const sortNodes = (nodes: SourceNode[]) => {
    nodes.sort((left, right) => {
      const rankDiff = sourceSortRank(left.source) - sourceSortRank(right.source);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return left.source.name.localeCompare(right.source.name);
    });
    for (const node of nodes) {
      sortNodes(node.children);
    }
  };

  sortNodes(roots);
  return roots;
}

function flattenNodeIds(node: SourceNode): string[] {
  const ids = [node.source.id];
  for (const child of node.children) {
    ids.push(...flattenNodeIds(child));
  }
  return ids;
}

function resolveSourceColor(source: CalendarSource) {
  const colorKeys = ["color", "accentColor", "calendarColor", "primaryColor", "colorPrimary", "orgColor", "brandColor"];
  for (const key of colorKeys) {
    const value = source.displayJson[key];
    if (typeof value !== "string") {
      continue;
    }
    const color = value.trim();
    if (color.length === 0) {
      continue;
    }
    if (/^#([0-9a-f]{3,8})$/i.test(color) || /^(rgb|rgba|hsl|hsla|oklch|oklab)\(/i.test(color) || /^var\(--/.test(color)) {
      return color;
    }
  }
  return null;
}

type SourceTreeNodeProps = {
  node: SourceNode;
  depth: number;
  selectedSourceIds: Set<string>;
  expandedSourceIds: Set<string>;
  nodeIdMap: Map<string, string[]>;
  onToggleExpanded: (sourceId: string) => void;
  onToggleSelection: (sourceId: string) => void;
};

function SourceTreeNode({
  node,
  depth,
  selectedSourceIds,
  expandedSourceIds,
  nodeIdMap,
  onToggleExpanded,
  onToggleSelection
}: SourceTreeNodeProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedSourceIds.has(node.source.id);
  const descendantIds = nodeIdMap.get(node.source.id) ?? [node.source.id];
  const selectedCount = descendantIds.reduce((count, id) => (selectedSourceIds.has(id) ? count + 1 : count), 0);
  const isChecked = selectedCount > 0 && selectedCount === descendantIds.length;
  const isPartial = selectedCount > 0 && selectedCount < descendantIds.length;
  const sourceColor = resolveSourceColor(node.source);

  return (
    <div className="space-y-1">
      <div
        className={cn(
          "group flex items-center gap-2 rounded-control border px-2 py-1.5 transition-colors",
          isChecked || isPartial ? "border-accent/35 bg-accent/10" : "border-transparent hover:border-border hover:bg-surface-muted/30"
        )}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        {hasChildren ? (
          <button
            aria-label={isExpanded ? "Collapse nested calendars" : "Expand nested calendars"}
            className={cn(
              "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-surface-muted hover:text-text",
              isExpanded ? "text-text" : null
            )}
            onClick={() => onToggleExpanded(node.source.id)}
            type="button"
          >
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-200", isExpanded ? "rotate-90" : null)} />
          </button>
        ) : (
          <span className="inline-flex h-5 w-5 shrink-0" />
        )}

        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm text-text">
          <Checkbox checked={isChecked} indeterminate={isPartial} onCheckedChange={() => onToggleSelection(node.source.id)} />
          <span
            className="h-2 w-2 shrink-0 rounded-full border border-border/50"
            style={{
              backgroundColor: sourceColor ?? "hsl(var(--accent))",
              boxShadow: `0 0 0 1px ${sourceColor ?? "hsl(var(--accent) / 0.25)"}`
            }}
          />
          <span className="truncate">{node.source.name}</span>
        </label>
      </div>

      {hasChildren ? (
        <div className={cn("grid overflow-hidden pl-1 transition-[grid-template-rows,opacity] duration-200 ease-out", isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
          <div className="min-h-0 space-y-1 overflow-hidden">
            {node.children.map((child) => (
              <SourceTreeNode
                depth={depth + 1}
                expandedSourceIds={expandedSourceIds}
                key={child.source.id}
                node={child}
                nodeIdMap={nodeIdMap}
                onToggleExpanded={onToggleExpanded}
                onToggleSelection={onToggleSelection}
                selectedSourceIds={selectedSourceIds}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

type CalendarSourceTreeProps = {
  sources: CalendarSource[];
  selectedSourceIds: Set<string>;
  onChange: (nextSourceIds: Set<string>) => void;
  className?: string;
};

export function CalendarSourceTree({ sources, selectedSourceIds, onChange, className }: CalendarSourceTreeProps) {
  const sourceTree = useMemo(() => buildSourceTree(sources), [sources]);
  const nodeIdMap = useMemo(() => {
    const next = new Map<string, string[]>();
    const walk = (node: SourceNode) => {
      const ids = flattenNodeIds(node);
      next.set(node.source.id, ids);
      for (const child of node.children) {
        walk(child);
      }
    };
    for (const root of sourceTree) {
      walk(root);
    }
    return next;
  }, [sourceTree]);
  const [expandedSourceIds, setExpandedSourceIds] = useState<Set<string>>(
    () =>
      new Set(
        sources
          .filter((source) => {
            for (const candidate of sources) {
              if (candidate.parentSourceId === source.id) {
                return true;
              }
            }
            return false;
          })
          .map((source) => source.id)
      )
  );

  function toggleExpanded(sourceId: string) {
    setExpandedSourceIds((current) => {
      const next = new Set(current);
      if (next.has(sourceId)) {
        next.delete(sourceId);
      } else {
        next.add(sourceId);
      }
      return next;
    });
  }

  function toggleSelection(sourceId: string) {
    const descendantIds = nodeIdMap.get(sourceId) ?? [sourceId];
    const allSelected = descendantIds.every((id) => selectedSourceIds.has(id));
    const next = new Set(selectedSourceIds);

    if (allSelected) {
      for (const id of descendantIds) {
        next.delete(id);
      }
    } else {
      for (const id of descendantIds) {
        next.add(id);
      }
    }

    onChange(next);
  }

  return (
    <div className={cn("space-y-1", className)}>
      {sourceTree.map((node) => (
        <SourceTreeNode
          depth={0}
          expandedSourceIds={expandedSourceIds}
          key={node.source.id}
          node={node}
          nodeIdMap={nodeIdMap}
          onToggleExpanded={toggleExpanded}
          onToggleSelection={toggleSelection}
          selectedSourceIds={selectedSourceIds}
        />
      ))}
    </div>
  );
}
