"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Filter } from "lucide-react";
import { Button } from "@orgframe/ui/ui/button";
import { Checkbox } from "@orgframe/ui/ui/checkbox";
import { Popover } from "@orgframe/ui/ui/popover";
import { cn } from "@/lib/utils";
import type { CalendarSource } from "@/modules/calendar/types";

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

  const sortNodes = (nodes: SourceNode[]) => {
    nodes.sort((left, right) => left.source.name.localeCompare(right.source.name));
    for (const node of nodes) {
      sortNodes(node.children);
    }
  };

  sortNodes(roots);
  return roots;
}

function collectNodeIds(node: SourceNode): string[] {
  const ids = [node.source.id];
  for (const child of node.children) {
    ids.push(...collectNodeIds(child));
  }
  return ids;
}

type NodeRowProps = {
  node: SourceNode;
  depth: number;
  selectedSourceIds: Set<string>;
  expandedSourceIds: Set<string>;
  onToggleExpanded: (sourceId: string) => void;
  onToggleNodeSelection: (node: SourceNode) => void;
};

function NodeRow({ node, depth, selectedSourceIds, expandedSourceIds, onToggleExpanded, onToggleNodeSelection }: NodeRowProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedSourceIds.has(node.source.id);
  const allNodeIds = useMemo(() => collectNodeIds(node), [node]);
  const selectedCount = allNodeIds.filter((id) => selectedSourceIds.has(id)).length;
  const isChecked = selectedCount === allNodeIds.length;
  const isPartial = selectedCount > 0 && selectedCount < allNodeIds.length;

  return (
    <div className="space-y-1">
      <div className={cn("flex items-center gap-2 rounded-control px-1 py-1", depth > 0 ? "bg-surface-muted/20" : null)} style={{ paddingLeft: `${depth * 14 + 4}px` }}>
        {hasChildren ? (
          <button
            className="inline-flex h-5 w-5 items-center justify-center rounded-control text-text-muted hover:bg-surface-muted hover:text-text"
            onClick={() => onToggleExpanded(node.source.id)}
            type="button"
          >
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="inline-flex h-5 w-5" />
        )}
        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-text">
          <Checkbox
            checked={isChecked}
            className={isPartial ? "border-accent bg-accent/60" : undefined}
            onCheckedChange={() => onToggleNodeSelection(node)}
          />
          <span className="truncate">{node.source.name}</span>
        </label>
      </div>

      {hasChildren && isExpanded ? (
        <div className="space-y-1">
          {node.children.map((child) => (
            <NodeRow
              depth={depth + 1}
              expandedSourceIds={expandedSourceIds}
              key={child.source.id}
              node={child}
              onToggleExpanded={onToggleExpanded}
              onToggleNodeSelection={onToggleNodeSelection}
              selectedSourceIds={selectedSourceIds}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

type CalendarSourceFilterPopoverProps = {
  sources: CalendarSource[];
  selectedSourceIds: Set<string>;
  onChange: (nextSourceIds: Set<string>) => void;
  className?: string;
};

export function CalendarSourceFilterPopover({ sources, selectedSourceIds, onChange, className }: CalendarSourceFilterPopoverProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [expandedSourceIds, setExpandedSourceIds] = useState<Set<string>>(() => new Set());

  const sourceTree = useMemo(() => buildSourceTree(sources), [sources]);

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

  function toggleNodeSelection(node: SourceNode) {
    const nodeIds = collectNodeIds(node);
    const allSelected = nodeIds.every((id) => selectedSourceIds.has(id));
    const next = new Set(selectedSourceIds);
    if (allSelected) {
      for (const id of nodeIds) {
        next.delete(id);
      }
    } else {
      for (const id of nodeIds) {
        next.add(id);
      }
    }
    onChange(next);
  }

  const activeCount = selectedSourceIds.size;

  return (
    <>
      <Button className={className} onClick={() => setOpen((current) => !current)} ref={triggerRef} size="sm" type="button" variant="secondary">
        <Filter className="h-4 w-4" />
        Calendars ({activeCount})
      </Button>
      <Popover anchorRef={triggerRef} onClose={() => setOpen(false)} open={open} placement="bottom-end">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Visible Calendars</p>
            <div className="flex items-center gap-1">
              <Button
                onClick={() => onChange(new Set(sources.map((source) => source.id)))}
                size="sm"
                type="button"
                variant="ghost"
              >
                All
              </Button>
              <Button onClick={() => onChange(new Set())} size="sm" type="button" variant="ghost">
                None
              </Button>
            </div>
          </div>
          <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
            {sourceTree.map((node) => (
              <NodeRow
                depth={0}
                expandedSourceIds={expandedSourceIds}
                key={node.source.id}
                node={node}
                onToggleExpanded={toggleExpanded}
                onToggleNodeSelection={toggleNodeSelection}
                selectedSourceIds={selectedSourceIds}
              />
            ))}
          </div>
        </div>
      </Popover>
    </>
  );
}
