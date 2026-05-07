"use server";

import { revalidatePath } from "next/cache";
import { createDataApiServiceRoleClient } from "@/src/shared/data-api/server";
import { requirePlatformAdmin } from "@/src/shared/auth/requirePlatformAdmin";
import { orgToolKeys, type OrgToolKey } from "@/src/features/core/config/tools";

export async function setOrgToolsAction(orgId: string, enabledTools: OrgToolKey[]) {
  await requirePlatformAdmin();

  const enabledSet = new Set(enabledTools.filter((key) => orgToolKeys.includes(key)));
  const tools: Record<OrgToolKey, boolean> = {} as Record<OrgToolKey, boolean>;
  for (const key of orgToolKeys) {
    tools[key] = enabledSet.has(key);
  }

  const supabase = createDataApiServiceRoleClient();
  const { error } = await supabase
    .schema("orgs")
    .from("orgs")
    .update({ features_json: { tools } })
    .eq("id", orgId);

  if (error) {
    throw new Error(`Failed to update org features: ${error.message}`);
  }

  revalidatePath("/admin/orgs");
  revalidatePath("/", "layout");
  return { ok: true as const };
}
