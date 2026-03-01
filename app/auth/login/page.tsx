import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AuthLoginPagePopup } from "@/components/auth/AuthLoginPagePopup";
import { getSessionUser } from "@/lib/auth/getSessionUser";
import type { AuthMode } from "@/components/auth/AuthDialog";

export const metadata: Metadata = {
  title: "Sign In"
};

const errorMessageByCode: Record<string, string> = {
  "1": "Unable to continue. Check your details and try again."
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
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/auth/login")) {
    return fallbackPath;
  }

  return trimmed;
}

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ mode?: string; error?: string; message?: string; next?: string }>;
}) {
  const [user, query] = await Promise.all([getSessionUser(), searchParams]);
  const nextPath = normalizeNextPath(query.next);

  if (user) {
    redirect(nextPath);
  }

  const errorMessage = query.error ? errorMessageByCode[query.error] ?? "Authentication failed." : null;
  const infoMessage = query.message ? infoMessageByCode[query.message] ?? query.message : null;
  const initialMode: AuthMode = query.mode === "signup" ? "signup" : "signin";

  return (
    <main className="app-container flex min-h-[60vh] items-center justify-center py-8 md:py-10">
      <AuthLoginPagePopup errorMessage={errorMessage} infoMessage={infoMessage} initialMode={initialMode} nextPath={nextPath} />
    </main>
  );
}
