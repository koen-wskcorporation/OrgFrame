"use server";

import { redirect } from "next/navigation";
import { rethrowIfNavigationError } from "@/src/shared/navigation/rethrowIfNavigationError";
import { requireOrgPermission } from "@/src/shared/permissions/requireOrgPermission";
import { createSupabaseServer } from "@/src/shared/data-api/server";

function getField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function saveOrgGoverningBodyAction(orgSlug: string, formData: FormData) {
  try {
    const orgContext = await requireOrgPermission(orgSlug, "org.branding.write");
    const governingBodyId = getField(formData, "governingBodyId");

    const supabase = await createSupabaseServer();
    const { error } = await supabase
      .schema("orgs").from("orgs")
      .update({
        governing_body_id: governingBodyId || null
      })
      .eq("id", orgContext.orgId);

    if (error) {
      redirect(`/tools/info?error=save_failed`);
    }

    redirect(`/tools/info?saved=1`);
  } catch (error) {
    rethrowIfNavigationError(error);
    redirect(`/tools/info?error=save_failed`);
  }
}
