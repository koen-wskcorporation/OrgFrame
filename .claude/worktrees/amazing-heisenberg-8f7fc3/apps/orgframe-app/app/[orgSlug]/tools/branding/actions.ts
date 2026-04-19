"use server";

import { redirect } from "next/navigation";
import { rethrowIfNavigationError } from "@/src/shared/navigation/rethrowIfNavigationError";
import { isValidHexColor } from "@/src/shared/branding/applyBrandingVars";
import { requireOrgToolEnabled } from "@/src/shared/org/requireOrgToolEnabled";
import { requireOrgPermission } from "@/src/shared/permissions/requireOrgPermission";
import { createSupabaseServer } from "@/src/shared/data-api/server";

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
    requireOrgToolEnabled(orgContext.toolAvailability, "branding");

    const accent = getField(formData, "accent");

    if (accent && !isValidHexColor(accent)) {
      redirect(`/tools/branding?error=invalid_accent`);
    }

    const logoPath = getOptionalPath(formData, "logoPath");
    const iconPath = getOptionalPath(formData, "iconPath");

    const updates: Record<string, string | null> = {
      brand_primary: accent || null,
      logo_path: logoPath,
      icon_path: iconPath
    };

    const supabase = await createSupabaseServer();
    const { error } = await supabase.schema("orgs").from("orgs").update(updates).eq("id", orgContext.orgId);

    if (error) {
      redirect(`/tools/branding?error=save_failed`);
    }

    redirect(`/tools/branding?saved=1`);
  } catch (error) {
    rethrowIfNavigationError(error);
    redirect(`/tools/branding?error=save_failed`);
  }
}
