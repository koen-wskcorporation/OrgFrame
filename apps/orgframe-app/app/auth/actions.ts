"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createOptionalSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

function cleanValue(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function isLikelyEmail(value: string) {
  return value.includes("@") && value.includes(".");
}

function normalizeNextPath(value: FormDataEntryValue | null, fallbackPath = "/") {
  if (typeof value !== "string") {
    return fallbackPath;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/auth")) {
    return fallbackPath;
  }

  return trimmed;
}

function withNext(path: string, nextPath: string) {
  if (!nextPath || nextPath === "/") {
    return path;
  }

  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}next=${encodeURIComponent(nextPath)}`;
}

type AuthAccountLookupResult = {
  ok: boolean;
  email: string;
  exists: boolean;
  requiresActivation: boolean;
  displayName: string | null;
  avatarUrl: string | null;
};

type AuthUserRow = {
  id: string;
  email: string | null;
  email_confirmed_at: string | null;
  raw_user_meta_data: Record<string, unknown> | null;
};

function cleanMetaString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function deriveDisplayName(metadata: Record<string, unknown> | null) {
  const first = cleanMetaString(metadata?.first_name);
  const last = cleanMetaString(metadata?.last_name);
  const full = cleanMetaString(`${first ?? ""} ${last ?? ""}`);
  return full ?? cleanMetaString(metadata?.full_name) ?? null;
}

async function findAuthUserByEmail(email: string): Promise<AuthUserRow | null> {
  const supabase = createOptionalSupabaseServiceRoleClient();
  if (!supabase) {
    return null;
  }

  const normalizedEmail = email.trim().toLowerCase();

  const { data, error } = await supabase
    .schema("auth")
    .from("users")
    .select("id, email, email_confirmed_at, raw_user_meta_data")
    .eq("email", normalizedEmail)
    .limit(1)
    .maybeSingle();

  if (!error) {
    return (data ?? null) as AuthUserRow | null;
  }

  if (!error.message.toLowerCase().includes("invalid schema")) {
    return null;
  }

  const { data: listed, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });

  if (listError) {
    return null;
  }

  const found = (listed?.users ?? []).find((user) => (user.email ?? "").trim().toLowerCase() === normalizedEmail);
  if (!found) {
    return null;
  }

  return {
    id: found.id,
    email: found.email ?? null,
    email_confirmed_at: found.email_confirmed_at ?? null,
    raw_user_meta_data: (found.user_metadata ?? null) as Record<string, unknown> | null
  };
}

export async function lookupAuthAccountAction(formData: FormData): Promise<AuthAccountLookupResult> {
  const email = cleanValue(formData.get("email")).toLowerCase();

  if (!isLikelyEmail(email)) {
    return {
      ok: false,
      email,
      exists: false,
      requiresActivation: false,
      displayName: null,
      avatarUrl: null
    };
  }

  const supabase = createOptionalSupabaseServiceRoleClient();
  if (!supabase) {
    return {
      ok: true,
      email,
      exists: false,
      requiresActivation: false,
      displayName: null,
      avatarUrl: null
    };
  }

  const user = await findAuthUserByEmail(email);
  if (!user) {
    return {
      ok: true,
      email,
      exists: false,
      requiresActivation: false,
      displayName: null,
      avatarUrl: null
    };
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("first_name, last_name, avatar_path")
    .eq("user_id", user.id)
    .maybeSingle();

  const firstName = cleanMetaString(profile?.first_name);
  const lastName = cleanMetaString(profile?.last_name);
  const profileName = cleanMetaString(`${firstName ?? ""} ${lastName ?? ""}`);
  const displayName = profileName ?? deriveDisplayName(user.raw_user_meta_data);

  let avatarUrl: string | null = null;
  if (typeof profile?.avatar_path === "string" && profile.avatar_path.trim().length > 0) {
    const { data: signed } = await supabase.storage.from("account-assets").createSignedUrl(profile.avatar_path, 60 * 10);
    avatarUrl = signed?.signedUrl ?? null;
  }

  const metadata = user.raw_user_meta_data ?? {};
  const importedFlag = metadata.sportsconnect_imported === true || metadata.sportsconnect_activation_required === true;
  const requiresActivation = importedFlag && !user.email_confirmed_at;

  return {
    ok: true,
    email,
    exists: true,
    requiresActivation,
    displayName,
    avatarUrl
  };
}

async function getRequestOrigin() {
  const headerStore = await headers();
  const forwardedProto = headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const forwardedHost = headerStore.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || headerStore.get("host");

  if (host) {
    const protocol = forwardedProto === "https" || forwardedProto === "http" ? forwardedProto : process.env.NODE_ENV === "production" ? "https" : "http";
    return `${protocol}://${host}`;
  }

  const fallbackOrigin = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "http://localhost:3000";
  return fallbackOrigin.replace(/\/+$/, "");
}

export async function signInAction(formData: FormData) {
  const email = cleanValue(formData.get("email")).toLowerCase();
  const password = cleanValue(formData.get("password"));
  const nextPath = normalizeNextPath(formData.get("next"));

  if (!isLikelyEmail(email) || !password) {
    redirect(withNext("/auth?error=1", nextPath));
  }

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    redirect(withNext("/auth?error=1", nextPath));
  }

  redirect(nextPath);
}

export async function signUpAction(formData: FormData) {
  const email = cleanValue(formData.get("email")).toLowerCase();
  const password = cleanValue(formData.get("password"));
  const nextPath = normalizeNextPath(formData.get("next"));

  if (!isLikelyEmail(email) || password.length < 8) {
    redirect(withNext("/auth?mode=signup&error=1", nextPath));
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });

  if (error) {
    redirect(withNext("/auth?mode=signup&error=1", nextPath));
  }

  if (!data.session) {
    redirect(withNext("/auth?mode=signin&message=signup_check_email", nextPath));
  }

  redirect(nextPath);
}

export async function signOutAction(_formData: FormData) {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/auth");
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = cleanValue(formData.get("email")).toLowerCase();

  if (!isLikelyEmail(email)) {
    redirect("/auth/reset?error=invalid_email");
  }

  const origin = await getRequestOrigin();
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent("/auth/reset?mode=update")}`;
  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo
  });

  if (error) {
    redirect("/auth/reset?error=reset_request_failed");
  }

  redirect("/auth/reset?message=reset_email_sent");
}

export async function updatePasswordFromResetAction(formData: FormData) {
  const password = cleanValue(formData.get("password"));
  const confirmPassword = cleanValue(formData.get("confirmPassword"));

  if (password.length < 8) {
    redirect("/auth/reset?mode=update&error=weak_password");
  }

  if (confirmPassword !== password) {
    redirect("/auth/reset?mode=update&error=password_mismatch");
  }

  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/auth/reset?error=reset_session_missing");
  }

  const { error } = await supabase.auth.updateUser({
    password
  });

  if (error) {
    redirect("/auth/reset?mode=update&error=password_update_failed");
  }

  await supabase.auth.signOut();
  redirect("/auth?message=password_updated");
}
