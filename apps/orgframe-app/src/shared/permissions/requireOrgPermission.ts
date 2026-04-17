import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import type { Permission } from "@/src/features/core/access";
import { requirePermission } from "@/src/shared/permissions/requirePermission";

export async function requireOrgPermission(orgSlug: string, permission: Permission | Permission[]) {
  const orgContext = await getOrgAuthContext(orgSlug);
  requirePermission(orgContext.membershipPermissions, permission);

  return orgContext;
}
