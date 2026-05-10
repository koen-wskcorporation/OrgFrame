"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { rethrowIfNavigationError } from "@/src/shared/navigation/rethrowIfNavigationError";
import { requireAuth } from "@/src/features/core/auth/server/requireAuth";
import {
  createOptionalSupabaseServiceRoleClient,
  createSupabaseServer
} from "@/src/shared/data-api/server";
import { createProfileRecord, linkProfileRecord, updateProfileRecord } from "@/src/features/people/db/queries";
import { findAuthUserByEmail } from "@/src/features/people/account-profiles/server";

const addressSchema = z
  .object({
    line1: z.string().trim().max(160).optional(),
    line2: z.string().trim().max(160).optional(),
    city: z.string().trim().max(120).optional(),
    state: z.string().trim().max(80).optional(),
    postalCode: z.string().trim().max(20).optional(),
    country: z.string().trim().max(80).optional()
  })
  .partial();

const relationshipSchema = z.enum(["self", "guardian", "delegated_manager"]);
const profileTypeSchema = z.enum(["player", "staff"]);

const metadataSchema = z.record(z.string(), z.unknown()).optional();

const createSchema = z.object({
  relationshipType: relationshipSchema,
  profileType: profileTypeSchema.optional(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  dob: z.string().trim().min(1).max(20).optional().or(z.literal("")),
  sex: z.string().trim().max(40).optional().or(z.literal("")),
  school: z.string().trim().max(160).optional().or(z.literal("")),
  grade: z.string().trim().max(40).optional().or(z.literal("")),
  avatarPath: z.string().trim().max(500).optional().or(z.literal("")),
  address: addressSchema.optional(),
  metadata: metadataSchema,
  shares: z
    .array(
      z.object({
        email: z.string().trim().email(),
        kinship: z.string().trim().min(1).max(40)
      })
    )
    .optional()
});

const updateSchema = z.object({
  profileId: z.string().uuid(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  dob: z.string().trim().max(20).optional().or(z.literal("")),
  sex: z.string().trim().max(40).optional().or(z.literal("")),
  school: z.string().trim().max(160).optional().or(z.literal("")),
  grade: z.string().trim().max(40).optional().or(z.literal("")),
  avatarPath: z.string().trim().max(500).optional().or(z.literal("")),
  address: addressSchema.optional(),
  metadata: metadataSchema
});

const shareSchema = z.object({
  profileId: z.string().uuid(),
  email: z.string().trim().email(),
  kinship: z.string().trim().min(1).max(40)
});

const removeShareSchema = z.object({
  linkId: z.string().uuid()
});

const deleteSchema = z.object({
  profileId: z.string().uuid()
});

type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function fail(error: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, ...(fieldErrors ? { fieldErrors } : {}) };
}

function emptyToNull(value: string | undefined | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildDisplayName(first: string, last: string) {
  return `${first.trim()} ${last.trim()}`.trim();
}

export async function createAccountProfileAction(
  input: z.input<typeof createSchema>
): Promise<ActionResult<{ profileId: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please fill in name fields.");
  }

  try {
    const user = await requireAuth();
    const data = parsed.data;
    const isSelf = data.relationshipType === "self";
    const supabase = await createSupabaseServer();
    // Account-level profiles (no org) can't be inserted under the user's RLS
    // because the link that grants them access doesn't exist yet at INSERT
    // time. Use the service role for the create + linking step; the
    // user-owned link we add immediately after means subsequent reads/writes
    // pass RLS normally.
    const service = createOptionalSupabaseServiceRoleClient();
    if (!service) {
      return fail("Server is not configured to create profiles. SUPABASE_SERVICE_ROLE_KEY is missing.");
    }

    // Self profiles need exactly one — block duplicates.
    if (isSelf) {
      const { data: existing } = await supabase
        .schema("people")
        .from("profile_links")
        .select("id")
        .eq("account_user_id", user.id)
        .is("org_id", null)
        .eq("relationship_type", "self")
        .maybeSingle();
      if (existing) {
        return fail("You already have a self profile.");
      }
    }

    const profile = await createProfileRecord({
      orgId: null,
      personUserId: isSelf ? user.id : null,
      profileType: data.profileType ?? "player",
      status: "active",
      displayName: buildDisplayName(data.firstName, data.lastName),
      firstName: data.firstName,
      lastName: data.lastName,
      dob: emptyToNull(data.dob),
      sex: emptyToNull(data.sex),
      school: emptyToNull(data.school),
      grade: emptyToNull(data.grade),
      avatarPath: emptyToNull(data.avatarPath),
      addressJson: data.address ?? {},
      metadataJson: (data.metadata ?? {}) as Record<string, unknown>,
      supabase: service
    });

    await linkProfileRecord({
      orgId: null,
      accountUserId: user.id,
      profileId: profile.id,
      relationshipType: data.relationshipType,
      canManage: true,
      inviteStatus: "accepted",
      supabase: service
    });

    if (data.shares && data.shares.length > 0) {
      for (const share of data.shares) {
        const existing = await findAuthUserByEmail(share.email).catch(() => null);
        await linkProfileRecord({
          orgId: null,
          accountUserId: existing?.id ?? null,
          profileId: profile.id,
          relationshipType: "delegated_manager",
          canManage: true,
          pendingInviteEmail: existing ? null : share.email,
          inviteStatus: existing ? "accepted" : "pending",
          metadataJson: { kinship: share.kinship },
          supabase: service
        });
      }
    }

    revalidatePath("/profiles");
    return { ok: true, data: { profileId: profile.id } };
  } catch (error) {
    rethrowIfNavigationError(error);
    return fail(error instanceof Error ? error.message : "Could not create profile.");
  }
}

export async function updateAccountProfileAction(
  input: z.input<typeof updateSchema>
): Promise<ActionResult<{ profileId: string }>> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Invalid input.");
  }

  try {
    const user = await requireAuth();
    const data = parsed.data;
    const supabase = await createSupabaseServer();

    const { data: ownerLink } = await supabase
      .schema("people")
      .from("profile_links")
      .select("relationship_type, account_user_id")
      .eq("profile_id", data.profileId)
      .eq("account_user_id", user.id)
      .is("org_id", null)
      .maybeSingle();
    const isSelf = ownerLink?.relationship_type === "self";

    const firstName = data.firstName;
    const lastName = data.lastName;
    const avatarPath = emptyToNull(data.avatarPath);

    await updateProfileRecord({
      profileId: data.profileId,
      displayName: buildDisplayName(firstName, lastName),
      firstName,
      lastName,
      dob: emptyToNull(data.dob),
      sex: emptyToNull(data.sex),
      school: emptyToNull(data.school),
      grade: emptyToNull(data.grade),
      avatarPath,
      addressJson: data.address ?? {},
      ...(data.metadata !== undefined ? { metadataJson: data.metadata as Record<string, unknown> } : {})
    });

    // The Myself profile is the single edit point for the account row —
    // mirror name + avatar back into `people.users` so other surfaces stay
    // in sync. ensureSelfProfile re-syncs in the other direction on load.
    if (isSelf) {
      const service = createOptionalSupabaseServiceRoleClient();
      const writeClient = service ?? supabase;
      await writeClient
        .schema("people")
        .from("users")
        .upsert(
          {
            user_id: user.id,
            first_name: firstName,
            last_name: lastName,
            avatar_path: avatarPath
          },
          { onConflict: "user_id" }
        );
      revalidatePath("/settings");
    }

    revalidatePath("/profiles");
    return { ok: true, data: { profileId: data.profileId } };
  } catch (error) {
    rethrowIfNavigationError(error);
    return fail(error instanceof Error ? error.message : "Could not update profile.");
  }
}

