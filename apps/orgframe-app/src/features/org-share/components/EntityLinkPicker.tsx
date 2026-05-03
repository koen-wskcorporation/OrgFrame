"use client";

import * as React from "react";
import { ChevronRight, Search } from "lucide-react";
import { Chip } from "@orgframe/ui/primitives/chip";
import { EntityChip } from "@orgframe/ui/primitives/entity-chip";
import { Input } from "@orgframe/ui/primitives/input";
import { useToast } from "@orgframe/ui/primitives/toast";
import { listOrgShareCatalogAction } from "@/src/features/org-share/actions";
import type { ShareTarget, ShareTargetType } from "@/src/features/org-share/types";

export type EntityLinkPickerProps = {
  orgSlug: string;
  /** Restrict the catalog to specific entity types. Defaults to all. */
  allowedTypes?: ShareTargetType[];
  /** Pre-attached, non-removable links (rendered as locked chips). */
  lockedLinks?: ReadonlyArray<ShareTarget>;
  /** User-selected links the picker manages. */
  value: ShareTarget[];
  onChange: (next: ShareTarget[]) => void;
  /** Helper text below the heading. */
  emptyHint?: string;
  /** When true, the helper text and asterisk indicate at least one is required. */
  required?: boolean;
  /** Inline error message (e.g. validation). */
  errorMessage?: string;
};

function targetKey(target: { type: ShareTargetType; id: string }) {
  return `${target.type}:${target.id}`;
}

function typeLabel(type: ShareTargetType) {
  switch (type) {
    case "team":
      return "Team";
    case "division":
      return "Division";
    case "program":
      return "Program";
    case "person":
      return "Person";
    case "admin":
      return "Admin";
    case "group":
      return "Group";
    default:
      return type;
  }
}

function chipColorForType(type: ShareTargetType): "neutral" | "green" | "yellow" | "red" {
  switch (type) {
    case "program":
      return "yellow";
    case "division":
      return "red";
    case "team":
      return "green";
    default:
      return "neutral";
  }
}

type TreeNode = {
  target: ShareTarget;
  children: TreeNode[];
};

function buildHierarchy(items: ShareTarget[]): { roots: TreeNode[]; childrenById: Map<string, TreeNode[]> } {
  const nodeByKey = new Map<string, TreeNode>();
  for (const target of items) {
    nodeByKey.set(targetKey(target), { target, children: [] });
  }
  const childrenById = new Map<string, TreeNode[]>();
  const roots: TreeNode[] = [];
  for (const node of nodeByKey.values()) {
    const parentKey =
      node.target.parentId && node.target.parentType
        ? `${node.target.parentType}:${node.target.parentId}`
        : null;
    const parent = parentKey ? nodeByKey.get(parentKey) ?? null : null;
    if (parent) {
      parent.children.push(node);
      const list = childrenById.get(parentKey!) ?? [];
      list.push(node);
      childrenById.set(parentKey!, list);
    } else {
      roots.push(node);
    }
  }
  return { roots, childrenById };
}

function nodeMatchesQuery(node: TreeNode, query: string): boolean {
  if (!query) {
    return true;
  }
  if (node.target.label.toLowerCase().includes(query)) {
    return true;
  }
  return node.children.some((child) => nodeMatchesQuery(child, query));
}

