import { createSupabaseServer } from "@/src/shared/data-api/server";
import type { DataSourceDefinition } from "@/src/features/data-center/registry/types";
import { bucketDaily, countInRange, emptySnapshot, groupBy, previousRange, tryLoad } from "@/src/features/data-center/sources/shared";

export const communicationsDataSource: DataSourceDefinition = {
  key: "communications",
  label: "Communications",
  description: "Conversations, channels, and messages.",
  icon: "inbox",
  kind: "tool",
  permissions: ["communications.read", "communications.write"],
  metrics: [
    { key: "conversations_total", label: "Conversations" },
    { key: "open_conversations", label: "Open", goodDirection: "down" },
    { key: "messages_in_range", label: "Messages in range", goodDirection: "up" },
    { key: "channels_connected", label: "Channels connected" },
  ],
  series: [{ key: "messages_daily", label: "Messages over time", kind: "line" }],
  breakdowns: [
    { key: "channel_type", label: "By channel" },
    { key: "resolution_status", label: "Conversations by status" },
  ],
  tables: [
    {
      key: "recent_conversations",
      label: "Recent conversations",
      defaultSortKey: "lastMessageAt",
      defaultSortDirection: "desc",
      columns: [
        { key: "subject", label: "Subject", type: "text" },
        { key: "channelType", label: "Channel", type: "status" },
        { key: "resolutionStatus", label: "Status", type: "status" },
        { key: "lastMessageAt", label: "Last message", type: "date" },
      ],
    },
  ],
  dashboards: [
    {
      key: "overview",
      label: "Overview",
      widgets: [
        { kind: "metric", metricKey: "conversations_total" },
        { kind: "metric", metricKey: "open_conversations" },
        { kind: "metric", metricKey: "messages_in_range" },
        { kind: "metric", metricKey: "channels_connected" },
        { kind: "timeseries", seriesKey: "messages_daily", spanColumns: 2 },
        { kind: "breakdown", breakdownKey: "channel_type" },
        { kind: "breakdown", breakdownKey: "resolution_status" },
        { kind: "table", tableKey: "recent_conversations", spanColumns: 3, maxRows: 25 },
      ],
    },
  ],
  async loader(ctx) {
    return tryLoad(async () => {
      const supabase = await createSupabaseServer();
      const snap = emptySnapshot();

      const { data: convs } = await supabase
        .schema("communications").from("conversations")
        .select("id, channel_type, subject, resolution_status, last_message_at, archived_at, created_at")
        .eq("org_id", ctx.orgId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(2000);
      const convList = convs ?? [];

      const { data: msgs } = await supabase
        .schema("communications").from("messages")
        .select("id, sent_at, created_at")
        .eq("org_id", ctx.orgId)
        .order("sent_at", { ascending: false, nullsFirst: false })
        .limit(5000);
      const msgList = msgs ?? [];

      const { count: channelsCount } = await supabase
        .schema("communications").from("channel_integrations")
        .select("id", { count: "exact", head: true })
        .eq("org_id", ctx.orgId);

      const open = convList.filter((c) => (c.resolution_status as string) !== "resolved" && !c.archived_at).length;

      snap.metrics.conversations_total = { value: convList.length };
      snap.metrics.open_conversations = { value: open };
      snap.metrics.channels_connected = { value: channelsCount ?? 0 };

      const msgTimes = msgList.map((m) => ((m.sent_at as string) ?? (m.created_at as string)) ?? "").filter(Boolean);
      const prev = previousRange(ctx);
      snap.metrics.messages_in_range = {
        value: countInRange(msgTimes, ctx.rangeStart, ctx.rangeEnd),
        previous: countInRange(msgTimes, prev.start, prev.end),
      };

      snap.series.messages_daily = {
        points: bucketDaily(
          msgTimes.filter((t) => t.slice(0, 10) >= ctx.rangeStart && t.slice(0, 10) <= ctx.rangeEnd),
          ctx
        ),
      };

      snap.breakdowns.channel_type = {
        segments: groupBy(convList, (c) => ((c.channel_type as string) || "unknown") as string),
      };
      snap.breakdowns.resolution_status = {
        segments: groupBy(convList, (c) => ((c.resolution_status as string) || "open") as string),
      };

      snap.tables.recent_conversations = {
        total: convList.length,
        rows: convList.slice(0, 100).map((c) => ({
          id: c.id,
          subject: c.subject ?? "(no subject)",
          channelType: c.channel_type,
          resolutionStatus: c.resolution_status,
          lastMessageAt: c.last_message_at,
        })),
      };

      return snap;
    }, emptySnapshot());
  },
};