export async function shareAccountProfileAction(
  input: z.input<typeof shareSchema>
): Promise<
  ActionResult<{
    linkId: string;
    inviteStatus: "pending" | "accepted";
    accountDisplayName: string | null;
  }>
> {
  const parsed = shareSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Enter a valid email and relationship.");
  }

  try {
    const user = await requireAuth();
    const data = parsed.data;
    const supabase = await createSupabaseServer();

    // Verify the caller manages this profile.
    const { data: myLink } = await supabase
      .schema("people")
      .from("profile_links")
      .select("id, can_manage")
      .eq("profile_id", data.profileId)
      .eq("account_user_id", user.id)
      .is("org_id", null)
      .maybeSingle();
    if (!myLink || !myLink.can_manage) {
      return fail("You don't have permission to share this profile.");
    }

    const service = createOptionalSupabaseServiceRoleClient();
    const existingUser = service ? await findAuthUserByEmail(data.email).catch(() => null) : null;

    const link = await linkProfileRecord({
      orgId: null,
      accountUserId: existingUser?.id ?? null,
      profileId: data.profileId,
      relationshipType: "delegated_manager",
      canManage: true,
      pendingInviteEmail: existingUser ? null : data.email,
      inviteStatus: existingUser ? "accepted" : "pending",
      metadataJson: { kinship: data.kinship },
      supabase: service ?? supabase
    });

    let accountDisplayName: string | null = null;
    if (existingUser && service) {
      const { data: row } = await service
        .schema("people")
        .from("users")
        .select("first_name, last_name")
        .eq("user_id", existingUser.id)
        .maybeSingle();
      const first = row?.first_name ?? "";
      const last = row?.last_name ?? "";
      const full = `${first} ${last}`.trim();
      accountDisplayName = full.length > 0 ? full : null;
    }

    revalidatePath("/profiles");
    return {
      ok: true,
      data: {
        linkId: link.id,
        inviteStatus: existingUser ? "accepted" : "pending",
        accountDisplayName
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return fail(error instanceof Error ? error.message : "Could not share profile.");
  }
}

export async function removeProfileShareAction(
  input: z.input<typeof removeShareSchema>
): Promise<ActionResult> {
  const parsed = removeShareSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Invalid request.");
  }

  try {
    const user = await requireAuth();
    const supabase = await createSupabaseServer();
    const service = createOptionalSupabaseServiceRoleClient();
    const client = service ?? supabase;

    // Look up the link, then verify caller is a manager of the same profile.
    const { data: link } = await client
      .schema("people")
      .from("profile_links")
      .select("id, profile_id, relationship_type")
      .eq("id", parsed.data.linkId)
      .maybeSingle();
    if (!link) return fail("Share not found.");
    if (link.relationship_type === "self") return fail("Can't remove the owner of a profile.");

    const { data: myLink } = await supabase
      .schema("people")
      .from("profile_links")
      .select("id, can_manage")
      .eq("profile_id", link.profile_id)
      .eq("account_user_id", user.id)
      .is("org_id", null)
      .maybeSingle();
    if (!myLink || !myLink.can_manage) {
      return fail("You don't have permission.");
    }

    const { error } = await client
      .schema("people")
      .from("profile_links")
      .delete()
      .eq("id", parsed.data.linkId);
    if (error) return fail(error.message);

    revalidatePath("/profiles");
    return { ok: true, data: undefined };
  } catch (error) {
    rethrowIfNavigationError(error);
    return fail(error instanceof Error ? error.message : "Could not remove share.");
  }
}

export async function deleteAccountProfileAction(
  input: z.input<typeof deleteSchema>
): Promise<ActionResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid request.");

  try {
    const user = await requireAuth();
    const supabase = await createSupabaseServer();
    const { data: myLink } = await supabase
      .schema("people")
      .from("profile_links")
      .select("id, can_manage, relationship_type")
      .eq("profile_id", parsed.data.profileId)
      .eq("account_user_id", user.id)
      .is("org_id", null)
      .maybeSingle();
    if (!myLink || !myLink.can_manage) return fail("You don't have permission.");
    if (myLink.relationship_type === "self") {
      return fail("You can't delete your own profile. It comes from your account.");
    }

    const service = createOptionalSupabaseServiceRoleClient();
    const client = service ?? supabase;
    const { error } = await client
      .schema("people")
      .from("profiles")
      .delete()
      .eq("id", parsed.data.profileId);
    if (error) return fail(error.message);

    revalidatePath("/profiles");
    return { ok: true, data: undefined };
  } catch (error) {
    rethrowIfNavigationError(error);
    return fail(error instanceof Error ? error.message : "Could not delete profile.");
  }
}
