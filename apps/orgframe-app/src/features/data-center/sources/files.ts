import { createSupabaseServer } from "@/src/shared/data-api/server";
import type { DataSourceDefinition } from "@/src/features/data-center/registry/types";
import { bucketDaily, countInRange, emptySnapshot, groupBy, previousRange, tryLoad } from "@/src/features/data-center/sources/shared";

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export const filesDataSource: DataSourceDefinition = {
  key: "files",
  label: "Files",
  description: "Storage usage and file activity.",
  icon: "file-text",
  kind: "tool",
  permissions: ["org.manage.read"],
  metrics: [
    { key: "total_files", label: "Files" },
    { key: "total_bytes", label: "Total storage" },
    { key: "uploads_in_range", label: "Uploads in range", goodDirection: "up" },
    { key: "folders_count", label: "Folders" },
  ],
  series: [{ key: "uploads_daily", label: "Uploads over time", kind: "line" }],
  breakdowns: [
    { key: "access_tag", label: "By access tag" },
    { key: "mime_group", label: "By type" },
  ],
  tables: [
    {
      key: "recent_files",
      label: "Recent files",
      defaultSortKey: "createdAt",
      defaultSortDirection: "desc",
      columns: [
        { key: "name", label: "Name", type: "text" },
        { key: "mimeType", label: "Type", type: "text" },
        { key: "accessTag", label: "Access", type: "status" },
        { key: "sizeLabel", label: "Size", type: "text" },
        { key: "createdAt", label: "Uploaded", type: "date" },
      ],
    },
  ],
  dashboards: [
    {
      key: "overview",
      label: "Overview",
      widgets: [
        { kind: "metric", metricKey: "total_files" },
        { kind: "metric", metricKey: "total_bytes" },
        { kind: "metric", metricKey: "uploads_in_range" },
        { kind: "metric", metricKey: "folders_count" },
        { kind: "timeseries", seriesKey: "uploads_daily", spanColumns: 2 },
        { kind: "breakdown", breakdownKey: "access_tag" },
        { kind: "breakdown", breakdownKey: "mime_group" },
        { kind: "table", tableKey: "recent_files", spanColumns: 3, maxRows: 25 },
      ],
    },
  ],
  async loader(ctx) {
    return tryLoad(async () => {
      const supabase = await createSupabaseServer();
      const snap = emptySnapshot();

      const { data: files } = await supabase
        .schema("files").from("app_files")
        .select("id, name, mime_type, size_bytes, access_tag, created_at")
        .eq("org_id", ctx.orgId)
        .order("created_at", { ascending: false })
        .limit(2000);
      const list = files ?? [];

      const { count: folderCount } = await supabase
        .schema("files").from("app_file_folders")
        .select("id", { count: "exact", head: true })
        .eq("org_id", ctx.orgId);

      const totalBytes = list.reduce((sum, f) => sum + Number(f.size_bytes ?? 0), 0);

      snap.metrics.total_files = { value: list.length };
      snap.metrics.total_bytes = { value: totalBytes };
      snap.metrics.folders_count = { value: folderCount ?? 0 };

      const times = list.map((f) => f.created_at as string);
      const prev = previousRange(ctx);
      snap.metrics.uploads_in_range = {
        value: countInRange(times, ctx.rangeStart, ctx.rangeEnd),
        previous: countInRange(times, prev.start, prev.end),
      };

      snap.series.uploads_daily = {
        points: bucketDaily(
          times.filter((t) => t.slice(0, 10) >= ctx.rangeStart && t.slice(0, 10) <= ctx.rangeEnd),
          ctx
        ),
      };

      snap.breakdowns.access_tag = {
        segments: groupBy(list, (f) => ((f.access_tag as string) || "manage") as string),
      };
      snap.breakdowns.mime_group = {
        segments: groupBy(list, (f) => {
          const m = (f.mime_type as string) ?? "other";
          return m.split("/")[0] || "other";
        }),
      };

      snap.tables.recent_files = {
        total: list.length,
        rows: list.slice(0, 100).map((f) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mime_type,
          accessTag: f.access_tag,
          sizeLabel: bytes(Number(f.size_bytes ?? 0)),
          createdAt: f.created_at,
        })),
      };

      return snap;
    }, emptySnapshot());
  },
};
