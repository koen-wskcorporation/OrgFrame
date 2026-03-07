import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/getSessionUser";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { AppPage } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { signInAction, signUpAction } from "@/app/auth/actions";

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

type AuthMode = "signin" | "signup";

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

function getAuthModeHref(mode: AuthMode, nextPath: string) {
  const params = new URLSearchParams();

  if (mode === "signup") {
    params.set("mode", "signup");
  }

  if (nextPath !== "/") {
    params.set("next", nextPath);
  }

  const query = params.toString();
  return query ? `/auth/login?${query}` : "/auth/login";
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
  const signInHref = getAuthModeHref("signin", nextPath);
  const signUpHref = getAuthModeHref("signup", nextPath);

  return (
    <AppPage className="py-8 md:py-10">
      <div className="mx-auto grid w-full max-w-5xl gap-5 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <section className="rounded-card border bg-surface p-5 shadow-card md:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Sports SaaS</p>
          <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-text md:text-4xl">Run your organization from one system.</h1>
          <p className="mt-3 text-sm leading-relaxed text-text-muted md:text-base">
            Publish your website, manage programs, coordinate facilities, and process registrations without stitching together separate tools.
          </p>
          <div className="mt-5 grid gap-2 text-sm text-text-muted sm:grid-cols-2">
            <p className="rounded-control border bg-surface-muted/45 px-3 py-2">Program + team planning workflows</p>
            <p className="rounded-control border bg-surface-muted/45 px-3 py-2">Registration and submission operations</p>
            <p className="rounded-control border bg-surface-muted/45 px-3 py-2">Facility calendars with blackout control</p>
            <p className="rounded-control border bg-surface-muted/45 px-3 py-2">Custom org websites with page publishing</p>
          </div>
          <p className="mt-5 text-sm text-text-muted">
            New here?{" "}
            <Link className="text-link underline-offset-2 hover:underline" href={signUpHref}>
              Create your account
            </Link>
          </p>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>{initialMode === "signup" ? "Create account" : "Sign in"}</CardTitle>
            <CardDescription>
              {initialMode === "signup" ? "Start your organization workspace in a few minutes." : "Continue to your dashboard and organizations."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}
            {infoMessage ? <Alert variant="info">{infoMessage}</Alert> : null}

            <div className="grid grid-cols-2 gap-2">
              <Button href={signInHref} variant={initialMode === "signin" ? "secondary" : "ghost"}>
                Sign in
              </Button>
              <Button href={signUpHref} variant={initialMode === "signup" ? "secondary" : "ghost"}>
                Create account
              </Button>
            </div>

            {initialMode === "signin" ? (
              <form action={signInAction} className="space-y-3">
                <input name="next" type="hidden" value={nextPath} />
                <FormField label="Email">
                  <Input autoComplete="email" name="email" required type="email" />
                </FormField>
                <FormField label="Password">
                  <Input autoComplete="current-password" name="password" required type="password" />
                </FormField>
                <p className="text-right text-xs">
                  <Link className="text-link underline-offset-2 hover:underline" href="/auth/reset">
                    Forgot password?
                  </Link>
                </p>
                <SubmitButton className="w-full">Sign in</SubmitButton>
              </form>
            ) : (
              <form action={signUpAction} className="space-y-3">
                <input name="next" type="hidden" value={nextPath} />
                <FormField label="Email">
                  <Input autoComplete="email" name="email" required type="email" />
                </FormField>
                <FormField hint="Minimum 8 characters" label="Password">
                  <Input autoComplete="new-password" name="password" required type="password" />
                </FormField>
                <SubmitButton className="w-full">Create account</SubmitButton>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </AppPage>
  );
}
