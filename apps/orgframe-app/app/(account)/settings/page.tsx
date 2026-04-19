import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { SubmitButton } from "@orgframe/ui/primitives/submit-button";
import { listAccountPaymentMethods } from "@/src/features/billing/service";
import { getCurrentUser } from "@/src/features/core/account/server/getCurrentUser";
import { AccountPaymentMethodsCard } from "@/src/features/core/account/components/AccountPaymentMethodsCard";
import { AccountProfileCard } from "@/src/features/core/account/components/AccountProfileCard";
import { requireAuth } from "@/src/features/core/auth/server/requireAuth";

export const metadata: Metadata = {
  title: "Settings"
};

const successMessageByCode: Record<string, string> = {
  profile: "Profile updated successfully.",
  password: "Password updated successfully.",
  payment_method: "Payment method added successfully."
};

const errorMessageByCode: Record<string, string> = {
  profile_save_failed: "Unable to save profile details right now.",
  service_unavailable: "We could not reach the accounts server. Please try again in a moment.",
  weak_password: "Password must be at least 8 characters.",
  password_update_failed: "Unable to update password right now.",
  payment_method_cancelled: "Payment method setup was cancelled."
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
  const paymentMethods = currentUser ? await listAccountPaymentMethods(currentUser.userId).catch(() => []) : [];
  const query = await searchParams;

  if (!currentUser) {
    redirect("/auth");
  }

  const successMessage = query.saved ? successMessageByCode[query.saved] : null;
  const errorMessage = query.error ? errorMessageByCode[query.error] : null;
  return (
    <PageStack>
      <PageHeader description="Manage your profile details and account security." showBorder={false} title="Settings" />

      {successMessage ? <Alert variant="success">{successMessage}</Alert> : null}
      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

      <AccountProfileCard
        avatarPath={currentUser.avatarPath}
        avatarUrl={currentUser.avatarUrl}
        email={currentUser.email}
        firstName={currentUser.firstName}
        lastName={currentUser.lastName}
      />

      <AccountPaymentMethodsCard paymentMethods={paymentMethods} />

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Set a new password for this account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/settings/password" className="flex flex-col gap-3 md:flex-row md:items-end" method="post">
            <FormField className="w-full" hint="Minimum 8 characters" label="New password">
              <Input name="newPassword" required type="password" />
            </FormField>
            <SubmitButton>Update password</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </PageStack>
  );
}
