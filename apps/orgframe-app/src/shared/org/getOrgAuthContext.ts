import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createDataApiServiceRoleClient, createSupabaseServer } from "@/src/shared/data-api/server";
import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";
import { resolveOrgRolePermissions } from "@/src/shared/org/customRoles";
import { getGoverningBodyLogoUrl } from "@/src/shared/branding/getGoverningBodyLogoUrl";
import { filterPermissionsByOrgTools, resolveOrgToolAvailability } from "@/src/features/core/config/tools";
import { isReservedOrgSlug } from "@/src/shared/org/reservedSlugs";
import { normalizeOrgType } from "@/src/shared/org/orgTypes";
import { getOrgDisplayHost } from "@/src/shared/org/orgDisplayHost";
import type { OrgRole } from "@/src/features/core/access";
import type { OrgAuthContext, OrgBranding, OrgGoverningBody } from "@/src/shared/org/types";

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

const getOrgAuthContextCached = cache(async (orgSlug: string): Promise<OrgAuthContext> => {
  if (isReservedOrgSlug(orgSlug)) {
    notFound();
  }

  const user = await getSessionUser();

  if (!user) {
    redirect("/auth");
  }

  const supabase = await createSupabaseServer();
  const { data: org, error: orgError } = await supabase
    .schema("orgs").from("orgs")
    .select("id, slug, name, org_type, logo_path, icon_path, brand_primary, features_json, governing_body:governing_bodies!orgs_governing_body_id_fkey(id, slug, name, logo_path)")
    .eq("slug", orgSlug)
    .maybeSingle();

  if (orgError) {
    throw new Error(`Failed to load org context: ${orgError.message}`);
  }

  if (!org) {
    notFound();
  }

  const { data: customDomainRow } = await supabase
    .schema("orgs").from("custom_domains")
    .select("domain")
    .eq("org_id", org.id)
    .eq("status", "verified")
    .maybeSingle();

  const customDomain = customDomainRow?.domain ?? null;

  const { data: membership, error: membershipError } = await supabase
    .schema("orgs").from("memberships")
    .select("role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .maybeSingle();

  let resolvedMembership = membership;

  if (membershipError || !resolvedMembership) {
    // Fallback path: if RLS policies drift, verify membership with service-role
    // but still scoped to the authenticated user id from this request.
    const serviceRole = createDataApiServiceRoleClient();
    const { data: serviceRoleMembership, error: serviceRoleMembershipError } = await serviceRole
      .schema("orgs").from("memberships")
      .select("role")
      .eq("org_id", org.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (serviceRoleMembershipError || !serviceRoleMembership) {
      redirect("/forbidden");
    }

    resolvedMembership = serviceRoleMembership;
  }

  const membershipRole = resolvedMembership.role as OrgRole;
  const toolAvailability = resolveOrgToolAvailability(org.features_json);
  const basePermissions = await resolveOrgRolePermissions(supabase, org.id, membershipRole);
  const membershipPermissions = filterPermissionsByOrgTools(basePermissions, toolAvailability);

  return {
    orgId: org.id,
    orgSlug: org.slug,
    orgName: org.name,
    orgType: normalizeOrgType(org.org_type),
    customDomain,
    displayHost: getOrgDisplayHost(org.slug, customDomain),
    userId: user.id,
    membershipRole,
    membershipPermissions,
    branding: mapBranding(org),
    governingBody: mapGoverningBody(org.governing_body),
    toolAvailability
  };
});

export async function getOrgAuthContext(orgSlug: string): Promise<OrgAuthContext> {
  return getOrgAuthContextCached(orgSlug);
}
