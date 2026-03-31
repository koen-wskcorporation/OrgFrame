import type { SupabaseClient } from "@supabase/supabase-js";
import { getDefaultRolePermissions, type OrgRole, type Permission } from "@/src/features/core/access";

export type OrgCustomRole = {
  id: string;
  orgId: string;
  roleKey: string;
  label: string;
  permissions: Permission[];
  createdAt: string;
  updatedAt: string;
};

const legacyManagerPermissions: Permission[] = [
  "org.dashboard.read",
  "org.manage.read",
  "org.branding.read",
  "org.pages.read",
  "org.pages.write",
  "programs.read",
  "programs.write",
  "forms.read",
  "forms.write",
  "calendar.read",
  "calendar.write",
  "events.read",
  "events.write"
];

export async function listOrgCustomRoles(_supabase: SupabaseClient<any>, _orgId: string): Promise<OrgCustomRole[]> {
  return [];
}

export async function findOrgCustomRoleByKey(_supabase: SupabaseClient<any>, _orgId: string, _roleKey: string): Promise<OrgCustomRole | null> {
  return null;
}

export async function resolveOrgRolePermissions(_supabase: SupabaseClient<any>, _orgId: string, roleKey: OrgRole): Promise<Permission[]> {
  // Backward compatibility for legacy membership rows that still use `user`.
  const normalizedRoleKey = roleKey === "user" ? "member" : roleKey;
  const defaultPermissions = getDefaultRolePermissions(normalizedRoleKey);

  if (defaultPermissions) {
    return defaultPermissions;
  }

  // Backward compatibility while legacy rows are normalized.
  if (normalizedRoleKey === "owner") {
    return getDefaultRolePermissions("admin") ?? [];
  }

  if (normalizedRoleKey === "manager") {
    return legacyManagerPermissions;
  }

  return [];
}
