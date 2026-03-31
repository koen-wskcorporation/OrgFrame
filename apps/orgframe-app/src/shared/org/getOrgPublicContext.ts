import { cache } from "react";
import { notFound } from "next/navigation";
import { createSupabaseServer } from "@/src/shared/data-api/server";
import { getGoverningBodyLogoUrl } from "@/src/shared/branding/getGoverningBodyLogoUrl";
import { resolveOrgToolAvailability } from "@/src/shared/org/features";
import { isReservedOrgSlug } from "@/src/shared/org/reservedSlugs";
import type { OrgBranding, OrgGoverningBody, OrgPublicContext } from "@/src/shared/org/types";

function mapBranding(org: {
  logo_path?: string | null;
  icon_path?: string | null;
  brand_primary?: string | null;
}): OrgBranding {
  return {
    logoPath: org.logo_path ?? null,
    iconPath: org.icon_path ?? null,
    accent: org.brand_primary ?? null
  };
}

function mapGoverningBody(governingBody: unknown): OrgGoverningBody | null {
  if (!governingBody || typeof governingBody !== "object") {
    return null;
  }

  const record = Array.isArray(governingBody) ? governingBody[0] : governingBody;

  if (!record || typeof record !== "object") {
    return null;
  }

  const mapped = record as {
    id?: string;
    slug?: string;
    name?: string;
    logo_path?: string;
  };

  if (!mapped.id || !mapped.slug || !mapped.name || !mapped.logo_path) {
    return null;
  }

  return {
    id: mapped.id,
    slug: mapped.slug,
    name: mapped.name,
    logoPath: mapped.logo_path,
    logoUrl: getGoverningBodyLogoUrl(mapped.logo_path)
  };
}

export const getOrgPublicContext = cache(async (orgSlug: string): Promise<OrgPublicContext> => {
  if (isReservedOrgSlug(orgSlug)) {
    notFound();
  }

  const supabase = await createSupabaseServer();
  const { data: org, error: orgError } = await supabase
    .schema("orgs").from("orgs")
    .select("id, slug, name, logo_path, icon_path, brand_primary, features_json, governing_body:governing_bodies!orgs_governing_body_id_fkey(id, slug, name, logo_path)")
    .eq("slug", orgSlug)
    .maybeSingle();

  if (orgError) {
    throw new Error(`Failed to load org public context: ${orgError.message}`);
  }

  if (!org) {
    notFound();
  }

  return {
    orgId: org.id,
    orgSlug: org.slug,
    orgName: org.name,
    branding: mapBranding(org),
    governingBody: mapGoverningBody(org.governing_body),
    toolAvailability: resolveOrgToolAvailability(org.features_json)
  };
});
