import type { Permission } from "@/src/features/core/access";
import type { WidgetType } from "@/src/features/manage-dashboard/types";
import { hasAnyPermission, widgetMetadata } from "@/src/features/manage-dashboard/widgets/metadata";
import { DEFAULT_METRIC_SOURCE, METRIC_SOURCES, type MetricCardData } from "@/src/features/manage-dashboard/widgets/metric-sources";
import { createSupabaseServer } from "@/src/shared/data-api/server";

export type WidgetLoadContext = {
  orgId: string;
  orgSlug: string;
  permissions: Permission[];
  settings?: Record<string, unknown>;
};

export type WidgetPermissionDenied = { ok: false; error: "PERMISSION_DENIED" };
export type WidgetErrored = { ok: false; error: "ERROR"; message: string };
export type WidgetOk<TData> = { ok: true; data: TData };
export type WidgetData<TData = unknown> = WidgetOk<TData> | WidgetPermissionDenied | WidgetErrored;

function denied(): WidgetPermissionDenied {
  return { ok: false, error: "PERMISSION_DENIED" };
}

async function countRows(schema: string, table: string, filters: Array<{ field: string; value: string }>) {
  const supabase = await createSupabaseServer();
  let query = supabase.schema(schema).from(table).select("id", { count: "exact", head: true });
  for (const f of filters) {
    query = query.eq(f.field, f.value);
  }
  const { count } = await query;
  return count ?? 0;
}

async function loadMetricCard(ctx: WidgetLoadContext): Promise<MetricCardData> {
  const sourceValue = typeof ctx.settings?.source === "string" ? (ctx.settings.source as string) : DEFAULT_METRIC_SOURCE;
  const source = METRIC_SOURCES.find((m) => m.value === sourceValue) ?? METRIC_SOURCES[0];
  const label = typeof ctx.settings?.label === "string" && (ctx.settings.label as string).trim().length > 0
    ? (ctx.settings.label as string).trim()
    : source.label;

  if (!hasAnyPermission(ctx.permissions, source.requiredAnyPermission)) {
    return { source: source.value, label, value: null };
  }

  const value = await computeMetric(source.value, ctx);
  return { source: source.value, label, value };
}

async function computeMetric(source: string, ctx: WidgetLoadContext): Promise<number> {
  switch (source) {
    case "forms_total":
      return countRows("forms", "org_forms", [{ field: "org_id", value: ctx.orgId }]);
    case "forms_published":
      return countRows("forms", "org_forms", [{ field: "org_id", value: ctx.orgId }, { field: "status", value: "published" }]);
    case "forms_draft":
      return countRows("forms", "org_forms", [{ field: "org_id", value: ctx.orgId }, { field: "status", value: "draft" }]);
    case "forms_submissions":
      return countRows("forms", "org_form_submissions", [{ field: "org_id", value: ctx.orgId }]);
    case "programs_total":
      return countRows("programs", "programs", [{ field: "org_id", value: ctx.orgId }]);
    case "programs_published":
      return countRows("programs", "programs", [{ field: "org_id", value: ctx.orgId }, { field: "status", value: "published" }]);
    case "programs_draft":
      return countRows("programs", "programs", [{ field: "org_id", value: ctx.orgId }, { field: "status", value: "draft" }]);
    case "events_total":
      return countRows("calendar", "calendar_items", [{ field: "org_id", value: ctx.orgId }]);
    case "events_upcoming": {
      const supabase = await createSupabaseServer();
      const nowIso = new Date().toISOString();
      const horizon = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .schema("calendar")
        .from("calendar_item_occurrences")
        .select("id", { count: "exact", head: true })
        .eq("org_id", ctx.orgId)
        .gte("starts_at_utc", nowIso)
        .lte("starts_at_utc", horizon);
      return count ?? 0;
    }
    default:
      return 0;
  }
}

export async function loadWidgetData(type: WidgetType, ctx: WidgetLoadContext): Promise<WidgetData> {
  const meta = widgetMetadata[type];
  if (!hasAnyPermission(ctx.permissions, meta.requiredAnyPermission)) {
    return denied();
  }
  try {
    switch (type) {
      case "metric-card":
        return { ok: true, data: await loadMetricCard(ctx) };
      default:
        return { ok: false, error: "ERROR", message: "Unknown widget type" };
    }
  } catch (error) {
    return { ok: false, error: "ERROR", message: error instanceof Error ? error.message : String(error) };
  }
}
