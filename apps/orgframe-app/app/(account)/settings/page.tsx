import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { Section } from "@orgframe/ui/primitives/section";
import { PageShell } from "@/src/features/core/layout/components/PageShell";
import { getCurrentUser } from "@/src/features/core/account/server/getCurrentUser";
import { requireAuth } from "@/src/features/core/auth/server/requireAuth";
import { getCanonicalAuthOrigin } from "@/src/shared/domains/customDomains";

export const metadata: Metadata = {
  title: "Settings"
};

const successMessageByCode: Record<string, string> = {
  password: "Password updated successfully."
};

const errorMessageByCode: Record<string, string> = {
  service_unavailable: "We could not reach the accounts server. Please try again in a moment."
};

export default async function AccountPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const sessionUser = await requireAuth();
  const currentUser = await getCurrentUser({
    sessionUser
  });
  const query = await searchParams;

  if (!currentUser) {
    redirect("/auth");
  }

  const successMessage = query.saved ? successMessageByCode[query.saved] : null;
  const errorMessage = query.error ? errorMessageByCode[query.error] : null;
  const passwordResetUrl = `${getCanonicalAuthOrigin()}/password-reset`;

  return (
    <PageShell description="Manage your account security." title="Settings">
      {successMessage ? <Alert variant="success">{successMessage}</Alert> : null}
      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

      <Section
        actions={
          <Button href={passwordResetUrl} variant="secondary">
            Reset password
          </Button>
        }
        description="We'll email you a secure link to set a new password. To edit your name or photo, open your profile in /profiles."
        fill={false}
        title="Password"
      />
    </PageShell>
  );
}
