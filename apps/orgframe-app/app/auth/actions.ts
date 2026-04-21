"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/src/shared/data-api/server";
import { createOptionalSupabaseServiceRoleClient } from "@/src/shared/data-api/server";
import { getCanonicalAuthHost, getPlatformHost, normalizeHost } from "@/src/shared/domains/customDomains";
import { parseHostWithPort } from "@/src/shared/domains/hostHeaders";
import { mintHandoffToken, resolveAllowedReturnOrigin, revokeHandoffTokensForUser } from "@/src/shared/auth/handoff";

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

type SendActivationEmailResult = {
  ok: boolean;
  message: string;
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
    .schema("people").from("users")
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

async function getRequestContext() {
  const headerStore = await headers();
  const forwardedProto = headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const protocol = forwardedProto === "https" || forwardedProto === "http" ? forwardedProto : process.env.NODE_ENV === "production" ? "https" : "http";
  const forwardedHost = headerStore.get("x-forwarded-host")?.split(",")[0]?.trim() ?? "";
  const hostHeader = headerStore.get("host")?.split(",")[0]?.trim() ?? "";
  const parsed = parseHostWithPort(forwardedHost || hostHeader);
  const host = parsed.host || normalizeHost(getCanonicalAuthHost());
  const hostWithPort = parsed.hostWithPort || host;
  const origin = `${protocol}://${hostWithPort}`;
  return { protocol, host, hostWithPort, origin };
}

function buildCanonicalAuthUrl(pathAndQuery: string, protocol: string, currentHostWithPort: string) {
  const canonicalHost = normalizeHost(getCanonicalAuthHost());
  // In dev, canonical host may equal the current hostname; keep port for convenience.
  const currentHostOnly = currentHostWithPort.split(":")[0] ?? "";
  if (canonicalHost && currentHostOnly === canonicalHost) {
    return `${protocol}://${currentHostWithPort}${pathAndQuery}`;
  }
  return `${protocol}://${canonicalHost}${pathAndQuery}`;
}

function mergeQuery(path: string, params: Record<string, string | undefined>) {
  const [base, existingQuery] = path.split("?");
  const search = new URLSearchParams(existingQuery ?? "");
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value.length > 0) {
      search.set(key, value);
    }
  }
  const qs = search.toString();
  return qs ? `${base}?${qs}` : (base ?? "/");
}

async function redirectToCanonicalIfNeeded(params: {
  targetPath: string;
  nextPath: string;
  email?: string;
  prefill?: Record<string, string>;
}): Promise<{ context: Awaited<ReturnType<typeof getRequestContext>>; isCanonical: boolean }> {
  const context = await getRequestContext();
  const canonicalHost = normalizeHost(getCanonicalAuthHost());
  const isCanonical = !canonicalHost || context.host === canonicalHost;

  if (!isCanonical) {
    const returnTo = `${context.origin}${params.nextPath}`;
    const targetUrl = buildCanonicalAuthUrl(
      mergeQuery(params.targetPath, {
        return_to: returnTo,
        email: params.email,
        ...params.prefill
      }),
      context.protocol,
      context.hostWithPort
    );
    redirect(targetUrl);
  }

  return { context, isCanonical };
}

function getPlatformOrigin(context: Awaited<ReturnType<typeof getRequestContext>>): string {
  const platformHost = normalizeHost(getPlatformHost());
  if (!platformHost) {
    return context.origin;
  }

  const hostWithPort = context.hostWithPort.split(":")[0] === platformHost
    ? context.hostWithPort
    : context.hostWithPort.includes(":")
      ? `${platformHost}:${context.hostWithPort.split(":")[1]}`
      : platformHost;

  return `${context.protocol}://${hostWithPort}`;
}

async function handlePostAuthRedirect(params: {
  formData: FormData;
  nextPath: string;
}): Promise<never> {
  const context = await getRequestContext();
  const canonicalHost = normalizeHost(getCanonicalAuthHost());
  const returnToRaw = cleanValue(params.formData.get("return_to"));

  if (returnToRaw) {
    const allowed = await resolveAllowedReturnOrigin(returnToRaw);
    if (allowed && allowed.host !== canonicalHost) {
      if (allowed.isPlatform) {
        // Shared eTLD+1 with canonical — cookie is already valid. Redirect directly.
        redirect(`${allowed.origin}${params.nextPath}`);
      }

      const supabase = await createSupabaseServer();
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (session) {
        let handoffUrl: string | null = null;
        try {
          const minted = await mintHandoffToken({
            session: {
              accessToken: session.access_token,
              refreshToken: session.refresh_token
            },
            targetOrigin: allowed.origin,
            nextPath: params.nextPath,
            userId: session.user.id
          });
          handoffUrl = minted.url;
        } catch {
          handoffUrl = null;
        }
        if (handoffUrl) {
          redirect(handoffUrl);
        }
      }
    }
  }

  // No usable return_to — send user off the auth host to the platform.
  redirect(`${getPlatformOrigin(context)}${params.nextPath}`);
}

