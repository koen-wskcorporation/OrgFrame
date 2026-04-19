"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Badge } from "@orgframe/ui/primitives/badge";
import { Button } from "@orgframe/ui/primitives/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { Chip } from "@orgframe/ui/primitives/chip";
import { Tooltip } from "@orgframe/ui/primitives/tooltip";
import { cn } from "@orgframe/ui/primitives/utils";

type PeopleSystemGroupWorkspaceItem = {
  key: string;
  kind: "all_members" | "program" | "division" | "team";
  label: string;
  description: string;
  entityId: string | null;
  programId: string | null;
  divisionId: string | null;
  memberCount: number;
  previewMembers: Array<{
    userId: string;
    displayName: string;
  }>;
};

type TreeNode = {
  group: PeopleSystemGroupWorkspaceItem;
  children: TreeNode[];
};

function GroupCard({ group }: { group: PeopleSystemGroupWorkspaceItem }) {
  return (
    <div className="space-y-2 rounded-control border bg-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-text">
            <span>{group.label}</span>
            <Tooltip content="Dynamic group. This is system-managed and cannot be renamed or deleted.">
              <Chip color="yellow" size="compact">
                Dynamic
              </Chip>
            </Tooltip>
          </p>
          <p className="text-xs text-text-muted">{group.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="neutral">{group.kind.replace("_", " ")}</Badge>
          <Badge variant="neutral">{group.memberCount} members</Badge>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {group.previewMembers.length === 0 ? (
          <p className="text-xs text-text-muted">No members.</p>
        ) : (
          group.previewMembers.map((member) => (
            <Chip className="normal-case tracking-normal" color="neutral" key={member.userId} size="compact">
              {member.displayName}
            </Chip>
          ))
        )}
      </div>
    </div>
  );
}

function flattenNodeKeys(node: TreeNode): string[] {
  const keys = [node.group.key];
  for (const child of node.children) {
    keys.push(...flattenNodeKeys(child));
  }
  return keys;
}

function TreeRow({
  node,
  depth,
  expandedKeys,
  onToggle
}: {
  node: TreeNode;
  depth: number;
  expandedKeys: Set<string>;
  onToggle: (key: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const expanded = expandedKeys.has(node.group.key);

  return (
    <div className="space-y-2">
      <div className={cn("rounded-control border bg-surface p-2", depth > 0 ? "border-border/70" : null)} style={{ marginLeft: `${depth * 14}px` }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {hasChildren ? (
              <button
                aria-expanded={expanded}
                aria-label={expanded ? "Collapse group" : "Expand group"}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-text-muted hover:bg-surface-muted hover:text-text"
                onClick={() => onToggle(node.group.key)}
                type="button"
              >
                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            ) : (
              <span className="inline-flex h-6 w-6 shrink-0" />
            )}
            <span className="truncate text-sm font-semibold text-text">{node.group.label}</span>
            <Tooltip content="Dynamic group. This is system-managed and cannot be renamed or deleted.">
              <Chip color="yellow" size="compact">
                Dynamic
              </Chip>
            </Tooltip>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="neutral">{node.group.kind.replace("_", " ")}</Badge>
            <Badge variant="neutral">{node.group.memberCount} members</Badge>
          </div>
        </div>
        <p className="mt-1 text-xs text-text-muted">{node.group.description}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {node.group.previewMembers.length === 0 ? (
            <p className="text-xs text-text-muted">No members.</p>
          ) : (
            node.group.previewMembers.map((member) => (
              <Chip className="normal-case tracking-normal" color="neutral" key={member.userId} size="compact">
                {member.displayName}
              </Chip>
            ))
          )}
        </div>
      </div>

      {hasChildren ? (
        <div
          className={cn(
            "grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out",
            expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          )}
        >
          <div className="min-h-0 space-y-2 overflow-hidden">
            {node.children.map((child) => (
              <TreeRow depth={depth + 1} expandedKeys={expandedKeys} key={child.group.key} node={child} onToggle={onToggle} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PeopleSystemGroupsTree({ groups }: { groups: PeopleSystemGroupWorkspaceItem[] }) {
  const allMembersGroup = useMemo(() => groups.find((group) => group.kind === "all_members") ?? null, [groups]);

  const treeRoots = useMemo(() => {
    const programs = groups.filter((group) => group.kind === "program");
    const divisions = groups.filter((group) => group.kind === "division");
    const teams = groups.filter((group) => group.kind === "team");

    const divisionsByProgram = new Map<string, PeopleSystemGroupWorkspaceItem[]>();
    for (const division of divisions) {
      const programId = division.programId ?? "";
      const current = divisionsByProgram.get(programId) ?? [];
      current.push(division);
      divisionsByProgram.set(programId, current);
    }

    const teamsByDivision = new Map<string, PeopleSystemGroupWorkspaceItem[]>();
    const directTeamsByProgram = new Map<string, PeopleSystemGroupWorkspaceItem[]>();
    for (const team of teams) {
      if (team.divisionId) {
        const current = teamsByDivision.get(team.divisionId) ?? [];
        current.push(team);
        teamsByDivision.set(team.divisionId, current);
        continue;
      }

      const programId = team.programId ?? "";
      const current = directTeamsByProgram.get(programId) ?? [];
      current.push(team);
      directTeamsByProgram.set(programId, current);
    }

    const sortByLabel = (items: PeopleSystemGroupWorkspaceItem[]) => [...items].sort((left, right) => left.label.localeCompare(right.label));

    return sortByLabel(programs).map((program) => {
      const divisionNodes = sortByLabel(divisionsByProgram.get(program.entityId ?? "") ?? []).map((division) => ({
        group: division,
        children: sortByLabel(teamsByDivision.get(division.entityId ?? "") ?? []).map((team) => ({ group: team, children: [] }))
      }));

      const directTeamNodes = sortByLabel(directTeamsByProgram.get(program.entityId ?? "") ?? []).map((team) => ({ group: team, children: [] }));

      return {
        group: program,
        children: [...divisionNodes, ...directTeamNodes]
      } satisfies TreeNode;
    });
  }, [groups]);

  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set(treeRoots.map((node) => node.group.key)));

  const allExpandableKeys = useMemo(() => {
    const next = new Set<string>();
    for (const node of treeRoots) {
      if (node.children.length > 0) {
        for (const key of flattenNodeKeys(node)) {
          next.add(key);
        }
      }
    }
    return next;
  }, [treeRoots]);

  function toggle(key: string) {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function expandAll() {
    setExpandedKeys(new Set(allExpandableKeys));
  }

  function collapseAll() {
    setExpandedKeys(new Set());
  }

  return (
    <>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Groups</CardTitle>
            <CardDescription>System groups are generated from memberships and the program hierarchy. v1 is read-only.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={expandAll} size="sm" variant="ghost">
              Expand All
            </Button>
            <Button onClick={collapseAll} size="sm" variant="ghost">
              Collapse All
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {groups.length === 0 ? <Alert variant="info">No system groups available yet.</Alert> : null}
        {allMembersGroup ? <GroupCard group={allMembersGroup} /> : null}
        <div className="space-y-2">
          {treeRoots.map((node) => (
            <TreeRow depth={0} expandedKeys={expandedKeys} key={node.group.key} node={node} onToggle={toggle} />
          ))}
        </div>
      </CardContent>
    </>
  );
}
