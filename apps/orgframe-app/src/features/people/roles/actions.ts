"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { rethrowIfNavigationError } from "@/src/shared/navigation/rethrowIfNavigationError";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { requireOrgToolEnabled } from "@/src/shared/org/requireOrgToolEnabled";
import { requirePermission } from "@/src/shared/permissions/requirePermission";
import { createSupabaseServerClient } from "@/src/shared/data-api/server";
import {
  allPermissions,
  getDefaultRoleLabel,
  getDefaultRolePermissions,
  isPermission,
  isReservedOrgRoleKey,
  isValidRoleKey,
  normalizeRoleKey,
  type Permission
} from "@/src/features/core/access";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type OrgRoleSource = "default" | "custom";

export type OrgRoleDefinition = {
  /** Stable id — for default roles a synthetic "role-<key>", for custom rows the row id. */
  id: string;
  roleKey: string;
  label: string;
  source: OrgRoleSource;
  permissions: Permission[];
  /** Default roles cannot have permissions or label edited; custom can. */
  editable: boolean;
  deletable: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

type RolesErrorCode =
  | "invalid_input"
  | "forbidden"
  | "not_found"
  | "duplicate_key"
  | "reserved_key"
  | "service_not_configured"
  | "action_failed";

type RolesResult<TData = undefined> =
  | { ok: true; data: TData }
  | { ok: false; code: RolesErrorCode; error: string };

function asFailure(code: RolesErrorCode, error: string): RolesResult<never> {
  return { ok: false, code, error };
}

// -----------------------------------------------------------------------------
// Permission checks
// -----------------------------------------------------------------------------

async function requireRolesReadContext(orgSlug: string) {
  const orgContext = await getOrgAuthContext(orgSlug);
  requireOrgToolEnabled(orgContext.toolAvailability, "people");
  // Reading the role list is gated on people.read so the directory + roles tab share auth.
  requirePermission(orgContext.membershipPermissions, "people.read");
  return orgContext;
}

async function requireRolesWriteContext(orgSlug: string) {
  const orgContext = await getOrgAuthContext(orgSlug);
  requireOrgToolEnabled(orgContext.toolAvailability, "people");
  // Creating/editing/deleting roles requires org.manage.read (admin-equivalent).
  requirePermission(orgContext.membershipPermissions, "org.manage.read");
  return orgContext;
}

// -----------------------------------------------------------------------------
// Default role definitions (admin / member / participant — built-in, read-only)
// -----------------------------------------------------------------------------

function buildDefaultRoles(): OrgRoleDefinition[] {
  return (["admin", "member"] as const).map((key) => ({
    id: `role-${key}`,
    roleKey: key,
    label: getDefaultRoleLabel(key),
    source: "default",
    permissions: getDefaultRolePermissions(key) ?? [],
    editable: false,
    deletable: false,
    createdAt: null,
    updatedAt: null
  }));
}

// -----------------------------------------------------------------------------
// listOrgRolesAction — default roles + custom roles for an org.
// -----------------------------------------------------------------------------

const listOrgRolesSchema = z.object({
  orgSlug: z.string().trim().min(1)
});

export async function listOrgRolesAction(
  input: z.input<typeof listOrgRolesSchema>
): Promise<RolesResult<{ roles: OrgRoleDefinition[] }>> {
  const parsed = listOrgRolesSchema.safeParse(input);
  if (!parsed.success) {
    return asFailure("invalid_input", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  try {
    const orgContext = await requireRolesReadContext(parsed.data.orgSlug);
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .schema("orgs")
      .from("custom_roles")
      .select("id, role_key, label, permissions, created_at, updated_at")
      .eq("org_id", orgContext.orgId)
      .order("label", { ascending: true });

    if (error) {
      return asFailure("action_failed", error.message);
    }

    const customRoles: OrgRoleDefinition[] = (data ?? []).map((row) => ({
      id: row.id,
      roleKey: row.role_key,
      label: row.label,
      source: "custom",
      permissions: ((row.permissions ?? []) as string[]).filter(isPermission),
      editable: true,
      deletable: true,
      createdAt: row.created_at ?? null,
      updatedAt: row.updated_at ?? null
    }));

    return { ok: true, data: { roles: [...buildDefaultRoles(), ...customRoles] } };
  } catch (caught) {
    rethrowIfNavigationError(caught);
    const message = caught instanceof Error ? caught.message : "Failed to list roles";
    return asFailure("action_failed", message);
  }
}

// -----------------------------------------------------------------------------
// createOrgRoleAction
// -----------------------------------------------------------------------------

const createOrgRoleSchema = z.object({
  orgSlug: z.string().trim().min(1),
  label: z.string().trim().min(1).max(80),
  roleKey: z.string().trim().min(2).max(32).optional(),
  permissions: z.array(z.string()).default([])
});

export async function createOrgRoleAction(
  input: z.input<typeof createOrgRoleSchema>
): Promise<RolesResult<{ role: OrgRoleDefinition }>> {
  const parsed = createOrgRoleSchema.safeParse(input);
  if (!parsed.success) {
    return asFailure("invalid_input", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const desiredKey = parsed.data.roleKey ? normalizeRoleKey(parsed.data.roleKey) : normalizeRoleKey(parsed.data.label);
  if (!isValidRoleKey(desiredKey)) {
    return asFailure("invalid_input", "Role key must start with a letter and contain only lowercase letters, numbers, or hyphens.");
  }
  if (isReservedOrgRoleKey(desiredKey)) {
    return asFailure("reserved_key", `"${desiredKey}" is a built-in role key and cannot be reused.`);
  }

  const cleanedPermissions = parsed.data.permissions.filter(isPermission);

  try {
    const orgContext = await requireRolesWriteContext(parsed.data.orgSlug);
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .schema("orgs")
      .from("custom_roles")
      .insert({
        org_id: orgContext.orgId,
        role_key: desiredKey,
        label: parsed.data.label.trim(),
        permissions: cleanedPermissions
      })
      .select("id, role_key, label, permissions, created_at, updated_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        return asFailure("duplicate_key", `A role with key "${desiredKey}" already exists.`);
      }
      return asFailure("action_failed", error.message);
    }

    revalidatePath(`/${orgContext.orgSlug}/manage/people/roles`);
    return {
      ok: true,
      data: {
        role: {
          id: data.id,
          roleKey: data.role_key,
          label: data.label,
          source: "custom",
          permissions: ((data.permissions ?? []) as string[]).filter(isPermission),
          editable: true,
          deletable: true,
          createdAt: data.created_at ?? null,
          updatedAt: data.updated_at ?? null
        }
      }
    };
  } catch (caught) {
    rethrowIfNavigationError(caught);
    const message = caught instanceof Error ? caught.message : "Failed to create role";
    return asFailure("action_failed", message);
  }
}

// -----------------------------------------------------------------------------
// updateOrgRoleAction — edit label and/or permissions on a custom role.
// -----------------------------------------------------------------------------

const updateOrgRoleSchema = z.object({
  orgSlug: z.string().trim().min(1),
  roleId: z.string().uuid(),
  label: z.string().trim().min(1).max(80).optional(),
  permissions: z.array(z.string()).optional()
});

export async function updateOrgRoleAction(
  input: z.input<typeof updateOrgRoleSchema>
): Promise<RolesResult<{ role: OrgRoleDefinition }>> {
  const parsed = updateOrgRoleSchema.safeParse(input);
  if (!parsed.success) {
    return asFailure("invalid_input", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const updatePayload: { label?: string; permissions?: string[] } = {};
  if (typeof parsed.data.label === "string") {
    updatePayload.label = parsed.data.label.trim();
  }
  if (Array.isArray(parsed.data.permissions)) {
    updatePayload.permissions = parsed.data.permissions.filter(isPermission);
  }
  if (Object.keys(updatePayload).length === 0) {
    return asFailure("invalid_input", "No changes provided.");
  }

  try {
    const orgContext = await requireRolesWriteContext(parsed.data.orgSlug);
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .schema("orgs")
      .from("custom_roles")
      .update(updatePayload)
      .eq("id", parsed.data.roleId)
      .eq("org_id", orgContext.orgId)
      .select("id, role_key, label, permissions, created_at, updated_at")
      .single();

    if (error) {
      return asFailure("action_failed", error.message);
    }
    if (!data) {
      return asFailure("not_found", "Role not found");
    }

    revalidatePath(`/${orgContext.orgSlug}/manage/people/roles`);
    return {
      ok: true,
      data: {
        role: {
          id: data.id,
          roleKey: data.role_key,
          label: data.label,
          source: "custom",
          permissions: ((data.permissions ?? []) as string[]).filter(isPermission),
          editable: true,
          deletable: true,
          createdAt: data.created_at ?? null,
          updatedAt: data.updated_at ?? null
        }
      }
    };
  } catch (caught) {
    rethrowIfNavigationError(caught);
    const message = caught instanceof Error ? caught.message : "Failed to update role";
    return asFailure("action_failed", message);
  }
}

// -----------------------------------------------------------------------------
// deleteOrgRoleAction
// -----------------------------------------------------------------------------

const deleteOrgRoleSchema = z.object({
  orgSlug: z.string().trim().min(1),
  roleId: z.string().uuid()
});

export async function deleteOrgRoleAction(
  input: z.input<typeof deleteOrgRoleSchema>
): Promise<RolesResult<{ deletedId: string }>> {
  const parsed = deleteOrgRoleSchema.safeParse(input);
  if (!parsed.success) {
    return asFailure("invalid_input", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  try {
    const orgContext = await requireRolesWriteContext(parsed.data.orgSlug);
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .schema("orgs")
      .from("custom_roles")
      .delete()
      .eq("id", parsed.data.roleId)
      .eq("org_id", orgContext.orgId);

    if (error) {
      return asFailure("action_failed", error.message);
    }

    revalidatePath(`/${orgContext.orgSlug}/manage/people/roles`);
    return { ok: true, data: { deletedId: parsed.data.roleId } };
  } catch (caught) {
    rethrowIfNavigationError(caught);
    const message = caught instanceof Error ? caught.message : "Failed to delete role";
    return asFailure("action_failed", message);
  }
}

// -----------------------------------------------------------------------------
// Server-side helper for the page loader.
// -----------------------------------------------------------------------------

export async function getOrgRolesPageData(orgSlug: string) {
  const orgContext = await requireRolesReadContext(orgSlug);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("org_custom_roles")
    .select("id, role_key, label, permissions, created_at, updated_at")
    .eq("org_id", orgContext.orgId)
    .order("label", { ascending: true });

  const customRoles: OrgRoleDefinition[] = !error
    ? (data ?? []).map((row) => ({
        id: row.id,
        roleKey: row.role_key,
        label: row.label,
        source: "custom",
        permissions: ((row.permissions ?? []) as string[]).filter(isPermission),
        editable: true,
        deletable: true,
        createdAt: row.created_at ?? null,
        updatedAt: row.updated_at ?? null
      }))
    : [];

  const canManage = orgContext.membershipPermissions.includes("org.manage.read");

  return {
    orgSlug: orgContext.orgSlug,
    orgName: orgContext.orgName,
    canManageRoles: canManage,
    roles: [...buildDefaultRoles(), ...customRoles],
    loadError: error ? error.message : null,
    allPermissions
  };
}
