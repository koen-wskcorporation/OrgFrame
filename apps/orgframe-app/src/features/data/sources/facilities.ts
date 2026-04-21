import { createSupabaseServer } from "@/src/shared/data-api/server";
import type { DataSourceDefinition } from "@/src/features/data/registry/types";
import { bucketDaily, countInRange, emptySnapshot, groupBy, previousRange, tryLoad } from "@/src/features/data/sources/shared";

export const facilitiesDataSource: DataSourceDefinition = {
  key: "facilities",
  label: "Facilities",
  description: "Spaces and reservations.",
  icon: "map",
  kind: "tool",
  permissions: ["facilities.read", "facilities.write"],
  metrics: [
    { key: "spaces_total", label: "Spaces" },
    { key: "bookable_spaces", label: "Bookable", goodDirection: "up" },
    { key: "reservations_in_range", label: "Reservations in range", goodDirection: "up" },
    { key: "pending_approvals", label: "Pending approvals", goodDirection: "down" },
  ],
  series: [{ key: "reservations_daily", label: "Reservations", kind: "line" }],
  breakdowns: [
    { key: "space_kind", label: "Spaces by kind" },
    { key: "reservation_status", label: "Reservations by status" },
  ],
  tables: [
    {
      key: "spaces_list",
      label: "Spaces",
      defaultSortKey: "name",
      defaultSortDirection: "asc",
      columns: [
        { key: "name", label: "Name", type: "text" },
        { key: "spaceKind", label: "Kind", type: "status" },
        { key: "status", label: "Status", type: "status" },
        { key: "isBookable", label: "Bookable", type: "text" },
        { key: "capacity", label: "Capacity", type: "number" },
      ],
    },
  ],
  dashboards: [
    {
      key: "overview",
      label: "Overview",
      widgets: [
        { kind: "metric", metricKey: "spaces_total" },
        { kind: "metric", metricKey: "bookable_spaces" },
        { kind: "metric", metricKey: "reservations_in_range" },
        { kind: "metric", metricKey: "pending_approvals" },
        { kind: "timeseries", seriesKey: "reservations_daily", spanColumns: 2 },
        { kind: "breakdown", breakdownKey: "space_kind" },
        { kind: "breakdown", breakdownKey: "reservation_status" },
        { kind: "table", tableKey: "spaces_list", spanColumns: 3, maxRows: 50 },
      ],
    },
  ],
  async loader(ctx) {
    return tryLoad(async () => {
      const supabase = await createSupabaseServer();
      const snap = emptySnapshot();

      const { data: spaces } = await supabase
        .schema("facilities").from("spaces")
        .select("id, name, space_kind, status, is_bookable, capacity")
        .eq("org_id", ctx.orgId);
      const spaceList = spaces ?? [];

      const { data: reservations } = await supabase
        .schema("facilities").from("reservations")
        .select("id, status, starts_at_utc")
        .eq("org_id", ctx.orgId)
        .order("starts_at_utc", { ascending: false })
        .limit(2000);
      const resList = reservations ?? [];

      const bookable = spaceList.filter((s) => s.is_bookable as boolean).length;
      const pending = resList.filter((r) => (r.status as string) === "pending").length;

      snap.metrics.spaces_total = { value: spaceList.length };
      snap.metrics.bookable_spaces = { value: bookable };
      snap.metrics.pending_approvals = { value: pending };

      const times = resList.map((r) => r.starts_at_utc as string);
      const prev = previousRange(ctx);
      snap.metrics.reservations_in_range = {
        value: countInRange(times, ctx.rangeStart, ctx.rangeEnd),
        previous: countInRange(times, prev.start, prev.end),
      };

      snap.series.reservations_daily = {
        points: bucketDaily(
          times.filter((t) => t.slice(0, 10) >= ctx.rangeStart && t.slice(0, 10) <= ctx.rangeEnd),
          ctx
        ),
      };

      snap.breakdowns.space_kind = {
        segments: groupBy(spaceList, (s) => ((s.space_kind as string) || "custom") as string),
      };
      snap.breakdowns.reservation_status = {
        segments: groupBy(resList, (r) => ((r.status as string) || "pending") as string),
      };

      snap.tables.spaces_list = {
        total: spaceList.length,
        rows: spaceList.map((s) => ({
          id: s.id,
          name: s.name,
          spaceKind: s.space_kind,
          status: s.status,
          isBookable: s.is_bookable ? "Yes" : "No",
          capacity: s.capacity,
        })),
      };

      return snap;
    }, emptySnapshot());
  },
};
