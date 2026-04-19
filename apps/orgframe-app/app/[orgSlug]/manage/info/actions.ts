"use server";

import { redirect } from "next/navigation";
import { rethrowIfNavigationError } from "@/src/shared/navigation/rethrowIfNavigationError";
import { requireOrgToolEnabled } from "@/src/shared/org/requireOrgToolEnabled";
import { requireOrgPermission } from "@/src/shared/permissions/requireOrgPermission";
import { isOrgType } from "@/src/shared/org/orgTypes";
import { createSupabaseServer } from "@/src/shared/data-api/server";

function getField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function saveOrgInfoAction(orgSlug: string, formData: FormData) {
  try {
    const orgContext = await requireOrgPermission(orgSlug, "org.branding.write");
    requireOrgToolEnabled(orgContext.toolAvailability, "info");
    const governingBodyId = getField(formData, "governingBodyId");
    const orgTypeRaw = getField(formData, "orgType");

    if (orgTypeRaw && !isOrgType(orgTypeRaw)) {
      redirect(`/manage/info?error=save_failed`);
    }

    const supabase = await createSupabaseServer();
    const { error } = await supabase
      .schema("orgs").from("orgs")
      .update({
        governing_body_id: governingBodyId || null,
        org_type: orgTypeRaw || null
      })
      .eq("id", orgContext.orgId);

    if (error) {
      redirect(`/manage/info?error=save_failed`);
    }

    redirect(`/manage/info?saved=1`);
  } catch (error) {
    rethrowIfNavigationError(error);
    redirect(`/manage/info?error=save_failed`);
  }
}
