import { createSupabaseServer } from "@/src/shared/data-api/server";
import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";
import { normalizeOrgType, type OrgType } from "@/src/shared/org/orgTypes";
import { getOrgDisplayHost } from "@/src/shared/org/orgDisplayHost";
import type { OrgRole } from "@/src/features/core/access";

export type UserOrgMembership = {
  orgId: string;
  orgName: string;
  orgSlug: string;
  orgType: OrgType | null;
  role: OrgRole;
  logoPath: string | null;
  iconPath: string | null;
  customDomain: string | null;
  displayHost: string;
};

export async function listUserOrgs(): Promise<UserOrgMembership[]> {
  const user = await getSessionUser();

  if (!user) {
    return [];
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("orgs").from("memberships")
    .select("role, org:orgs!inner(id, slug, name, org_type, logo_path, icon_path)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list user orgs: ${error.message}`);
  }

  type OrgRow = {
    id: string;
    slug: string;
    name: string;
    org_type?: string | null;
    logo_path?: string | null;
    icon_path?: string | null;
  };

  const memberships = (data ?? []).flatMap((row) => {
    const nestedOrg = row.org as OrgRow | OrgRow[] | null;
    const org = Array.isArray(nestedOrg) ? nestedOrg[0] : nestedOrg;
    return org ? [{ org, role: row.role as OrgRole }] : [];
  });

  if (memberships.length === 0) {
    return [];
  }

  const { data: domainRows } = await supabase
    .schema("orgs").from("custom_domains")
    .select("org_id, domain")
    .in(
      "org_id",
      memberships.map((m) => m.org.id)
    )
    .eq("status", "verified");

  const customDomainByOrgId = new Map<string, string>(
    (domainRows ?? []).map((row) => [row.org_id as string, row.domain as string])
  );

  return memberships.map(({ org, role }) => {
    const customDomain = customDomainByOrgId.get(org.id) ?? null;
    return {
      orgId: org.id,
      orgName: org.name,
      orgSlug: org.slug,
      orgType: normalizeOrgType(org.org_type),
      role,
      logoPath: org.logo_path ?? null,
      iconPath: org.icon_path ?? null,
      customDomain,
      displayHost: getOrgDisplayHost(org.slug, customDomain)
    };
  });
}
