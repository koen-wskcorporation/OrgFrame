import { createSupabaseServer } from "@/src/shared/data-api/server";
import { buildDefaultDashboardLayout, normalizeDashboardLayout, type DashboardLayout } from "@/src/features/manage-dashboard/types";

export async function loadDashboardLayout(input: { userId: string; orgId: string }): Promise<DashboardLayout> {
  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .schema("people")
    .from("user_org_dashboard_layouts")
    .select("config_json")
    .eq("user_id", input.userId)
    .eq("org_id", input.orgId)
    .maybeSingle();

  if (!data?.config_json) {
    return buildDefaultDashboardLayout();
  }
  const normalized = normalizeDashboardLayout(data.config_json);
  if (normalized.widgets.length === 0) {
    return buildDefaultDashboardLayout();
  }
  return normalized;
}

export async function saveDashboardLayout(input: { userId: string; orgId: string; layout: DashboardLayout }) {
  const normalized = normalizeDashboardLayout(input.layout);
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .schema("people")
    .from("user_org_dashboard_layouts")
    .upsert(
      {
        user_id: input.userId,
        org_id: input.orgId,
        config_json: normalized
      },
      { onConflict: "user_id,org_id" }
    );

  if (error) {
    throw new Error(`Unable to save dashboard layout: ${error.message}`);
  }
  return normalized;
}
