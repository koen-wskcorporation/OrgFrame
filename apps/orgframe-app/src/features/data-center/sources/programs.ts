import { createSupabaseServer } from "@/src/shared/data-api/server";
import type { DataSourceDefinition } from "@/src/features/data-center/registry/types";
import { bucketDaily, countInRange, emptySnapshot, groupBy, previousRange, tryLoad } from "@/src/features/data-center/sources/shared";

export const programsDataSource: DataSourceDefinition = {
  key: "programs",
  label: "Programs",
  description: "Program catalog, structure, and registrations.",
  icon: "layout",
  kind: "tool",
  permissions: ["programs.read", "programs.write"],
  metrics: [
    { key: "total_programs", label: "Total programs" },
    { key: "published_programs", label: "Published", goodDirection: "up" },
    { key: "draft_programs", label: "Draft", goodDirection: "neutral" },
    { key: "total_registrations", label: "Registrations", goodDirection: "up" },
  ],
  series: [
    { key: "registrations_daily", label: "Registrations over time", kind: "line" },
    { key: "programs_created_daily", label: "Programs created", kind: "line" },
  ],
  breakdowns: [
    { key: "status_split", label: "By status" },
    { key: "program_type", label: "By program type" },
  ],
  tables: [
    {
      key: "programs_list",
      label: "Programs",
      defaultSortKey: "updatedAt",
      defaultSortDirection: "desc",
      columns: [
        { key: "name", label: "Name", type: "text" },
        { key: "status", label: "Status", type: "status" },
        { key: "programType", label: "Type", type: "text" },
        { key: "startDate", label: "Starts", type: "date" },
        { key: "endDate", label: "Ends", type: "date" },
        { key: "registrationCount", label: "Registrations", type: "number" },
        { key: "updatedAt", label: "Updated", type: "date" },
      ],
    },
  ],
  dashboards: [
    {
      key: "overview",
      label: "Overview",
      widgets: [
        { kind: "metric", metricKey: "total_programs" },
        { kind: "metric", metricKey: "published_programs" },
        { kind: "metric", metricKey: "draft_programs" },
        { kind: "metric", metricKey: "total_registrations" },
        { kind: "timeseries", seriesKey: "registrations_daily", spanColumns: 2 },
        { kind: "breakdown", breakdownKey: "status_split" },
        { kind: "breakdown", breakdownKey: "program_type" },
        { kind: "table", tableKey: "programs_list", spanColumns: 3, maxRows: 25 },
      ],
    },
  ],
  async loader(ctx) {
    return tryLoad(async () => {
      const supabase = await createSupabaseServer();
      const snap = emptySnapshot();

      const { data: programs } = await supabase
        .schema("programs").from("programs")
        .select("id, name, status, program_type, start_date, end_date, created_at, updated_at")
        .eq("org_id", ctx.orgId);

      const programsList = programs ?? [];
      const published = programsList.filter((p) => (p.status as string) === "published").length;
      const draft = programsList.filter((p) => (p.status as string) === "draft").length;

      const { data: regs } = await supabase
        .schema("programs").from("program_registrations")
        .select("id, program_id, created_at");

      const regsList = (regs ?? []).filter((r) => {
        return programsList.some((p) => (p.id as string) === (r.program_id as string));
      });

      snap.metrics.total_programs = { value: programsList.length };
      snap.metrics.published_programs = { value: published };
      snap.metrics.draft_programs = { value: draft };

      const prev = previousRange(ctx);
      snap.metrics.total_registrations = {
        value: countInRange(regsList.map((r) => r.created_at as string), ctx.rangeStart, ctx.rangeEnd),
        previous: countInRange(regsList.map((r) => r.created_at as string), prev.start, prev.end),
      };

      snap.series.registrations_daily = {
        points: bucketDaily(
          regsList
            .filter((r) => {
              const day = (r.created_at as string).slice(0, 10);
              return day >= ctx.rangeStart && day <= ctx.rangeEnd;
            })
            .map((r) => r.created_at as string),
          ctx
        ),
      };
      snap.series.programs_created_daily = {
        points: bucketDaily(
          programsList
            .filter((p) => {
              const day = (p.created_at as string).slice(0, 10);
              return day >= ctx.rangeStart && day <= ctx.rangeEnd;
            })
            .map((p) => p.created_at as string),
          ctx
        ),
      };

      snap.breakdowns.status_split = {
        segments: groupBy(programsList, (p) => (p.status as string) ?? "unknown"),
      };
      snap.breakdowns.program_type = {
        segments: groupBy(programsList, (p) => ((p.program_type as string) || "general") as string),
      };

      const regCounts = new Map<string, number>();
      for (const r of regsList) {
        const k = r.program_id as string;
        regCounts.set(k, (regCounts.get(k) ?? 0) + 1);
      }

      snap.tables.programs_list = {
        total: programsList.length,
        rows: programsList.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          programType: p.program_type,
          startDate: p.start_date,
          endDate: p.end_date,
          registrationCount: regCounts.get(p.id as string) ?? 0,
          updatedAt: p.updated_at,
        })),
      };

      return snap;
    }, emptySnapshot());
  },
};
