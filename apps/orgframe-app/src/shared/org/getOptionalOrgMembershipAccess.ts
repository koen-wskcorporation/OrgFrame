import { cache } from "react";
import { createDataApiServiceRoleClient, createSupabaseServer } from "@/src/shared/data-api/server";
import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";
import { resolveOrgRolePermissions } from "@/src/shared/org/customRoles";
import type { OrgRole, Permission } from "@/src/features/core/access";
import type { SessionUser } from "@/src/features/core/auth/server/getSessionUser";

export type OrgMembershipAccess = {
  role: OrgRole;
  permissions: Permission[];
};

async function resolveOptionalOrgMembershipAccess(orgId: string, sessionUserId: string | null): Promise<OrgMembershipAccess | null> {
  if (!sessionUserId) {
    return null;
  }

  const supabase = await createSupabaseServer();
  const { data: membership, error } = await supabase
    .schema("orgs").from("org_memberships")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", sessionUserId)
    .maybeSingle();

  let resolvedMembership = membership;

  if (error || !resolvedMembership) {
    const serviceRole = createDataApiServiceRoleClient();
    const { data: serviceRoleMembership, error: serviceRoleError } = await serviceRole
      .schema("orgs").from("org_memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", sessionUserId)
      .maybeSingle();

    if (serviceRoleError || !serviceRoleMembership) {
      return null;
    }

    resolvedMembership = serviceRoleMembership;
  }

  const role = resolvedMembership.role as OrgRole;
  const permissions = await resolveOrgRolePermissions(supabase, orgId, role);

  return {
    role,
    permissions
  };
}

const resolveOptionalOrgMembershipAccessCached = cache(resolveOptionalOrgMembershipAccess);

export async function getOptionalOrgMembershipAccess(orgId: string, options?: { sessionUser?: SessionUser | null }): Promise<OrgMembershipAccess | null> {
  const sessionUser = options?.sessionUser ?? (await getSessionUser());
  return resolveOptionalOrgMembershipAccessCached(orgId, sessionUser?.id ?? null);
}
