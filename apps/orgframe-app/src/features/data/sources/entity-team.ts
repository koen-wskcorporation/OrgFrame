import { createSupabaseServer } from "@/src/shared/data-api/server";
import type { DataSourceDefinition } from "@/src/features/data/registry/types";
import { emptySnapshot, groupBy, tryLoad } from "@/src/features/data/sources/shared";

type TeamEntityInput = {
  orgId: string;
  teamId: string;
  teamName: string;
  programName: string;
};

export function buildTeamEntitySource(input: TeamEntityInput): DataSourceDefinition {
  return {
    key: `team:${input.teamId}`,
    label: `${input.teamName} — ${input.programName}`,
    description: `Team roster and status.`,
    icon: "users",
    kind: "entity",
    entityType: "team",
    entityId: input.teamId,
    permissions: ["programs.read", "programs.write"],
    metrics: [
      { key: "roster_size", label: "Roster size" },
      { key: "active_players", label: "Active players", goodDirection: "up" },
      { key: "staff_count", label: "Staff" },
    ],
    series: [],
    breakdowns: [
      { key: "member_status", label: "Players by status" },
      { key: "member_role", label: "Players by role" },
    ],
    tables: [
      {
        key: "roster",
        label: "Roster",
        defaultSortKey: "jerseyNumber",
        defaultSortDirection: "asc",
        columns: [
          { key: "playerId", label: "Player", type: "text" },
          { key: "role", label: "Role", type: "status" },
          { key: "status", label: "Status", type: "status" },
          { key: "jerseyNumber", label: "Jersey", type: "text" },
          { key: "position", label: "Position", type: "text" },
        ],
      },
    ],
    dashboards: [
      {
        key: "overview",
        label: "Overview",
        widgets: [
          { kind: "metric", metricKey: "roster_size" },
          { kind: "metric", metricKey: "active_players" },
          { kind: "metric", metricKey: "staff_count" },
          { kind: "breakdown", breakdownKey: "member_status" },
          { kind: "breakdown", breakdownKey: "member_role" },
          { kind: "table", tableKey: "roster", spanColumns: 3, maxRows: 100 },
        ],
      },
    ],
    async loader() {
      return tryLoad(async () => {
        const supabase = await createSupabaseServer();
        const snap = emptySnapshot();

        const { data: members } = await supabase
          .schema("programs").from("program_team_members")
          .select("id, player_id, role, status, jersey_number, position")
          .eq("team_id", input.teamId);
        const list = members ?? [];

        const { count: staffCount } = await supabase
          .schema("programs").from("program_team_staff")
          .select("id", { count: "exact", head: true })
          .eq("team_id", input.teamId);

        const active = list.filter((m) => (m.status as string) === "active").length;

        snap.metrics.roster_size = { value: list.length };
        snap.metrics.active_players = { value: active };
        snap.metrics.staff_count = { value: staffCount ?? 0 };

        snap.breakdowns.member_status = {
          segments: groupBy(list, (m) => ((m.status as string) || "active") as string),
        };
        snap.breakdowns.member_role = {
          segments: groupBy(list, (m) => ((m.role as string) || "player") as string),
        };

        snap.tables.roster = {
          total: list.length,
          rows: list.map((m) => ({
            id: m.id,
            playerId: m.player_id,
            role: m.role,
            status: m.status,
            jerseyNumber: m.jersey_number,
            position: m.position,
          })),
        };

        return snap;
      }, emptySnapshot());
    },
  };
}
