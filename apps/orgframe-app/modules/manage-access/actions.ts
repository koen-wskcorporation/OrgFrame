"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { z } from "zod";
import { rethrowIfNavigationError } from "@/lib/actions/rethrowIfNavigationError";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { requirePermission } from "@/lib/auth/requirePermission";
import { createOptionalSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import {
  getDefaultRoleLabel,
  getDefaultRolePermissions,
  isAdminLikeRole,
  type OrgRole,
  type Permission
} from "@/modules/core/access";

const roleKeySchema = z.string().trim().min(2).max(32);

const membershipRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: roleKeySchema,
  created_at: z.string().optional().nullable()
});

const inviteUserSchema = z.object({
  orgSlug: z.string().trim().min(1),
  email: z.string().trim().email(),
  role: roleKeySchema
});

const updateMembershipRoleSchema = z.object({
  orgSlug: z.string().trim().min(1),
  membershipId: z.string().uuid(),
  role: roleKeySchema
});

const removeMembershipSchema = z.object({
  orgSlug: z.string().trim().min(1),
  membershipId: z.string().uuid()
});

const sendPasswordResetSchema = z.object({
  orgSlug: z.string().trim().min(1),
  email: z.string().trim().email(),
  redirectTo: z.string().trim().url().optional()
});

type ManageAccessErrorCode =
  | "invalid_input"
  | "invalid_role"
  | "service_not_configured"
  | "not_found"
  | "already_member"
  | "forbidden"
  | "last_admin"
  | "action_failed";

type ManageAccessResult<TData = undefined> =
  | {
      ok: true;
      data: TData;
    }
  | {
      ok: false;
      code: ManageAccessErrorCode;
      error: string;
    };

export type AccessMember = {
  membershipId: string;
  userId: string;
  email: string | null;
  role: OrgRole;
  status: "active" | "pending";
  isCurrentUser: boolean;
  joinedAt: string | null;
  lastActivityAt: string | null;
};

export type AccessRoleDefinition = {
  id: string;
  roleKey: OrgRole;
  label: string;
  source: "default";
  permissions: Permission[];
  createdAt: string | null;
};

export type AccountsAccessPageData = {
  orgSlug: string;
  orgName: string;
  currentUserId: string;
  currentUserRole: OrgRole;
  currentUserPermissions: Permission[];
  members: AccessMember[];
  roles: AccessRoleDefinition[];
  serviceRoleConfigured: boolean;
  loadError: string | null;
};

type MembershipRow = z.infer<typeof membershipRowSchema>;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getConfiguredServiceClient() {
  return createOptionalSupabaseServiceRoleClient();
}

function asFailure(code: ManageAccessErrorCode, error: string): ManageAccessResult<never> {
  return {
    ok: false,
    code,
    error
  };
}

function buildRoleDefinitions(): AccessRoleDefinition[] {
  const adminPermissions = getDefaultRolePermissions("admin") ?? [];
  const memberPermissions = getDefaultRolePermissions("member") ?? [];

  return [
    {
      id: "role-admin",
      roleKey: "admin",
      label: getDefaultRoleLabel("admin"),
      source: "default",
      permissions: adminPermissions,
      createdAt: null
    },
    {
      id: "role-member",
      roleKey: "member",
      label: getDefaultRoleLabel("member"),
      source: "default",
      permissions: memberPermissions,
      createdAt: null
    }
  ];
}

function getRoleDefinitionMap(roles: AccessRoleDefinition[]) {
  return new Map(roles.map((role) => [role.roleKey, role]));
}

function listAssignableRoles(): AccessRoleDefinition[] {
  return buildRoleDefinitions();
}

async function requireManageAccessContext(orgSlug: string) {
  const orgContext = await getOrgAuthContext(orgSlug);
  requirePermission(orgContext.membershipPermissions, "org.manage.read");
  return orgContext;
}

