"use server";

import { redirect } from "next/navigation";
import { rethrowIfNavigationError } from "@/lib/actions/rethrowIfNavigationError";
import { isValidHexColor } from "@/lib/branding/applyBrandingVars";
import { requireOrgPermission } from "@/lib/permissions/requireOrgPermission";
import { createSupabaseServer } from "@/lib/supabase/server";

function getField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getOptionalPath(formData: FormData, key: string) {
  const value = getField(formData, key);
  return value || null;
}

export async function saveOrgBrandingAction(orgSlug: string, formData: FormData) {
  try {
    const orgContext = await requireOrgPermission(orgSlug, "org.branding.write");

    const accent = getField(formData, "accent");

    if (accent && !isValidHexColor(accent)) {
      redirect(`/${orgSlug}/manage/branding?error=invalid_accent`);
    }

    const logoPath = getOptionalPath(formData, "logoPath");
    const iconPath = getOptionalPath(formData, "iconPath");

    const updates: Record<string, string | null> = {
      brand_primary: accent || null,
      logo_path: logoPath,
      icon_path: iconPath
    };

    const supabase = await createSupabaseServer();
    const { error } = await supabase.from("orgs").update(updates).eq("id", orgContext.orgId);

    if (error) {
      redirect(`/${orgSlug}/manage/branding?error=save_failed`);
    }

    redirect(`/${orgSlug}/manage/branding?saved=1`);
  } catch (error) {
    rethrowIfNavigationError(error);
    redirect(`/${orgSlug}/manage/branding?error=save_failed`);
  }
}
