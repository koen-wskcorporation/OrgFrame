import { createSupabaseServer } from "@/src/shared/data-api/server";
import type { DataSourceDefinition } from "@/src/features/data/registry/types";
import { bucketDaily, countInRange, emptySnapshot, groupBy, previousRange, tryLoad } from "@/src/features/data/sources/shared";

type ProgramEntityInput = {
  orgId: string;
  programId: string;
  name: string;
  slug: string;
};

export function buildProgramEntitySource(input: ProgramEntityInput): DataSourceDefinition {
  return {
    key: `program:${input.programId}`,
    label: input.name,
    description: `Program snapshot for ${input.name}.`,
    icon: "layout",
    kind: "entity",
    entityType: "program",
    entityId: input.programId,
    permissions: ["programs.read", "programs.write"],
    metrics: [
      { key: "registrations_total", label: "Registrations" },
      { key: "registrations_in_range", label: "New in range", goodDirection: "up" },
      { key: "teams_total", label: "Teams" },
      { key: "schedule_blocks", label: "Schedule blocks" },
    ],
    series: [{ key: "registrations_daily", label: "Registrations over time", kind: "line" }],
    breakdowns: [{ key: "node_kinds", label: "Structure by kind" }],
    tables: [
      {
        key: "registrations_list",
        label: "Registrations",
        defaultSortKey: "createdAt",
        defaultSortDirection: "desc",
        columns: [
          { key: "status", label: "Status", type: "status" },
          { key: "createdAt", label: "Submitted", type: "date" },
          { key: "playerId", label: "Player", type: "text", defaultVisible: false },
        ],
      },
    ],
    dashboards: [
      {
        key: "overview",
        label: "Overview",
        widgets: [
          { kind: "metric", metricKey: "registrations_total" },
          { kind: "metric", metricKey: "registrations_in_range" },
          { kind: "metric", metricKey: "teams_total" },
          { kind: "metric", metricKey: "schedule_blocks" },
          { kind: "timeseries", seriesKey: "registrations_daily", spanColumns: 3 },
          { kind: "breakdown", breakdownKey: "node_kinds" },
          { kind: "table", tableKey: "registrations_list", spanColumns: 3, maxRows: 50 },
        ],
      },
    ],
    async loader(ctx) {
      return tryLoad(async () => {
        const supabase = await createSupabaseServer();
        const snap = emptySnapshot();

        const { data: regs } = await supabase
          .schema("programs").from("program_registrations")
          .select("id, status, created_at, player_id")
          .eq("program_id", input.programId);
        const regList = regs ?? [];

        const { count: teamsCount } = await supabase
          .schema("programs").from("program_teams")
          .select("id", { count: "exact", head: true })
          .eq("program_id", input.programId);

        const { count: blocksCount } = await supabase
          .schema("programs").from("program_schedule_blocks")
          .select("id", { count: "exact", head: true })
          .eq("program_id", input.programId);

        const { data: nodes } = await supabase
          .schema("programs").from("divisions")
          .select("id, node_kind")
          .eq("program_id", input.programId);
        const nodeList = nodes ?? [];

        snap.metrics.registrations_total = { value: regList.length };
        snap.metrics.teams_total = { value: teamsCount ?? 0 };
        snap.metrics.schedule_blocks = { value: blocksCount ?? 0 };

        const times = regList.map((r) => r.created_at as string);
        const prev = previousRange(ctx);
        snap.metrics.registrations_in_range = {
          value: countInRange(times, ctx.rangeStart, ctx.rangeEnd),
          previous: countInRange(times, prev.start, prev.end),
        };

        snap.series.registrations_daily = {
          points: bucketDaily(
            times.filter((t) => t.slice(0, 10) >= ctx.rangeStart && t.slice(0, 10) <= ctx.rangeEnd),
            ctx
          ),
        };

        snap.breakdowns.node_kinds = {
          segments: groupBy(nodeList, (n) => ((n.node_kind as string) || "unknown") as string),
        };

        snap.tables.registrations_list = {
          total: regList.length,
          rows: regList.slice(0, 200).map((r) => ({
            id: r.id,
            status: r.status,
            createdAt: r.created_at,
            playerId: r.player_id,
          })),
        };

        return snap;
      }, emptySnapshot());
    },
  };
}
