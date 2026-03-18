"use server";

import { redirect } from "next/navigation";
import { rethrowIfNavigationError } from "@/lib/actions/rethrowIfNavigationError";
import { requireOrgPermission } from "@/lib/permissions/requireOrgPermission";
import { createSupabaseServer } from "@/lib/supabase/server";

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
      .from("orgs")
      .update({
        governing_body_id: governingBodyId || null
      })
      .eq("id", orgContext.orgId);

    if (error) {
      redirect(`/${orgSlug}/manage/info?error=save_failed`);
    }

    redirect(`/${orgSlug}/manage/info?saved=1`);
  } catch (error) {
    rethrowIfNavigationError(error);
    redirect(`/${orgSlug}/manage/info?error=save_failed`);
  }
}
