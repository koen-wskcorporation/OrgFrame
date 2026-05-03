"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { z } from "zod";
import { rethrowIfNavigationError } from "@/src/shared/navigation/rethrowIfNavigationError";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { requireOrgToolEnabled } from "@/src/shared/org/requireOrgToolEnabled";
import { requirePermission } from "@/src/shared/permissions/requirePermission";
import { createOptionalSupabaseServiceRoleClient } from "@/src/shared/data-api/server";
import { can } from "@/src/shared/permissions/can";
import {
  createProfileRecord,
  linkProfileRecord,
  listPeopleDirectoryForOrg,
  transitionProfileStatusRecord,
  updateProfileRecord
} from "@/src/features/people/db/queries";
import type {
  PeopleDirectoryResult,
  PeopleInviteStatus,
  PeopleProfile,
  PeopleProfileStatus,
  PeopleProfileType,
  PeopleRelationshipType
} from "@/src/features/people/types";
import type { Permission } from "@/src/features/core/access";
import type { OrgToolAvailability } from "@/src/features/core/config/tools";

const profileTypeSchema = z.enum(["player", "staff"]);
const orgRoleSchema = z.string().trim().min(2).max(32);

const lookupAccountByEmailSchema = z.object({
  orgSlug: z.string().trim().min(1),
  email: z.string().trim().email()
});

export type AccountLookupResult =
  | { status: "new" }
  | {
      status: "existing";
      userId: string;
      firstName: string | null;
      lastName: string | null;
      avatarUrl: string | null;
    }
  | { status: "existing_member" };

const createAccountSchema = z.object({
  orgSlug: z.string().trim().min(1),
  email: z.string().trim().email(),
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(40).optional(),
  role: orgRoleSchema,
  avatarPath: z.string().trim().max(500).optional(),
  sendInvite: z.boolean().optional()
});
const relationshipTypeSchema = z.enum(["self", "guardian", "delegated_manager"]);
const profileStatusSchema = z.enum(["draft", "pending_claim", "active", "archived"]);

const createProfileSchema = z.object({
  orgSlug: z.string().trim().min(1),
  accountUserId: z.string().uuid().optional(),
  profileType: profileTypeSchema,
  displayName: z.string().trim().min(1).max(160),
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  dob: z.string().trim().optional()
});

const updateProfileSchema = z.object({
  orgSlug: z.string().trim().min(1),
  profileId: z.string().uuid(),
  displayName: z.string().trim().min(1).max(160),
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  dob: z.string().trim().optional()
});

const linkProfileSchema = z.object({
  orgSlug: z.string().trim().min(1),
  profileId: z.string().uuid(),
  relationshipType: relationshipTypeSchema,
  accountUserId: z.string().uuid().optional(),
  email: z.string().trim().email().optional(),
  canManage: z.boolean().optional()
});

const transitionProfileSchema = z.object({
  orgSlug: z.string().trim().min(1),
  profileId: z.string().uuid(),
  nextStatus: profileStatusSchema,
  source: z.string().trim().max(64).optional()
});

const sendProfileClaimInviteSchema = z.object({
  orgSlug: z.string().trim().min(1),
  profileId: z.string().uuid(),
  email: z.string().trim().email(),
  relationshipType: relationshipTypeSchema.optional()
});

const acceptProfileClaimSchema = z.object({
  orgSlug: z.string().trim().min(1),
  profileId: z.string().uuid(),
  relationshipType: relationshipTypeSchema.optional()
});

const getDirectorySchema = z.object({
  orgSlug: z.string().trim().min(1),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().optional()
});

type PeopleErrorCode = "invalid_input" | "forbidden" | "service_not_configured" | "not_found" | "already_member" | "action_failed";

type PeopleResult<TData = undefined> =
  | {
      ok: true;
      data: TData;
    }
  | {
      ok: false;
      code: PeopleErrorCode;
      error: string;
    };

export type PeopleDirectoryPageData = {
  orgSlug: string;
  orgName: string;
  currentUserId: string;
  currentUserPermissions: Permission[];
  canReadPeople: boolean;
  canWritePeople: boolean;
  serviceRoleConfigured: boolean;
  loadError: string | null;
  directory: PeopleDirectoryResult;
  toolAvailability: OrgToolAvailability;
};

function asFailure(code: PeopleErrorCode, error: string): PeopleResult<never> {
  return { ok: false, code, error };
}

