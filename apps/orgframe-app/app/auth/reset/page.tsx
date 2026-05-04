import Link from "next/link";
import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { SubmitButton } from "@orgframe/ui/primitives/submit-button";
import { CenteredFormShell } from "@/src/features/core/layout/components/CenteredFormShell";
import { requestPasswordResetAction, updatePasswordFromResetAction } from "@/app/auth/actions";

export const metadata: Metadata = {
  title: "Reset Password"
};

const errorMessageByCode: Record<string, string> = {
  invalid_email: "Enter a valid email address.",
  reset_request_failed: "Unable to send reset email right now.",
  callback_failed: "Unable to validate this reset link. Request a new one.",
  reset_session_missing: "Reset link is invalid or expired. Request a new email.",
  weak_password: "Password must be at least 8 characters.",
  password_mismatch: "Passwords do not match.",
  password_update_failed: "Unable to update password right now."
};

const infoMessageByCode: Record<string, string> = {
  reset_email_sent: "Reset email sent. Open the link in your email to continue."
};

export default async function ResetPage({
  searchParams
}: {
  searchParams: Promise<{ mode?: string; error?: string; message?: string }>;
}) {
  const query = await searchParams;
  const isUpdateMode = query.mode === "update";
  const errorMessage = query.error ? errorMessageByCode[query.error] ?? "Unable to continue." : null;
  const infoMessage = query.message ? infoMessageByCode[query.message] ?? query.message : null;

  return (
    <CenteredFormShell
      subtitle={isUpdateMode ? "Choose a new account password to finish reset." : "Enter your account email to receive a reset link."}
      title={isUpdateMode ? "Set new password" : "Reset password"}
    >
      <div className="space-y-4">
        {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}
        {infoMessage ? <Alert variant="info">{infoMessage}</Alert> : null}

        {isUpdateMode ? (
          <form action={updatePasswordFromResetAction} className="space-y-3">
            <FormField hint="Minimum 8 characters" label="New password">
              <Input autoComplete="new-password" name="password" required type="password" />
            </FormField>
            <FormField label="Confirm password">
              <Input autoComplete="new-password" name="confirmPassword" required type="password" />
            </FormField>
            <SubmitButton className="w-full">Update password</SubmitButton>
          </form>
        ) : (
          <form action={requestPasswordResetAction} className="space-y-3">
            <FormField label="Email">
              <Input autoComplete="email" name="email" required type="email" />
            </FormField>
            <SubmitButton className="w-full">Send reset email</SubmitButton>
          </form>
        )}

        <p className="mt-5 text-center text-sm text-text-muted">
          Remembered your password?{" "}
          <Link className="font-medium text-text underline underline-offset-2 hover:text-text-muted" href="/auth">
            Back to sign in
          </Link>
        </p>
      </div>
    </CenteredFormShell>
  );
}
