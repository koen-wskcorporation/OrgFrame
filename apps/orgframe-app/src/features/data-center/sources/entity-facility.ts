import { createSupabaseServer } from "@/src/shared/data-api/server";
import type { DataSourceDefinition } from "@/src/features/data-center/registry/types";
import { bucketDaily, countInRange, emptySnapshot, groupBy, previousRange, tryLoad } from "@/src/features/data-center/sources/shared";

type FacilityEntityInput = {
  orgId: string;
  spaceId: string;
  name: string;
};

export function buildFacilityEntitySource(input: FacilityEntityInput): DataSourceDefinition {
  return {
    key: `facility:${input.spaceId}`,
    label: input.name,
    description: `Facility snapshot for ${input.name}.`,
    icon: "map",
    kind: "entity",
    entityType: "facility",
    entityId: input.spaceId,
    permissions: ["facilities.read", "facilities.write"],
    metrics: [
      { key: "total_reservations", label: "Reservations total" },
      { key: "in_range", label: "In range", goodDirection: "up" },
      { key: "pending", label: "Pending approval", goodDirection: "down" },
    ],
    series: [{ key: "reservations_daily", label: "Reservations", kind: "line" }],
    breakdowns: [{ key: "status_split", label: "By status" }],
    tables: [
      {
        key: "reservations_list",
        label: "Reservations",
        defaultSortKey: "startsAt",
        defaultSortDirection: "desc",
        columns: [
          { key: "publicLabel", label: "Label", type: "text" },
          { key: "reservationKind", label: "Kind", type: "status" },
          { key: "status", label: "Status", type: "status" },
          { key: "startsAt", label: "Starts", type: "date" },
          { key: "endsAt", label: "Ends", type: "date" },
        ],
      },
    ],
    dashboards: [
      {
        key: "overview",
        label: "Overview",
        widgets: [
          { kind: "metric", metricKey: "total_reservations" },
          { kind: "metric", metricKey: "in_range" },
          { kind: "metric", metricKey: "pending" },
          { kind: "timeseries", seriesKey: "reservations_daily", spanColumns: 3 },
          { kind: "breakdown", breakdownKey: "status_split" },
          { kind: "table", tableKey: "reservations_list", spanColumns: 3, maxRows: 100 },
        ],
      },
    ],
    async loader(ctx) {
      return tryLoad(async () => {
        const supabase = await createSupabaseServer();
        const snap = emptySnapshot();

        const { data: reservations } = await supabase
          .schema("facilities").from("reservations")
          .select("id, reservation_kind, status, starts_at_utc, ends_at_utc, public_label")
          .eq("space_id", input.spaceId)
          .order("starts_at_utc", { ascending: false })
          .limit(2000);
        const list = reservations ?? [];

        const pending = list.filter((r) => (r.status as string) === "pending").length;
        snap.metrics.total_reservations = { value: list.length };
        snap.metrics.pending = { value: pending };

        const times = list.map((r) => r.starts_at_utc as string);
        const prev = previousRange(ctx);
        snap.metrics.in_range = {
          value: countInRange(times, ctx.rangeStart, ctx.rangeEnd),
          previous: countInRange(times, prev.start, prev.end),
        };

        snap.series.reservations_daily = {
          points: bucketDaily(
            times.filter((t) => t.slice(0, 10) >= ctx.rangeStart && t.slice(0, 10) <= ctx.rangeEnd),
            ctx
          ),
        };

        snap.breakdowns.status_split = {
          segments: groupBy(list, (r) => ((r.status as string) || "pending") as string),
        };

        snap.tables.reservations_list = {
          total: list.length,
          rows: list.slice(0, 200).map((r) => ({
            id: r.id,
            publicLabel: r.public_label ?? "—",
            reservationKind: r.reservation_kind,
            status: r.status,
            startsAt: r.starts_at_utc,
            endsAt: r.ends_at_utc,
          })),
        };

        return snap;
      }, emptySnapshot());
    },
  };
}
