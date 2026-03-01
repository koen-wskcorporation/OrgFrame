import { redirect } from "next/navigation";
import type { Permission } from "@/modules/core/access";
import { can } from "@/lib/permissions/can";

export function requirePermission(grantedPermissions: Permission[], permission: Permission | Permission[]) {
  if (!can(grantedPermissions, permission)) {
    redirect("/forbidden");
  }
}
