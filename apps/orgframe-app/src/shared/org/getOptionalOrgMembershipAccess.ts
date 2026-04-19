import { cache } from "react";
import { createDataApiServiceRoleClient, createSupabaseServer } from "@/src/shared/data-api/server";
import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";
import { resolveOrgRolePermissions } from "@/src/shared/org/customRoles";
import { filterPermissionsByOrgTools, type OrgToolAvailability } from "@/src/features/core/config/tools";
import type { OrgRole, Permission } from "@/src/features/core/access";
import type { SessionUser } from "@/src/features/core/auth/server/getSessionUser";

export type OrgMembershipAccess = {
  role: OrgRole;
  permissions: Permission[];
};

async function resolveOptionalOrgMembershipAccess(orgId: string, sessionUserId: string | null, toolAvailability: OrgToolAvailability | null): Promise<OrgMembershipAccess | null> {
  if (!sessionUserId) {
    return null;
  }

  const supabase = await createSupabaseServer();
  const { data: membership, error } = await supabase
    .schema("orgs").from("memberships")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", sessionUserId)
    .maybeSingle();

  let resolvedMembership = membership;

  if (error || !resolvedMembership) {
    const serviceRole = createDataApiServiceRoleClient();
    const { data: serviceRoleMembership, error: serviceRoleError } = await serviceRole
      .schema("orgs").from("memberships")
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
  const basePermissions = await resolveOrgRolePermissions(supabase, orgId, role);
  const permissions = toolAvailability ? filterPermissionsByOrgTools(basePermissions, toolAvailability) : basePermissions;

  return {
    role,
    permissions
  };
}

const resolveOptionalOrgMembershipAccessCached = cache(resolveOptionalOrgMembershipAccess);

export async function getOptionalOrgMembershipAccess(
  orgId: string,
  options?: { sessionUser?: SessionUser | null; toolAvailability?: OrgToolAvailability | null }
): Promise<OrgMembershipAccess | null> {
  const sessionUser = options?.sessionUser ?? (await getSessionUser());
  return resolveOptionalOrgMembershipAccessCached(orgId, sessionUser?.id ?? null, options?.toolAvailability ?? null);
}
