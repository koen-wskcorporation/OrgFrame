import { createSupabaseServer } from "@/src/shared/data-api/server";
import type { DataSourceDefinition } from "@/src/features/data/registry/types";
import { bucketDaily, countInRange, emptySnapshot, groupBy, previousRange, tryLoad } from "@/src/features/data/sources/shared";

export const calendarDataSource: DataSourceDefinition = {
  key: "calendar",
  label: "Calendar",
  description: "Events, practices, games, and occurrences.",
  icon: "calendar",
  kind: "tool",
  permissions: ["calendar.read", "calendar.write", "events.read", "events.write"],
  metrics: [
    { key: "items_total", label: "Calendar items" },
    { key: "occurrences_in_range", label: "Occurrences in range", goodDirection: "up" },
    { key: "upcoming_occurrences", label: "Upcoming", goodDirection: "up" },
  ],
  series: [{ key: "occurrences_daily", label: "Occurrences", kind: "line" }],
  breakdowns: [
    { key: "item_type", label: "By type" },
    { key: "status_split", label: "By status" },
  ],
  tables: [
    {
      key: "upcoming",
      label: "Upcoming occurrences",
      defaultSortKey: "startsAt",
      defaultSortDirection: "asc",
      columns: [
        { key: "title", label: "Title", type: "text" },
        { key: "itemType", label: "Type", type: "status" },
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
        { kind: "metric", metricKey: "items_total" },
        { kind: "metric", metricKey: "occurrences_in_range" },
        { kind: "metric", metricKey: "upcoming_occurrences" },
        { kind: "timeseries", seriesKey: "occurrences_daily", spanColumns: 3 },
        { kind: "breakdown", breakdownKey: "item_type" },
        { kind: "breakdown", breakdownKey: "status_split" },
        { kind: "table", tableKey: "upcoming", spanColumns: 3, maxRows: 25 },
      ],
    },
  ],
  async loader(ctx) {
    return tryLoad(async () => {
      const supabase = await createSupabaseServer();
      const snap = emptySnapshot();

      const { data: items } = await supabase
        .schema("calendar").from("calendar_items")
        .select("id, title, item_type, status, org_id")
        .eq("org_id", ctx.orgId);
      const itemList = items ?? [];
      const itemMap = new Map<string, Record<string, unknown>>();
      for (const i of itemList) itemMap.set(i.id as string, i);

      const { data: occs } = await supabase
        .schema("calendar").from("calendar_item_occurrences")
        .select("id, item_id, starts_at_utc, ends_at_utc, status")
        .eq("org_id", ctx.orgId)
        .gte("starts_at_utc", new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString())
        .order("starts_at_utc", { ascending: true })
        .limit(2000);
      const occList = occs ?? [];

      snap.metrics.items_total = { value: itemList.length };

      const occTimes = occList.map((o) => o.starts_at_utc as string);
      const prev = previousRange(ctx);
      snap.metrics.occurrences_in_range = {
        value: countInRange(occTimes, ctx.rangeStart, ctx.rangeEnd),
        previous: countInRange(occTimes, prev.start, prev.end),
      };

      const nowIso = new Date().toISOString();
      const upcoming = occList.filter((o) => (o.starts_at_utc as string) >= nowIso);
      snap.metrics.upcoming_occurrences = { value: upcoming.length };

      snap.series.occurrences_daily = {
        points: bucketDaily(
          occList
            .filter((o) => {
              const day = (o.starts_at_utc as string).slice(0, 10);
              return day >= ctx.rangeStart && day <= ctx.rangeEnd;
            })
            .map((o) => o.starts_at_utc as string),
          ctx
        ),
      };

      snap.breakdowns.item_type = {
        segments: groupBy(itemList, (i) => ((i.item_type as string) || "event") as string),
      };
      snap.breakdowns.status_split = {
        segments: groupBy(itemList, (i) => ((i.status as string) || "scheduled") as string),
      };

      snap.tables.upcoming = {
        total: upcoming.length,
        rows: upcoming.slice(0, 100).map((o) => {
          const item = itemMap.get(o.item_id as string);
          return {
            id: o.id,
            title: item?.title ?? "—",
            itemType: item?.item_type ?? "event",
            status: o.status,
            startsAt: o.starts_at_utc,
            endsAt: o.ends_at_utc,
          };
        }),
      };

      return snap;
    }, emptySnapshot());
  },
};
