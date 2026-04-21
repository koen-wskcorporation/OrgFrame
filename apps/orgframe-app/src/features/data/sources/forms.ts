import { createSupabaseServer } from "@/src/shared/data-api/server";
import type { DataSourceDefinition } from "@/src/features/data/registry/types";
import { bucketDaily, countInRange, emptySnapshot, groupBy, previousRange, tryLoad } from "@/src/features/data/sources/shared";

export const formsDataSource: DataSourceDefinition = {
  key: "forms",
  label: "Forms",
  description: "Registration forms and submissions.",
  icon: "file-text",
  kind: "tool",
  permissions: ["forms.read", "forms.write"],
  metrics: [
    { key: "total_forms", label: "Forms" },
    { key: "published_forms", label: "Published", goodDirection: "up" },
    { key: "submissions_in_range", label: "Submissions in range", goodDirection: "up" },
    { key: "approved_rate", label: "Approved %", format: "percent", goodDirection: "up" },
  ],
  series: [{ key: "submissions_daily", label: "Submissions over time", kind: "line" }],
  breakdowns: [
    { key: "form_kind", label: "By form type" },
    { key: "submission_status", label: "Submissions by status" },
  ],
  tables: [
    {
      key: "forms_list",
      label: "Forms",
      defaultSortKey: "updatedAt",
      defaultSortDirection: "desc",
      columns: [
        { key: "name", label: "Name", type: "text" },
        { key: "status", label: "Status", type: "status" },
        { key: "formKind", label: "Type", type: "text" },
        { key: "submissionCount", label: "Submissions", type: "number" },
        { key: "updatedAt", label: "Updated", type: "date" },
      ],
    },
  ],
  dashboards: [
    {
      key: "overview",
      label: "Overview",
      widgets: [
        { kind: "metric", metricKey: "total_forms" },
        { kind: "metric", metricKey: "published_forms" },
        { kind: "metric", metricKey: "submissions_in_range" },
        { kind: "metric", metricKey: "approved_rate" },
        { kind: "timeseries", seriesKey: "submissions_daily", spanColumns: 2 },
        { kind: "breakdown", breakdownKey: "form_kind" },
        { kind: "breakdown", breakdownKey: "submission_status" },
        { kind: "table", tableKey: "forms_list", spanColumns: 3, maxRows: 25 },
      ],
    },
  ],
  async loader(ctx) {
    return tryLoad(async () => {
      const supabase = await createSupabaseServer();
      const snap = emptySnapshot();

      const { data: forms } = await supabase
        .schema("forms").from("org_forms")
        .select("id, name, status, form_kind, created_at, updated_at")
        .eq("org_id", ctx.orgId);
      const formsList = forms ?? [];

      const { data: subs } = await supabase
        .schema("forms").from("org_form_submissions")
        .select("id, form_id, status, created_at")
        .eq("org_id", ctx.orgId);
      const subsList = subs ?? [];

      const published = formsList.filter((f) => (f.status as string) === "published").length;
      snap.metrics.total_forms = { value: formsList.length };
      snap.metrics.published_forms = { value: published };

      const subTimes = subsList.map((s) => s.created_at as string);
      const prev = previousRange(ctx);
      snap.metrics.submissions_in_range = {
        value: countInRange(subTimes, ctx.rangeStart, ctx.rangeEnd),
        previous: countInRange(subTimes, prev.start, prev.end),
      };

      const inRange = subsList.filter((s) => {
        const day = (s.created_at as string).slice(0, 10);
        return day >= ctx.rangeStart && day <= ctx.rangeEnd;
      });
      const approved = inRange.filter((s) => (s.status as string) === "approved").length;
      snap.metrics.approved_rate = { value: inRange.length === 0 ? 0 : approved / inRange.length };

      snap.series.submissions_daily = {
        points: bucketDaily(
          inRange.map((s) => s.created_at as string),
          ctx
        ),
      };

      snap.breakdowns.form_kind = {
        segments: groupBy(formsList, (f) => ((f.form_kind as string) || "generic") as string),
      };
      snap.breakdowns.submission_status = {
        segments: groupBy(subsList, (s) => ((s.status as string) || "submitted") as string),
      };

      const countsByForm = new Map<string, number>();
      for (const s of subsList) countsByForm.set(s.form_id as string, (countsByForm.get(s.form_id as string) ?? 0) + 1);

      snap.tables.forms_list = {
        total: formsList.length,
        rows: formsList.map((f) => ({
          id: f.id,
          name: f.name,
          status: f.status,
          formKind: f.form_kind,
          submissionCount: countsByForm.get(f.id as string) ?? 0,
          updatedAt: f.updated_at,
        })),
      };

      return snap;
    }, emptySnapshot());
  },
};