function normalizeOptional(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function getConfiguredServiceClient() {
  return createOptionalSupabaseServiceRoleClient();
}

async function requirePeopleReadContext(orgSlug: string) {
  const orgContext = await getOrgAuthContext(orgSlug);
  requireOrgToolEnabled(orgContext.toolAvailability, "people");
  requirePermission(orgContext.membershipPermissions, "people.read");
  return orgContext;
}

async function requirePeopleWriteContext(orgSlug: string) {
  const orgContext = await getOrgAuthContext(orgSlug);
  requireOrgToolEnabled(orgContext.toolAvailability, "people");
  requirePermission(orgContext.membershipPermissions, "people.write");
  return orgContext;
}

async function listAuthUsersByIds(supabase: SupabaseClient<any>, userIds: string[]): Promise<Map<string, User>> {
  const pendingIds = new Set(userIds);
  const usersById = new Map<string, User>();
  if (pendingIds.size === 0) {
    return usersById;
  }

  const perPage = 200;
  for (let page = 1; page <= 20 && pendingIds.size > 0; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
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

async function findAuthUserByEmail(supabase: SupabaseClient<any>, email: string): Promise<User | null> {
  const normalized = email.trim().toLowerCase();
  const perPage = 200;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message);
    }

    const found = data.users.find((user) => (user.email ?? "").trim().toLowerCase() === normalized);
    if (found) {
      return found;
    }

    if (data.users.length < perPage) {
      break;
    }
  }

  return null;
}

export async function getPeopleDirectoryPageData(input: z.input<typeof getDirectorySchema>): Promise<PeopleDirectoryPageData> {
  const parsed = getDirectorySchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Invalid people directory request.");
  }

  const { orgSlug, page, pageSize } = parsed.data;
  const orgContext = await requirePeopleReadContext(orgSlug);
  const serviceClient = getConfiguredServiceClient();

  const canReadPeople = can(orgContext.membershipPermissions, "people.read");
  const canWritePeople = can(orgContext.membershipPermissions, "people.write");
  const emptyDirectory: PeopleDirectoryResult = {
    accounts: [],
    totalAccounts: 0,
    page: page ?? 1,
    pageSize: pageSize ?? 25
  };

  if (!serviceClient) {
    return {
      orgSlug: orgContext.orgSlug,
      orgName: orgContext.orgName,
      currentUserId: orgContext.userId,
      currentUserPermissions: orgContext.membershipPermissions,
      canReadPeople,
      canWritePeople,
      serviceRoleConfigured: false,
      loadError: "Service role key is not configured. Set SUPABASE_SERVICE_ROLE_KEY on the server.",
      directory: emptyDirectory,
      toolAvailability: orgContext.toolAvailability
    };
  }

  try {
    const directory = await listPeopleDirectoryForOrg({
      orgId: orgContext.orgId,
      page,
      pageSize,
      supabase: serviceClient
    });

    const userIds = directory.accounts.map((account) => account.userId);
    const usersById = await listAuthUsersByIds(serviceClient, userIds);
    const avatarPaths = Array.from(
      new Set(
        directory.accounts
          .map((account) => account.avatarPath)
          .filter((value): value is string => Boolean(value && value.trim().length > 0))
      )
    );
    const avatarUrlByPath = new Map<string, string>();

    await Promise.all(
      avatarPaths.map(async (path) => {
        const { data, error } = await serviceClient.storage.from("account-assets").createSignedUrl(path, 60 * 10);
        if (!error && data?.signedUrl) {
          avatarUrlByPath.set(path, data.signedUrl);
        }
      })
    );

    const hydratedDirectory: PeopleDirectoryResult = {
      ...directory,
      accounts: directory.accounts.map((account) => {
        const user = usersById.get(account.userId) ?? null;
        const status = user?.last_sign_in_at || user?.email_confirmed_at ? "active" : "pending";

        return {
          ...account,
          email: user?.email ?? null,
          phone: user?.phone ?? null,
          avatarUrl: account.avatarPath ? (avatarUrlByPath.get(account.avatarPath) ?? null) : null,
          status,
          lastActivityAt: user?.last_sign_in_at ?? user?.invited_at ?? user?.created_at ?? account.lastActivityAt
        };
      })
    };

    return {
      orgSlug: orgContext.orgSlug,
      orgName: orgContext.orgName,
      currentUserId: orgContext.userId,
      currentUserPermissions: orgContext.membershipPermissions,
      canReadPeople,
      canWritePeople,
      serviceRoleConfigured: true,
      loadError: null,
      directory: hydratedDirectory,
      toolAvailability: orgContext.toolAvailability
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    console.error("people.getPeopleDirectoryPageData failed", { orgSlug, reason });
    return {
      orgSlug: orgContext.orgSlug,
      orgName: orgContext.orgName,
      currentUserId: orgContext.userId,
      currentUserPermissions: orgContext.membershipPermissions,
      canReadPeople,
      canWritePeople,
      serviceRoleConfigured: true,
      loadError: `Unable to load people right now. (${reason})`,
      directory: emptyDirectory,
      toolAvailability: orgContext.toolAvailability
    };
  }
}