export async function signInAction(formData: FormData) {
  const email = cleanValue(formData.get("email")).toLowerCase();
  const password = cleanValue(formData.get("password"));
  const nextPath = normalizeNextPath(formData.get("next"));

  if (!isLikelyEmail(email) || !password) {
    redirect(withNext("/auth?error=1", nextPath));
  }

  await redirectToCanonicalIfNeeded({
    targetPath: "/auth",
    nextPath,
    email
  });

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    redirect(withNext("/auth?error=1", nextPath));
  }

  await handlePostAuthRedirect({ formData, nextPath });
}

export async function signUpAction(formData: FormData) {
  const email = cleanValue(formData.get("email")).toLowerCase();
  const password = cleanValue(formData.get("password"));
  const nextPath = normalizeNextPath(formData.get("next"));

  if (!isLikelyEmail(email) || password.length < 8) {
    redirect(withNext("/auth?mode=signup&error=1", nextPath));
  }

  await redirectToCanonicalIfNeeded({
    targetPath: "/auth",
    nextPath,
    email,
    prefill: { mode: "signup" }
  });

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

  await handlePostAuthRedirect({ formData, nextPath });
}

function normalizeReturnToOrigin(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return `${parsed.protocol}//${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return null;
  }
}

function buildCanonicalOrigin(context: Awaited<ReturnType<typeof getRequestContext>>) {
  const canonicalHost = normalizeHost(getCanonicalAuthHost());
  if (!canonicalHost) {
    return context.origin;
  }

  if (context.host === canonicalHost) {
    return context.origin;
  }

  const existingPort = context.hostWithPort.includes(":") ? context.hostWithPort.split(":")[1] : "";
  const hostWithPort = existingPort ? `${canonicalHost}:${existingPort}` : canonicalHost;
  return `${context.protocol}://${hostWithPort}`;
}

type StartOAuthResult = { ok: true; url: string } | { ok: false; error: string };

export async function startGoogleOAuthAction(params: { nextPath?: string; returnTo?: string | null }): Promise<StartOAuthResult> {
  const nextPath = normalizeNextPath(params.nextPath ?? null);
  const returnTo = normalizeReturnToOrigin(params.returnTo ?? null);

  const context = await getRequestContext();
  const canonicalOrigin = buildCanonicalOrigin(context);

  const callbackUrl = new URL("/auth/callback", canonicalOrigin);
  callbackUrl.searchParams.set("next", nextPath);
  if (returnTo) {
    callbackUrl.searchParams.set("return_to", returnTo);
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
      skipBrowserRedirect: true,
      queryParams: {
        access_type: "offline",
        prompt: "select_account"
      }
    }
  });

  if (error || !data?.url) {
    return { ok: false, error: error?.message ?? "Unable to start Google sign-in." };
  }

  return { ok: true, url: data.url };
}

export async function signOutAction(_formData: FormData) {
  const supabase = await createSupabaseServer();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  await supabase.auth.signOut({ scope: "global" });

  if (user) {
    await revokeHandoffTokensForUser(user.id).catch(() => undefined);
  }

  redirect("/auth");
}

function buildCallbackRedirectTo(context: { protocol: string; host: string; hostWithPort: string; origin: string }) {
  const canonicalHost = normalizeHost(getCanonicalAuthHost());
  const canonicalHostWithPort = context.host === canonicalHost ? context.hostWithPort : canonicalHost;
  const canonicalOrigin = canonicalHost ? `${context.protocol}://${canonicalHostWithPort}` : context.origin;

  const params = new URLSearchParams();
  params.set("next", "/auth/reset?mode=update");
  if (context.host !== canonicalHost) {
    params.set("return_to", context.origin);
  }

  return `${canonicalOrigin}/auth/callback?${params.toString()}`;
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = cleanValue(formData.get("email")).toLowerCase();

  if (!isLikelyEmail(email)) {
    redirect("/auth/reset?error=invalid_email");
  }

  const context = await getRequestContext();
  const redirectTo = buildCallbackRedirectTo(context);

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo
  });

  if (error) {
    redirect("/auth/reset?error=reset_request_failed");
  }

  redirect("/auth/reset?message=reset_email_sent");
}

export async function sendActivationEmail(input: { email: string }): Promise<SendActivationEmailResult> {
  const email = cleanValue(input.email).toLowerCase();
  if (!isLikelyEmail(email)) {
    return {
      ok: false,
      message: "Invalid email address."
    };
  }

  try {
    const context = await getRequestContext();
    const redirectTo = buildCallbackRedirectTo(context);
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo
    });

    if (error) {
      return {
        ok: false,
        message: "Unable to send activation email right now."
      };
    }

    return {
      ok: true,
      message: "Activation email sent. Check your inbox to verify your email and set a password."
    };
  } catch {
    return {
      ok: false,
      message: "Unable to send activation email right now."
    };
  }
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
