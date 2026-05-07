"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { Chip, RepeaterChip } from "@orgframe/ui/primitives/chip";
import { Input } from "@orgframe/ui/primitives/input";
import { Repeater } from "@orgframe/ui/primitives/repeater";
import { Select } from "@orgframe/ui/primitives/select";
import { ManageSection } from "@/src/features/core/layout/components/ManageSection";
import type { ProgramNode, ProgramTeamSummary } from "@/src/features/programs/types";
import { TeamDetailPanel } from "@/src/features/programs/teams/components/TeamDetailPanel";

type ProgramTeamsPanelProps = {
  orgSlug: string;
  programId: string;
  canWrite: boolean;
  nodes: ProgramNode[];
  teamSummaries: ProgramTeamSummary[];
};

export function ProgramTeamsPanel({ orgSlug, programId, canWrite, nodes, teamSummaries }: ProgramTeamsPanelProps) {
  const [teamItems, setTeamItems] = useState(teamSummaries);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [divisionFilter, setDivisionFilter] = useState("");
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);

  useEffect(() => {
    setTeamItems(teamSummaries);
  }, [teamSummaries]);

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const divisionOptions = useMemo(
    () => nodes.filter((node) => node.nodeKind === "division"),
    [nodes]
  );

  const filteredTeams = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return teamItems.filter((team) => {
      if (statusFilter !== "all" && team.team.status !== statusFilter) {
        return false;
      }

      if (divisionFilter && team.node.parentId !== divisionFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const divisionName = team.node.parentId ? nodeById.get(team.node.parentId)?.name ?? "" : "";
      const searchTarget = `${team.node.name} ${divisionName} ${team.team.teamCode ?? ""} ${team.team.levelLabel ?? ""}`.toLowerCase();
      return searchTarget.includes(normalizedSearch);
    });
  }, [teamItems, search, statusFilter, divisionFilter, nodeById]);

  const handleSummaryUpdate = useCallback(
    (update: { teamId: string; team: ProgramTeamSummary["team"]; memberCount: number; staffCount: number }) => {
      setTeamItems((current) =>
        current.map((summary) =>
          summary.team.id === update.teamId
            ? {
                ...summary,
                team: update.team,
                memberCount: update.memberCount,
                staffCount: update.staffCount
              }
            : summary
        )
      );
    },
    []
  );

  return (
    <div className="ui-stack-page">
      <Repeater
        disableSearch
        emptyMessage="No teams match this view."
        getSearchValue={() => ""}
        initialView="list"
        items={filteredTeams}
        viewKey="manage.program-teams"
        renderShell={({ toolbar, body }) => (
          <ManageSection
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {toolbar}
                <Button href={`/manage/programs/${programId}/structure`} type="button" variant="secondary">
                  Open Structure
                </Button>
              </div>
            }
            contentClassName="space-y-4"
            description="Manage team rosters, staff assignments, and metadata."
            title="Teams"
          >
            <div className="grid gap-3 md:grid-cols-3">
              <Input onChange={(event) => setSearch(event.target.value)} placeholder="Search teams" value={search} />
              <Select
                onChange={(event) => setStatusFilter(event.target.value)}
                options={[
                  { value: "all", label: "All statuses" },
                  { value: "active", label: "Active" },
                  { value: "archived", label: "Archived" }
                ]}
                value={statusFilter}
              />
              <Select
                onChange={(event) => setDivisionFilter(event.target.value)}
                options={[
                  { value: "", label: "All divisions" },
                  ...divisionOptions.map((division) => ({ value: division.id, label: division.name }))
                ]}
                value={divisionFilter}
              />
            </div>
            {body}
          </ManageSection>
        )}
        getItem={(summary) => {
            const divisionName = summary.node.parentId ? nodeById.get(summary.node.parentId)?.name ?? "" : "";
            return {
              id: summary.team.id,
              title: summary.node.name,
              chips: (
                <>
                  <Chip color={summary.team.status === "active" ? "emerald" : "slate"} label={summary.team.status} />
                  {divisionName ? <RepeaterChip label={divisionName} /> : null}
                  {summary.team.levelLabel ? <RepeaterChip label={summary.team.levelLabel} /> : null}
                  <RepeaterChip label={`Roster ${summary.memberCount}`} />
                  <RepeaterChip label={`Staff ${summary.staffCount}`} />
                </>
              ),
              meta: summary.team.teamCode ? <>/{summary.team.teamCode}</> : undefined,
              secondaryActions: (
                <Button href={`/manage/programs/${programId}/structure?teamId=${summary.team.id}`} size="sm" type="button" variant="ghost">
                  Open in Structure
                </Button>
              ),
              primaryAction: (
                <Button onClick={() => setActiveTeamId(summary.team.id)} size="sm" type="button" variant="secondary">
                  Manage
                </Button>
              )
            };
          }}
      />

      <TeamDetailPanel
        canWrite={canWrite}
        nodes={nodes}
        onClose={() => setActiveTeamId(null)}
        onSummaryChange={handleSummaryUpdate}
        open={Boolean(activeTeamId)}
        orgSlug={orgSlug}
        teamId={activeTeamId}
      />
    </div>
  );
}
