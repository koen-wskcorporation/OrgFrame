import type { SupabaseClient } from "@supabase/supabase-js";
import { getDefaultRolePermissions, isPermission, type OrgRole, type Permission } from "@/modules/core/access";

export type OrgCustomRole = {
  id: string;
  orgId: string;
  roleKey: string;
  label: string;
  permissions: Permission[];
  createdAt: string;
  updatedAt: string;
};

type OrgCustomRoleRow = {
  id: string;
  org_id: string;
  role_key: string;
  label: string;
  permissions: unknown;
  created_at: string;
  updated_at: string;
};

const customRoleSelect = "id, org_id, role_key, label, permissions, created_at, updated_at";
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
  "events.read",
  "events.write"
];

function parsePermissions(value: unknown): Permission[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<Permission>();

  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    if (!isPermission(item)) {
      continue;
    }

    unique.add(item);
  }

  return [...unique];
}

function mapCustomRole(row: OrgCustomRoleRow | null): OrgCustomRole | null {
  if (!row) {
    return null;
  }

  if (!row.id || !row.org_id || !row.role_key || !row.label || !row.created_at || !row.updated_at) {
    return null;
  }

  return {
    id: row.id,
    orgId: row.org_id,
    roleKey: row.role_key,
    label: row.label,
    permissions: parsePermissions(row.permissions),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listOrgCustomRoles(supabase: SupabaseClient<any>, orgId: string): Promise<OrgCustomRole[]> {
  const { data, error } = await supabase.from("org_custom_roles").select(customRoleSelect).eq("org_id", orgId).order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).flatMap((row) => {
    const mapped = mapCustomRole(row as OrgCustomRoleRow);
    return mapped ? [mapped] : [];
  });
}

export async function findOrgCustomRoleByKey(supabase: SupabaseClient<any>, orgId: string, roleKey: string): Promise<OrgCustomRole | null> {
  const { data, error } = await supabase
    .from("org_custom_roles")
    .select(customRoleSelect)
    .eq("org_id", orgId)
    .eq("role_key", roleKey)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return mapCustomRole(data as OrgCustomRoleRow | null);
}

export async function resolveOrgRolePermissions(supabase: SupabaseClient<any>, orgId: string, roleKey: OrgRole): Promise<Permission[]> {
  const defaultPermissions = getDefaultRolePermissions(roleKey);

  if (defaultPermissions) {
    return defaultPermissions;
  }

  // Backward compatibility while migrations are rolling out.
  if (roleKey === "owner") {
    return getDefaultRolePermissions("admin") ?? [];
  }

  if (roleKey === "manager") {
    return legacyManagerPermissions;
  }

  try {
    const customRole = await findOrgCustomRoleByKey(supabase, orgId, roleKey);
    return customRole?.permissions ?? [];
  } catch (error) {
    if (error instanceof Error && error.message.includes("org_custom_roles")) {
      return [];
    }

    throw error;
  }
}