export function EntityLinkPicker({
  orgSlug,
  allowedTypes,
  lockedLinks = [],
  value,
  onChange,
  emptyHint,
  required = false,
  errorMessage
}: EntityLinkPickerProps) {
  const { toast } = useToast();
  const [catalog, setCatalog] = React.useState<ShareTarget[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const allowedTypesKey = allowedTypes ? allowedTypes.join(",") : "all";
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listOrgShareCatalogAction({ orgSlug, requestedTypes: allowedTypes })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          toast({ title: "Unable to load options", description: result.error, variant: "destructive" });
          setCatalog([]);
          return;
        }
        setCatalog(result.data.options);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, allowedTypesKey]);

  const lockedKeys = React.useMemo(() => new Set(lockedLinks.map(targetKey)), [lockedLinks]);
  const selectedKeys = React.useMemo(() => new Set(value.map(targetKey)), [value]);
  const allSelectedKeys = React.useMemo(() => {
    const set = new Set(lockedKeys);
    for (const key of selectedKeys) {
      set.add(key);
    }
    return set;
  }, [lockedKeys, selectedKeys]);

  const trimmedQuery = query.trim().toLowerCase();
  const { roots } = React.useMemo(() => {
    if (!catalog) {
      return { roots: [] as TreeNode[], childrenById: new Map<string, TreeNode[]>() };
    }
    return buildHierarchy(catalog);
  }, [catalog]);

  function addTarget(target: ShareTarget) {
    if (allSelectedKeys.has(targetKey(target))) {
      return;
    }
    onChange([...value, target]);
  }

  function removeTarget(target: ShareTarget) {
    onChange(value.filter((item) => targetKey(item) !== targetKey(target)));
  }

  function renderNode(node: TreeNode, depth: number): React.ReactNode {
    const isSelected = allSelectedKeys.has(targetKey(node.target));
    const matchesSelf =
      !trimmedQuery || node.target.label.toLowerCase().includes(trimmedQuery);
    const visibleChildren = node.children.filter((child) => nodeMatchesQuery(child, trimmedQuery));
    if (!matchesSelf && visibleChildren.length === 0) {
      return null;
    }
    return (
      <li key={targetKey(node.target)}>
        <button
          className={
            "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors " +
            (isSelected
              ? "cursor-not-allowed bg-surface-muted/60 text-text-muted"
              : "hover:bg-surface-muted")
          }
          disabled={isSelected}
          onClick={() => addTarget(node.target)}
          style={{ paddingLeft: `${12 + depth * 18}px` }}
          type="button"
        >
          {depth > 0 ? <ChevronRight aria-hidden="true" className="h-3 w-3 shrink-0 text-text-muted" /> : null}
          <Chip color={chipColorForType(node.target.type)} size="compact">
            {typeLabel(node.target.type)}
          </Chip>
          <span className="min-w-0 flex-1 truncate font-medium text-text">{node.target.label}</span>
          {isSelected ? <span className="text-[10px] uppercase tracking-wide text-text-muted">Linked</span> : null}
        </button>
        {visibleChildren.length > 0 ? (
          <ul className="border-t-0">{visibleChildren.map((child) => renderNode(child, depth + 1))}</ul>
        ) : null}
      </li>
    );
  }

  const visibleRoots = roots.filter((root) => nodeMatchesQuery(root, trimmedQuery));

  const allChips = [...lockedLinks, ...value];

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Linked to{required ? <span className="ml-1 text-destructive">*</span> : null}
        </p>
        {emptyHint ? <p className="text-xs text-text-muted">{emptyHint}</p> : null}
      </div>

      {allChips.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {allChips.map((target) => {
            const locked = lockedKeys.has(targetKey(target));
            return (
              <EntityChip
                hideAvatar
                key={targetKey(target)}
                metaLabel={typeLabel(target.type)}
                metaTone="neutral"
                name={target.label}
                onRemove={locked ? undefined : () => removeTarget(target)}
              />
            );
          })}
        </div>
      ) : null}

      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
        />
        <Input
          className="pl-9"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search teams, divisions, or programs..."
          type="search"
          value={query}
        />
      </div>

      <div className="rounded-control border bg-surface">
        {loading && !catalog ? (
          <p className="px-3 py-3 text-xs text-text-muted">Loading…</p>
        ) : visibleRoots.length === 0 ? (
          <p className="px-3 py-3 text-xs text-text-muted">
            {trimmedQuery
              ? "No matches."
              : catalog && catalog.length === 0
                ? "Nothing available to link."
                : "All available items are already linked."}
          </p>
        ) : (
          <ul className="max-h-72 divide-y overflow-y-auto" role="listbox">
            {visibleRoots.map((root) => renderNode(root, 0))}
          </ul>
        )}
      </div>

      {errorMessage ? <p className="text-xs text-destructive">{errorMessage}</p> : null}
    </div>
  );
}
