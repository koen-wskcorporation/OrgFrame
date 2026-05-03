import { createSupabaseServer } from "@/src/shared/data-api/server";
import { emptyLayout, normalizeLayout, type DataCenterLayout } from "@/src/features/data-center/layout";
import type { DashboardPresetDef, ResolvedDataSource } from "@/src/features/data-center/registry/types";
import type { DataCenterWidgetInstance } from "@/src/features/data-center/layout";

export async function loadDataCenterLayout(input: { orgId: string; sourceKey: string }): Promise<DataCenterLayout> {
  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .schema("orgs")
    .from("org_data_center_layouts")
    .select("config_json")
    .eq("org_id", input.orgId)
    .eq("source_key", input.sourceKey)
    .maybeSingle();

  if (!data?.config_json) return emptyLayout;
  return normalizeLayout(data.config_json);
}

export async function saveDataCenterLayout(input: {
  orgId: string;
  sourceKey: string;
  userId: string;
  layout: DataCenterLayout;
}): Promise<DataCenterLayout> {
  const normalized = normalizeLayout(input.layout);
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .schema("orgs")
    .from("org_data_center_layouts")
    .upsert(
      {
        org_id: input.orgId,
        source_key: input.sourceKey,
        config_json: normalized,
        updated_by: input.userId,
      },
      { onConflict: "org_id,source_key" }
    );

  if (error) {
    throw new Error(`Unable to save data center layout: ${error.message}`);
  }
  return normalized;
}

function widgetFromPreset(preset: DashboardPresetDef): DataCenterWidgetInstance[] {
  return preset.widgets.map((w, idx) => {
    const id = `${preset.key}-${idx}`;
    if (w.kind === "metric") return { id, kind: "metric", refKey: w.metricKey, spanColumns: w.spanColumns };
    if (w.kind === "timeseries") return { id, kind: "timeseries", refKey: w.seriesKey, spanColumns: w.spanColumns };
    if (w.kind === "breakdown") return { id, kind: "breakdown", refKey: w.breakdownKey, spanColumns: w.spanColumns };
    return { id, kind: "table", refKey: w.tableKey, spanColumns: w.spanColumns, maxRows: w.maxRows };
  });
}

/** Hydrate layout: if saved layout is empty, fall back to first dashboard preset. */
export function hydrateLayout(layout: DataCenterLayout, source: ResolvedDataSource): DataCenterLayout {
  if (layout.widgets.length > 0) return layout;
  const defaultPreset = source.dashboards[0];
  if (!defaultPreset) return layout;
  return { version: 1, widgets: widgetFromPreset(defaultPreset) };
}