export async function lookupAccountByEmailAction(
  input: z.input<typeof lookupAccountByEmailSchema>
): Promise<PeopleResult<AccountLookupResult>> {
  const parsed = lookupAccountByEmailSchema.safeParse(input);
  if (!parsed.success) {
    return asFailure("invalid_input", "Please provide a valid email.");
  }

  try {
    const orgContext = await requirePeopleWriteContext(parsed.data.orgSlug);
    const serviceClient = getConfiguredServiceClient();
    if (!serviceClient) {
      return asFailure("service_not_configured", "Looking up accounts requires SUPABASE_SERVICE_ROLE_KEY on the server.");
    }

    const email = parsed.data.email.trim().toLowerCase();
    const existing = await findAuthUserByEmail(serviceClient, email);

    if (!existing) {
      return { ok: true, data: { status: "new" } };
    }

    const { data: membership } = await serviceClient
      .schema("orgs")
      .from("memberships")
      .select("id")
      .eq("org_id", orgContext.orgId)
      .eq("user_id", existing.id)
      .maybeSingle();

    if (membership) {
      return { ok: true, data: { status: "existing_member" } };
    }

    const { data: profileRow } = await serviceClient
      .schema("people")
      .from("users")
      .select("first_name, last_name, avatar_path")
      .eq("user_id", existing.id)
      .maybeSingle();

    let avatarUrl: string | null = null;
    if (profileRow?.avatar_path) {
      const { data: signed } = await serviceClient.storage
        .from("account-assets")
        .createSignedUrl(profileRow.avatar_path, 60 * 10);
      avatarUrl = signed?.signedUrl ?? null;
    }

    return {
      ok: true,
      data: {
        status: "existing",
        userId: existing.id,
        firstName: profileRow?.first_name ?? null,
        lastName: profileRow?.last_name ?? null,
        avatarUrl
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asFailure("action_failed", "Unable to look up that email right now.");
  }
}

export async function createAccountAction(
  input: z.input<typeof createAccountSchema>
): Promise<PeopleResult<{ userId: string }>> {
  const parsed = createAccountSchema.safeParse(input);
  if (!parsed.success) {
    return asFailure("invalid_input", "Please provide a valid email and role.");
  }

  try {
    const payload = parsed.data;
    const orgContext = await requirePeopleWriteContext(payload.orgSlug);

    const serviceClient = getConfiguredServiceClient();
    if (!serviceClient) {
      return asFailure("service_not_configured", "Creating accounts requires SUPABASE_SERVICE_ROLE_KEY on the server.");
    }

    const email = payload.email.trim().toLowerCase();
    const phone = normalizeOptional(payload.phone);
    const firstName = normalizeOptional(payload.firstName);
    const lastName = normalizeOptional(payload.lastName);
    const avatarPath = normalizeOptional(payload.avatarPath);

    const existingUser = await findAuthUserByEmail(serviceClient, email);

    let userId: string | null = existingUser?.id ?? null;

    if (!existingUser) {
      const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
        email,
        ...(phone ? { phone } : {}),
        email_confirm: false
      });

      if (createError) {
        return asFailure("action_failed", createError.message);
      }

      userId = created?.user?.id ?? null;
    } else if (phone && !existingUser.phone) {
      await serviceClient.auth.admin.updateUserById(existingUser.id, { phone });
    }

    if (!userId) {
      return asFailure("action_failed", "Unable to resolve created account.");
    }

    const { data: existingMembership, error: membershipLookupError } = await serviceClient
      .schema("orgs")
      .from("memberships")
      .select("id")
      .eq("org_id", orgContext.orgId)
      .eq("user_id", userId)
      .maybeSingle();

    if (membershipLookupError) {
      return asFailure("action_failed", membershipLookupError.message);
    }

    if (existingMembership) {
      return asFailure("already_member", "That email already has an account in this organization.");
    }

    const { error: insertError } = await serviceClient
      .schema("orgs")
      .from("memberships")
      .insert({
        org_id: orgContext.orgId,
        user_id: userId,
        role: payload.role
      });

    if (insertError) {
      return asFailure("action_failed", insertError.message);
    }

    if (!existingUser) {
      const { error: profileError } = await serviceClient
        .schema("people")
        .from("users")
        .upsert(
          {
            user_id: userId,
            first_name: firstName,
            last_name: lastName,
            avatar_path: avatarPath
          },
          { onConflict: "user_id" }
        );

      if (profileError) {
        return asFailure("action_failed", profileError.message);
      }

      if (payload.sendInvite) {
        await serviceClient.auth.admin.inviteUserByEmail(email).catch(() => undefined);
      }
    }

    revalidatePath(`/${payload.orgSlug}/manage/people`);

    return {
      ok: true,
      data: { userId }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    const reason = error instanceof Error ? error.message : "Unknown error";
    return asFailure("action_failed", `Unable to create account right now. (${reason})`);
  }
}

const updateAccountRoleSchema = z.object({
  orgSlug: z.string().trim().min(1),
  userId: z.string().uuid(),
  role: orgRoleSchema
});

export async function updateAccountRoleAction(
  input: z.input<typeof updateAccountRoleSchema>
): Promise<PeopleResult<{ userId: string; role: string }>> {
  const parsed = updateAccountRoleSchema.safeParse(input);
  if (!parsed.success) {
    return asFailure("invalid_input", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  try {
    const orgContext = await requirePeopleWriteContext(parsed.data.orgSlug);
    const serviceClient = getConfiguredServiceClient();
    if (!serviceClient) {
      return asFailure("service_not_configured", "Updating roles requires SUPABASE_SERVICE_ROLE_KEY on the server.");
    }

    const { data: updated, error } = await serviceClient
      .schema("orgs")
      .from("memberships")
      .update({ role: parsed.data.role })
      .eq("org_id", orgContext.orgId)
      .eq("user_id", parsed.data.userId)
      .select("user_id, role")
      .maybeSingle();

    if (error) {
      return asFailure("action_failed", error.message);
    }
    if (!updated) {
      return asFailure("not_found", "That account is not a member of this organization.");
    }

    revalidatePath(`/${parsed.data.orgSlug}/manage/people`);
    return { ok: true, data: { userId: parsed.data.userId, role: updated.role } };
  } catch (error) {
    rethrowIfNavigationError(error);
    const reason = error instanceof Error ? error.message : "Unknown error";
    return asFailure("action_failed", `Unable to update role right now. (${reason})`);
  }
}

export async function createProfileAction(input: z.input<typeof createProfileSchema>): Promise<PeopleResult<{ profile: PeopleProfile; directory: PeopleDirectoryResult }>> {
  const parsed = createProfileSchema.safeParse(input);
  if (!parsed.success) {
    return asFailure("invalid_input", "Please provide valid profile details.");
  }

  try {
    const payload = parsed.data;
    const orgContext = await requirePeopleWriteContext(payload.orgSlug);

    const profile = await createProfileRecord({
      orgId: orgContext.orgId,
      personUserId: payload.accountUserId ?? null,
      profileType: payload.profileType,
      status: payload.accountUserId ? "active" : "draft",
      displayName: payload.displayName,
      firstName: normalizeOptional(payload.firstName),
      lastName: normalizeOptional(payload.lastName),
      dob: normalizeOptional(payload.dob)
    });

    if (payload.accountUserId) {
      const relationshipType: PeopleRelationshipType = payload.profileType === "staff" ? "delegated_manager" : "self";
      const inviteStatus: PeopleInviteStatus = "accepted";

      await linkProfileRecord({
        orgId: orgContext.orgId,
        profileId: profile.id,
        accountUserId: payload.accountUserId,
        relationshipType,
        canManage: true,
        inviteStatus
      });
    }

    revalidatePath(`/${payload.orgSlug}/manage/people`);
    const directory = await listPeopleDirectoryForOrg({ orgId: orgContext.orgId });

    return {
      ok: true,
      data: {
        profile,
        directory
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asFailure("action_failed", "Unable to create profile right now.");
  }
}

export async function updateProfileAction(input: z.input<typeof updateProfileSchema>): Promise<PeopleResult<{ profile: PeopleProfile }>> {
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return asFailure("invalid_input", "Please provide valid profile details.");
  }

  try {
    const payload = parsed.data;
    await requirePeopleWriteContext(payload.orgSlug);
    const profile = await updateProfileRecord({
      profileId: payload.profileId,
      displayName: payload.displayName,
      firstName: normalizeOptional(payload.firstName),
      lastName: normalizeOptional(payload.lastName),
      dob: normalizeOptional(payload.dob)
    });

    revalidatePath(`/${payload.orgSlug}/manage/people`);

    return {
      ok: true,
      data: { profile }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asFailure("action_failed", "Unable to update this profile right now.");
  }
}

export async function linkProfileAction(input: z.input<typeof linkProfileSchema>): Promise<PeopleResult<{ link: unknown }>> {
  const parsed = linkProfileSchema.safeParse(input);
  if (!parsed.success) {
    return asFailure("invalid_input", "Please provide a valid account email or user id.");
  }

  try {
    const payload = parsed.data;
    const orgContext = await requirePeopleWriteContext(payload.orgSlug);

    let accountUserId = payload.accountUserId ?? null;
    let pendingInviteEmail: string | null = null;
    let inviteStatus: PeopleInviteStatus = "accepted";

    if (!accountUserId && payload.email) {
      const serviceClient = getConfiguredServiceClient();
      if (!serviceClient) {
        return asFailure("service_not_configured", "Linking by email requires SUPABASE_SERVICE_ROLE_KEY on the server.");
      }

      const user = await findAuthUserByEmail(serviceClient, payload.email);
      if (!user) {
        pendingInviteEmail = payload.email.trim().toLowerCase();
        inviteStatus = "pending";

        const createResult = await serviceClient.auth.admin.createUser({
          email: pendingInviteEmail,
          email_confirm: false
        });
        if (createResult.error) {
          return asFailure("action_failed", createResult.error.message);
        }
      } else {
        accountUserId = user.id;
      }
    }

    const link = await linkProfileRecord({
      orgId: orgContext.orgId,
      profileId: payload.profileId,
      accountUserId,
      relationshipType: payload.relationshipType,
      canManage: payload.canManage ?? true,
      pendingInviteEmail,
      inviteStatus
    });

    revalidatePath(`/${payload.orgSlug}/manage/people`);
    return {
      ok: true,
      data: { link }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asFailure("action_failed", "Unable to link this profile right now.");
  }
}

export async function transitionProfileStatusAction(
  input: z.input<typeof transitionProfileSchema>
): Promise<PeopleResult<{ profile: PeopleProfile }>> {
  const parsed = transitionProfileSchema.safeParse(input);
  if (!parsed.success) {
    return asFailure("invalid_input", "Please provide a valid profile status transition.");
  }

  try {
    const payload = parsed.data;
    await requirePeopleWriteContext(payload.orgSlug);
    const profile = await transitionProfileStatusRecord({
      profileId: payload.profileId,
      nextStatus: payload.nextStatus,
      source: payload.source ?? "people_ui"
    });

    revalidatePath(`/${payload.orgSlug}/manage/people`);
    return {
      ok: true,
      data: { profile }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asFailure("action_failed", "Unable to update profile status right now.");
  }
}

export async function sendProfileClaimInviteAction(
  input: z.input<typeof sendProfileClaimInviteSchema>
): Promise<PeopleResult<{ link: unknown }>> {
  const parsed = sendProfileClaimInviteSchema.safeParse(input);
  if (!parsed.success) {
    return asFailure("invalid_input", "Please provide a valid claim invite request.");
  }

  return linkProfileAction({
    orgSlug: parsed.data.orgSlug,
    profileId: parsed.data.profileId,
    relationshipType: parsed.data.relationshipType ?? "self",
    email: parsed.data.email,
    canManage: true
  });
}

export async function acceptProfileClaimAction(
  input: z.input<typeof acceptProfileClaimSchema>
): Promise<PeopleResult<{ link: unknown; profile: PeopleProfile }>> {
  const parsed = acceptProfileClaimSchema.safeParse(input);
  if (!parsed.success) {
    return asFailure("invalid_input", "Please provide a valid profile claim request.");
  }

  try {
    const payload = parsed.data;
    const orgContext = await requirePeopleWriteContext(payload.orgSlug);
    const link = await linkProfileRecord({
      orgId: orgContext.orgId,
      profileId: payload.profileId,
      accountUserId: orgContext.userId,
      relationshipType: payload.relationshipType ?? "self",
      canManage: true,
      inviteStatus: "accepted"
    });

    const profile = await transitionProfileStatusRecord({
      profileId: payload.profileId,
      nextStatus: "active",
      source: "claim_accept"
    });

    revalidatePath(`/${payload.orgSlug}/manage/people`);
    return {
      ok: true,
      data: { link, profile }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asFailure("action_failed", "Unable to accept this profile claim right now.");
  }
}
