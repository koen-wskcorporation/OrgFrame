import { createSupabaseServer } from "@/src/shared/data-api/server";
import type { DataSourceDefinition } from "@/src/features/data/registry/types";
import { bucketDaily, countInRange, emptySnapshot, groupBy, previousRange, tryLoad } from "@/src/features/data/sources/shared";

export const peopleDataSource: DataSourceDefinition = {
  key: "people",
  label: "People",
  description: "Members, profiles, and linked contacts.",
  icon: "users",
  kind: "tool",
  permissions: ["people.read", "people.write"],
  metrics: [
    { key: "total_members", label: "Members" },
    { key: "total_profiles", label: "Linked profiles" },
    { key: "new_in_range", label: "New in range", goodDirection: "up" },
  ],
  series: [{ key: "joins_daily", label: "New members", kind: "line" }],
  breakdowns: [
    { key: "role_split", label: "By role" },
    { key: "profile_kind", label: "Profiles by type" },
  ],
  tables: [
    {
      key: "members",
      label: "Members",
      defaultSortKey: "joinedAt",
      defaultSortDirection: "desc",
      columns: [
        { key: "role", label: "Role", type: "status" },
        { key: "joinedAt", label: "Joined", type: "date" },
        { key: "userId", label: "User ID", type: "text", defaultVisible: false },
      ],
    },
  ],
  dashboards: [
    {
      key: "overview",
      label: "Overview",
      widgets: [
        { kind: "metric", metricKey: "total_members" },
        { kind: "metric", metricKey: "total_profiles" },
        { kind: "metric", metricKey: "new_in_range" },
        { kind: "timeseries", seriesKey: "joins_daily", spanColumns: 2 },
        { kind: "breakdown", breakdownKey: "role_split" },
        { kind: "breakdown", breakdownKey: "profile_kind" },
        { kind: "table", tableKey: "members", spanColumns: 3, maxRows: 25 },
      ],
    },
  ],
  async loader(ctx) {
    return tryLoad(async () => {
      const supabase = await createSupabaseServer();
      const snap = emptySnapshot();

      const { data: memberships } = await supabase
        .schema("orgs").from("memberships")
        .select("user_id, role, created_at")
        .eq("org_id", ctx.orgId);

      const list = memberships ?? [];

      snap.metrics.total_members = { value: list.length };

      const joinedCol = (m: Record<string, unknown>) => (m.created_at as string) ?? "";
      const joinTimes = list.map(joinedCol).filter(Boolean);

      const prev = previousRange(ctx);
      snap.metrics.new_in_range = {
        value: countInRange(joinTimes, ctx.rangeStart, ctx.rangeEnd),
        previous: countInRange(joinTimes, prev.start, prev.end),
      };

      snap.series.joins_daily = {
        points: bucketDaily(
          joinTimes.filter((ts) => ts.slice(0, 10) >= ctx.rangeStart && ts.slice(0, 10) <= ctx.rangeEnd),
          ctx
        ),
      };

      snap.breakdowns.role_split = {
        segments: groupBy(list, (m) => ((m.role as string) || "member") as string),
      };

      const { data: profiles } = await supabase
        .schema("people").from("profiles")
        .select("id, profile_kind, org_id")
        .eq("org_id", ctx.orgId);
      const profilesList = profiles ?? [];
      snap.metrics.total_profiles = { value: profilesList.length };
      snap.breakdowns.profile_kind = {
        segments: groupBy(profilesList, (p) => ((p.profile_kind as string) || "unknown") as string),
      };

      snap.tables.members = {
        total: list.length,
        rows: list.map((m, i) => ({
          id: `${m.user_id ?? i}`,
          userId: m.user_id,
          role: m.role,
          joinedAt: joinedCol(m),
        })),
      };

      return snap;
    }, emptySnapshot());
  },
};
