import { hasPermissions, type Permission } from "@/modules/core/access";

export function can(grantedPermissions: Permission[], permission: Permission | Permission[]) {
  const requiredPermissions = Array.isArray(permission) ? permission : [permission];
  return hasPermissions(grantedPermissions, requiredPermissions);
}