async function listOrgMembershipRows(supabase: SupabaseClient<any>, orgId: string): Promise<MembershipRow[]> {
  const { data, error } = await supabase
    .from("org_memberships")
    .select("id, user_id, role, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).flatMap((row) => {
    const parsed = membershipRowSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

async function findMembershipById(supabase: SupabaseClient<any>, orgId: string, membershipId: string): Promise<MembershipRow | null> {
  const { data, error } = await supabase
    .from("org_memberships")
    .select("id, user_id, role, created_at")
    .eq("org_id", orgId)
    .eq("id", membershipId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const parsed = membershipRowSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

async function membershipExists(supabase: SupabaseClient<any>, orgId: string, userId: string) {
  const { data, error } = await supabase
    .from("org_memberships")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data?.id);
}

async function countAdmins(supabase: SupabaseClient<any>, orgId: string) {
  const { count, error } = await supabase
    .from("org_memberships")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .in("role", ["owner", "admin", "manager"]);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

function getMemberStatus(user: User | null): AccessMember["status"] {
  if (!user) {
    return "pending";
  }

  if (user.last_sign_in_at || user.email_confirmed_at) {
    return "active";
  }

  if (user.invited_at) {
    return "pending";
  }

  return "active";
}

async function findAuthUserByEmail(supabase: SupabaseClient<any>, email: string): Promise<User | null> {
  const targetEmail = normalizeEmail(email);
  const perPage = 200;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage
    });

    if (error) {
      throw new Error(error.message);
    }

    const found = data.users.find((user) => normalizeEmail(user.email ?? "") === targetEmail);
    if (found) {
      return found;
    }

    if (data.users.length < perPage) {
      break;
    }
  }

  return null;
}

async function listAuthUsersByIds(supabase: SupabaseClient<any>, userIds: string[]): Promise<Map<string, User>> {
  const pendingIds = new Set(userIds);
  const usersById = new Map<string, User>();

  if (pendingIds.size === 0) {
    return usersById;
  }

  const perPage = 200;

  for (let page = 1; page <= 20 && pendingIds.size > 0; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage
    });

    if (error) {
      throw new Error(error.message);
    }

    for (const user of data.users) {
      if (pendingIds.has(user.id)) {
        usersById.set(user.id, user);
        pendingIds.delete(user.id);
      }
    }

    if (data.users.length < perPage) {
      break;
    }
  }

  return usersById;
}

async function listAccessMembersForOrg({
  supabase,
  orgId,
  currentUserId
}: {
  supabase: SupabaseClient<any>;
  orgId: string;
  currentUserId: string;
}): Promise<AccessMember[]> {
  const memberships = await listOrgMembershipRows(supabase, orgId);
  const usersById = await listAuthUsersByIds(
    supabase,
    memberships.map((membership) => membership.user_id)
  );

  return memberships.map((membership): AccessMember => {
    const user = usersById.get(membership.user_id) ?? null;

    return {
      membershipId: membership.id,
      userId: membership.user_id,
      email: user?.email ?? null,
      role: membership.role,
      status: getMemberStatus(user),
      isCurrentUser: membership.user_id === currentUserId,
      joinedAt: membership.created_at ?? null,
      lastActivityAt: user?.last_sign_in_at ?? user?.invited_at ?? user?.created_at ?? null
    };
  });
}

function validateRoleKey(roleKey: string) {
  return roleKey === "admin" || roleKey === "member";
}

export async function getAccountsAccessPageData(orgSlug: string): Promise<AccountsAccessPageData> {
  const orgContext = await requireManageAccessContext(orgSlug);
  const supabase = getConfiguredServiceClient();
  const defaultRoles = buildRoleDefinitions();

  if (!supabase) {
    return {
      orgSlug: orgContext.orgSlug,
      orgName: orgContext.orgName,
      currentUserId: orgContext.userId,
      currentUserRole: orgContext.membershipRole,
      currentUserPermissions: orgContext.membershipPermissions,
      members: [],
      roles: defaultRoles,
      serviceRoleConfigured: false,
      loadError: "Service role key is not configured. Set SUPABASE_SERVICE_ROLE_KEY on the server."
    };
  }

  try {
    const [members, roles] = await Promise.all([
      listAccessMembersForOrg({
        supabase,
        orgId: orgContext.orgId,
        currentUserId: orgContext.userId
      }),
      listAssignableRoles()
    ]);

    return {
      orgSlug: orgContext.orgSlug,
      orgName: orgContext.orgName,
      currentUserId: orgContext.userId,
      currentUserRole: orgContext.membershipRole,
      currentUserPermissions: orgContext.membershipPermissions,
      members,
      roles,
      serviceRoleConfigured: true,
      loadError: null
    };
  } catch {
    return {
      orgSlug: orgContext.orgSlug,
      orgName: orgContext.orgName,
      currentUserId: orgContext.userId,
      currentUserRole: orgContext.membershipRole,
      currentUserPermissions: orgContext.membershipPermissions,
      members: [],
      roles: defaultRoles,
      serviceRoleConfigured: true,
      loadError: "Unable to load org memberships right now."
    };
  }
}

