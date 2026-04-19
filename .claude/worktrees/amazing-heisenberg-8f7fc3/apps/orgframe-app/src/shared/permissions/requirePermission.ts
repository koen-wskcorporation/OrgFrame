import { redirect } from "next/navigation";
import type { Permission } from "@/src/features/core/access";
import { can } from "@/src/shared/permissions/can";

export function requirePermission(grantedPermissions: Permission[], permission: Permission | Permission[]) {
  if (!can(grantedPermissions, permission)) {
    redirect("/forbidden");
  }
}
