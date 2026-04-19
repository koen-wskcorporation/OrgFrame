import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthLoginPagePopup } from "@/src/features/core/auth/components/AuthLoginPagePopup";
import { AuthShell } from "@/src/features/core/auth/components/AuthShell";
import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";
import type { AuthMode } from "@/src/features/core/auth/components/AuthDialog";

export const metadata: Metadata = {
  title: "Sign In"
};

const errorMessageByCode: Record<string, string> = {
  "1": "Unable to continue. Check your details and try again.",
  handoff_failed: "That sign-in link is no longer valid. Try again."
};

const infoMessageByCode: Record<string, string> = {
  signup_check_email: "Account created. Verify your email, then sign in.",
  password_updated: "Password updated. Sign in with your new password."
};

function normalizeNextPath(value: string | undefined, fallbackPath = "/") {
  if (!value) {
    return fallbackPath;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/auth")) {
    return fallbackPath;
  }

  return trimmed;
}

function normalizeReturnTo(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return `${parsed.protocol}//${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return null;
  }
}

export default async function AuthPage({
  searchParams
}: {
  searchParams: Promise<{ mode?: string; error?: string; message?: string; next?: string; return_to?: string }>;
}) {
  const [user, query] = await Promise.all([getSessionUser(), searchParams]);
  const nextPath = normalizeNextPath(query.next);
  const returnTo = normalizeReturnTo(query.return_to);

  if (user) {
    redirect(nextPath);
  }

  const errorMessage = query.error ? errorMessageByCode[query.error] ?? "Authentication failed." : null;
  const infoMessage = query.message ? infoMessageByCode[query.message] ?? query.message : null;
  const initialMode: AuthMode = query.mode === "signup" ? "signup" : "signin";

  return (
    <AuthShell subtitle="Continue with your email to sign in or create your account." title="Login">
      <AuthLoginPagePopup
        errorMessage={errorMessage}
        infoMessage={infoMessage}
        initialMode={initialMode}
        nextPath={nextPath}
        returnTo={returnTo}
      />
      <p className="mt-5 text-center text-sm text-text-muted">
        Need to reset your password?{" "}
        <Link className="font-medium text-text underline underline-offset-2 hover:text-text-muted" href="/auth/reset">
          Reset it here
        </Link>
      </p>
    </AuthShell>
  );
}