export async function inviteUserToOrgAction(input: {
  orgSlug: string;
  email: string;
  role: OrgRole;
}): Promise<ManageAccessResult<{ members: AccessMember[] }>> {
  const parsedInput = inviteUserSchema.safeParse(input);

  if (!parsedInput.success) {
    return asFailure("invalid_input", "Please provide a valid email and role.");
  }

  try {
    const { orgSlug, email, role } = parsedInput.data;
    const orgContext = await requireManageAccessContext(orgSlug);
    const supabase = getConfiguredServiceClient();

    if (!supabase) {
      return asFailure("service_not_configured", "Invites require SUPABASE_SERVICE_ROLE_KEY on the server.");
    }

    if (!validateRoleKey(role)) {
      return asFailure("invalid_role", "Please select a valid role.");
    }

    const assignableRoles = listAssignableRoles();
    const roleDefinitions = getRoleDefinitionMap(assignableRoles);

    if (!roleDefinitions.has(role)) {
      return asFailure("invalid_role", "Please select a valid role.");
    }

    if (role === "admin" && !isAdminLikeRole(orgContext.membershipRole)) {
      return asFailure("forbidden", "Only organization admins can assign admin access.");
    }

    const existingUser = await findAuthUserByEmail(supabase, email);

    if (existingUser && (await membershipExists(supabase, orgContext.orgId, existingUser.id))) {
      return asFailure("already_member", "That user already has access to this organization.");
    }

    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email);

    if (inviteError && !existingUser) {
      return asFailure("action_failed", inviteError.message);
    }

    let userId = inviteData.user?.id ?? existingUser?.id ?? null;

    if (!userId) {
      const matchedUser = await findAuthUserByEmail(supabase, email);
      userId = matchedUser?.id ?? null;
    }

    if (!userId) {
      return asFailure("action_failed", "Unable to resolve invited user.");
    }

    if (await membershipExists(supabase, orgContext.orgId, userId)) {
      return asFailure("already_member", "That user already has access to this organization.");
    }

    const { error: insertError } = await supabase.from("org_memberships").insert({
      org_id: orgContext.orgId,
      user_id: userId,
      role
    });

    if (insertError) {
      return asFailure("action_failed", insertError.message);
    }

    revalidatePath(`/${orgSlug}/manage/access`);

    const members = await listAccessMembersForOrg({
      supabase,
      orgId: orgContext.orgId,
      currentUserId: orgContext.userId
    });

    return {
      ok: true,
      data: {
        members
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asFailure("action_failed", "Unable to send invite right now.");
  }
}

export async function updateMembershipRoleAction(input: {
  orgSlug: string;
  membershipId: string;
  role: OrgRole;
}): Promise<ManageAccessResult<{ members: AccessMember[] }>> {
  const parsedInput = updateMembershipRoleSchema.safeParse(input);

  if (!parsedInput.success) {
    return asFailure("invalid_input", "Please select a valid role.");
  }

  try {
    const { orgSlug, membershipId, role } = parsedInput.data;
    const orgContext = await requireManageAccessContext(orgSlug);
    const supabase = getConfiguredServiceClient();

    if (!supabase) {
      return asFailure("service_not_configured", "Role updates require SUPABASE_SERVICE_ROLE_KEY on the server.");
    }

    if (!validateRoleKey(role)) {
      return asFailure("invalid_role", "Please select a valid role.");
    }

    const assignableRoles = listAssignableRoles();
    const roleDefinitions = getRoleDefinitionMap(assignableRoles);

    if (!roleDefinitions.has(role)) {
      return asFailure("invalid_role", "Please select a valid role.");
    }

    const membership = await findMembershipById(supabase, orgContext.orgId, membershipId);

    if (!membership) {
      return asFailure("not_found", "Membership not found.");
    }

    if (membership.role === role) {
      const members = await listAccessMembersForOrg({
        supabase,
        orgId: orgContext.orgId,
        currentUserId: orgContext.userId
      });

      return {
        ok: true,
        data: {
          members
        }
      };
    }

    const actorIsAdmin = isAdminLikeRole(orgContext.membershipRole);
    const targetIsAdmin = isAdminLikeRole(membership.role);
    const assigningAdminRole = role === "admin";

    if ((targetIsAdmin || assigningAdminRole) && !actorIsAdmin) {
      return asFailure("forbidden", "Only organization admins can assign or modify admin roles.");
    }

    if (targetIsAdmin && role !== "admin") {
      const adminCount = await countAdmins(supabase, orgContext.orgId);

      if (adminCount <= 1) {
        return asFailure("last_admin", "This organization must keep at least one admin.");
      }
    }

    const { error: updateError } = await supabase
      .from("org_memberships")
      .update({
        role
      })
      .eq("org_id", orgContext.orgId)
      .eq("id", membershipId);

    if (updateError) {
      return asFailure("action_failed", updateError.message);
    }

    revalidatePath(`/${orgSlug}/manage/access`);

    const members = await listAccessMembersForOrg({
      supabase,
      orgId: orgContext.orgId,
      currentUserId: orgContext.userId
    });

    return {
      ok: true,
      data: {
        members
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asFailure("action_failed", "Unable to update this membership right now.");
  }
}

export async function removeMembershipAction(input: {
  orgSlug: string;
  membershipId: string;
}): Promise<ManageAccessResult<{ members: AccessMember[] }>> {
  const parsedInput = removeMembershipSchema.safeParse(input);

  if (!parsedInput.success) {
    return asFailure("invalid_input", "Invalid membership request.");
  }

  try {
    const { orgSlug, membershipId } = parsedInput.data;
    const orgContext = await requireManageAccessContext(orgSlug);
    const supabase = getConfiguredServiceClient();

    if (!supabase) {
      return asFailure("service_not_configured", "Membership removals require SUPABASE_SERVICE_ROLE_KEY on the server.");
    }

    const membership = await findMembershipById(supabase, orgContext.orgId, membershipId);

    if (!membership) {
      return asFailure("not_found", "Membership not found.");
    }

    const actorIsAdmin = isAdminLikeRole(orgContext.membershipRole);
    const targetIsAdmin = isAdminLikeRole(membership.role);

    if (targetIsAdmin && !actorIsAdmin) {
      return asFailure("forbidden", "Only organization admins can remove admin memberships.");
    }

    if (targetIsAdmin) {
      const adminCount = await countAdmins(supabase, orgContext.orgId);

      if (adminCount <= 1) {
        return asFailure("last_admin", "This organization must keep at least one admin.");
      }
    }

    const { error: deleteError } = await supabase
      .from("org_memberships")
      .delete()
      .eq("org_id", orgContext.orgId)
      .eq("id", membershipId);

    if (deleteError) {
      return asFailure("action_failed", deleteError.message);
    }

    revalidatePath(`/${orgSlug}/manage/access`);

    const members = await listAccessMembersForOrg({
      supabase,
      orgId: orgContext.orgId,
      currentUserId: orgContext.userId
    });

    return {
      ok: true,
      data: {
        members
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asFailure("action_failed", "Unable to remove this membership right now.");
  }
}

export async function sendPasswordResetAction(input: {
  orgSlug: string;
  email: string;
  redirectTo?: string;
}): Promise<ManageAccessResult> {
  const parsedInput = sendPasswordResetSchema.safeParse(input);

  if (!parsedInput.success) {
    return asFailure("invalid_input", "Please provide a valid email address.");
  }

  try {
    const { orgSlug, email, redirectTo } = parsedInput.data;
    const orgContext = await requireManageAccessContext(orgSlug);
    const supabase = getConfiguredServiceClient();

    if (!supabase) {
      return asFailure("service_not_configured", "Password reset emails require SUPABASE_SERVICE_ROLE_KEY on the server.");
    }

    const user = await findAuthUserByEmail(supabase, email);

    if (!user) {
      return asFailure("not_found", "No account was found for that email.");
    }

    const inOrg = await membershipExists(supabase, orgContext.orgId, user.id);

    if (!inOrg) {
      return asFailure("forbidden", "This user does not belong to this organization.");
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);

    if (error) {
      return asFailure("action_failed", error.message);
    }

    return {
      ok: true,
      data: undefined
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asFailure("action_failed", "Unable to send a password reset email right now.");
  }
}
