"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createOptionalSupabaseServiceRoleClient, createSupabaseServer } from "@/src/shared/data-api/server";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { requirePermission } from "@/src/shared/permissions/requirePermission";
import { rethrowIfNavigationError } from "@/src/shared/navigation/rethrowIfNavigationError";

const updateAccountDetailsSchema = z.object({
  orgSlug: z.string().trim().min(1).optional(),
  targetUserId: z.string().uuid().optional(),
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  avatarPath: z.string().trim().max(500).optional()
});

const readAccountDetailsSchema = z.object({
  orgSlug: z.string().trim().min(1),
  targetUserId: z.string().uuid()
});

type AccountDetails = {
  userId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarPath: string | null;
};

type AccountActionFailureCode = "invalid_input" | "forbidden" | "action_failed" | "service_not_configured";

type AccountActionResult<TData = undefined> =
  | {
      ok: true;
      data: TData;
    }
  | {
      ok: false;
      code: AccountActionFailureCode;
      error: string;
    };

function asFailure(code: AccountActionFailureCode, error: string): AccountActionResult<never> {
  return { ok: false, code, error };
}

function normalizeOptional(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export async function readAccountDetailsAction(input: z.input<typeof readAccountDetailsSchema>): Promise<AccountActionResult<{ account: AccountDetails }>> {
  const parsed = readAccountDetailsSchema.safeParse(input);
  if (!parsed.success) {
    return asFailure("invalid_input", "Please provide valid account details parameters.");
  }

  try {
    const payload = parsed.data;
    const orgContext = await getOrgAuthContext(payload.orgSlug);
    requirePermission(orgContext.membershipPermissions, "people.read");

    const serviceClient = createOptionalSupabaseServiceRoleClient();
    if (!serviceClient) {
      return asFailure("service_not_configured", "Service role key is not configured.");
    }

    const [{ data: profile, error: profileError }, { data: authUser }] = await Promise.all([
      serviceClient
        .schema("people")
        .from("users")
        .select("user_id, first_name, last_name, avatar_path")
        .eq("user_id", payload.targetUserId)
        .maybeSingle(),
      serviceClient.auth.admin.getUserById(payload.targetUserId)
    ]);

    if (profileError) {
      return asFailure("action_failed", "Unable to load account details right now.");
    }

    return {
      ok: true,
      data: {
        account: {
          userId: payload.targetUserId,
          email: authUser.user?.email ?? null,
          firstName: profile?.first_name ?? null,
          lastName: profile?.last_name ?? null,
          avatarPath: profile?.avatar_path ?? null
        }
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asFailure("action_failed", "Unable to load account details right now.");
  }
}

export async function updateAccountDetailsAction(
  input: z.input<typeof updateAccountDetailsSchema>
): Promise<AccountActionResult<{ account: AccountDetails }>> {
  const parsed = updateAccountDetailsSchema.safeParse(input);
  if (!parsed.success) {
    return asFailure("invalid_input", "Please provide valid account details.");
  }

  try {
    const payload = parsed.data;
    const supabase = await createSupabaseServer();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return asFailure("forbidden", "You must be signed in to edit account details.");
    }

    const targetUserId = payload.targetUserId ?? user.id;
    const isSelfEdit = targetUserId === user.id;

    if (!isSelfEdit) {
      if (!payload.orgSlug) {
        return asFailure("forbidden", "An organization context is required for admin account edits.");
      }

      const orgContext = await getOrgAuthContext(payload.orgSlug);
      requirePermission(orgContext.membershipPermissions, "people.write");
    }

    const serviceClient = createOptionalSupabaseServiceRoleClient();
    const writeClient = !isSelfEdit ? serviceClient : (serviceClient ?? supabase);

    if (!writeClient) {
      return asFailure("service_not_configured", "Service role key is required to edit other accounts.");
    }

    const firstName = normalizeOptional(payload.firstName);
    const lastName = normalizeOptional(payload.lastName);
    const avatarPath = normalizeOptional(payload.avatarPath);

    const { error } = await writeClient.schema("people").from("users").upsert(
      {
        user_id: targetUserId,
        first_name: firstName,
        last_name: lastName,
        avatar_path: avatarPath
      },
      { onConflict: "user_id" }
    );

    if (error) {
      return asFailure("action_failed", "Unable to save account details right now.");
    }

    let email: string | null = null;
    if (serviceClient) {
      const { data: authUser } = await serviceClient.auth.admin.getUserById(targetUserId);
      email = authUser.user?.email ?? null;
    } else if (isSelfEdit) {
      email = user.email ?? null;
    }

    if (payload.orgSlug) {
      revalidatePath(`/${payload.orgSlug}/manage/people`);
    }
    if (isSelfEdit) {
      revalidatePath("/settings");
    }

    return {
      ok: true,
      data: {
        account: {
          userId: targetUserId,
          email,
          firstName,
          lastName,
          avatarPath
        }
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asFailure("action_failed", "Unable to save account details right now.");
  }
}
