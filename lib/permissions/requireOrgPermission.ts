import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import type { Permission } from "@/modules/core/access";
import { requirePermission } from "@/lib/auth/requirePermission";

export async function requireOrgPermission(orgSlug: string, permission: Permission | Permission[]) {
  const orgContext = await getOrgAuthContext(orgSlug);
  requirePermission(orgContext.membershipPermissions, permission);

  return orgContext;
}
