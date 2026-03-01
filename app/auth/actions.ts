"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";

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
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/auth/login")) {
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
    redirect(withNext("/auth/login?error=1", nextPath));
  }

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    redirect(withNext("/auth/login?error=1", nextPath));
  }

  redirect(nextPath);
}

export async function signUpAction(formData: FormData) {
  const email = cleanValue(formData.get("email")).toLowerCase();
  const password = cleanValue(formData.get("password"));
  const nextPath = normalizeNextPath(formData.get("next"));

  if (!isLikelyEmail(email) || password.length < 8) {
    redirect(withNext("/auth/login?mode=signup&error=1", nextPath));
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });

  if (error) {
    redirect(withNext("/auth/login?mode=signup&error=1", nextPath));
  }

  if (!data.session) {
    redirect(withNext("/auth/login?mode=signin&message=signup_check_email", nextPath));
  }

  redirect(nextPath);
}

export async function signOutAction(_formData: FormData) {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/auth/login");
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
  redirect("/auth/login?message=password_updated");
}
