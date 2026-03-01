import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { AssetTile } from "@/components/ui/asset-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { requireAuth } from "@/lib/auth/requireAuth";

export const metadata: Metadata = {
  title: "Account"
};

const successMessageByCode: Record<string, string> = {
  profile: "Profile updated successfully.",
  password: "Password updated successfully."
};

const errorMessageByCode: Record<string, string> = {
  profile_save_failed: "Unable to save profile details right now.",
  service_unavailable: "We could not reach the account service. Please try again in a moment.",
  weak_password: "Password must be at least 8 characters.",
  password_update_failed: "Unable to update password right now."
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
    redirect("/auth/login");
  }

  const successMessage = query.saved ? successMessageByCode[query.saved] : null;
  const errorMessage = query.error ? errorMessageByCode[query.error] : null;
  const fullName = [currentUser.firstName, currentUser.lastName].filter(Boolean).join(" ") || "No name set";

  return (
    <>
      <PageHeader description="Manage your profile details and account security." showBorder={false} title="Account" />

      {successMessage ? <Alert variant="success">{successMessage}</Alert> : null}
      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your identity details shown across organizations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 rounded-control border bg-surface-muted p-3">
            {currentUser.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt={`${fullName} avatar`} className="h-12 w-12 rounded-full border object-cover" src={currentUser.avatarUrl} />
            ) : (
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border bg-surface text-sm font-semibold">
                {(fullName.charAt(0) || "A").toUpperCase()}
              </span>
            )}
            <div>
              <p className="text-sm font-semibold">{fullName}</p>
              <p className="text-xs text-text-muted">{currentUser.email ?? "No email available"}</p>
            </div>
          </div>

          <form action="/account/profile" className="space-y-3" method="post">
            <div className="grid gap-3 md:grid-cols-2">
              <FormField label="First name">
                <Input defaultValue={currentUser.firstName ?? ""} name="firstName" />
              </FormField>
              <FormField label="Last name">
                <Input defaultValue={currentUser.lastName ?? ""} name="lastName" />
              </FormField>
              <FormField label="Profile picture">
                <AssetTile
                  constraints={{
                    accept: "image/*",
                    maxSizeMB: 5,
                    aspect: "square",
                    recommendedPx: {
                      w: 640,
                      h: 640
                    }
                  }}
                  emptyLabel="Upload profile picture"
                  fit="contain"
                  initialPath={currentUser.avatarPath}
                  initialUrl={currentUser.avatarUrl}
                  kind="account"
                  name="avatarPath"
                  previewAlt={`${fullName} avatar`}
                  purpose="profile-photo"
                  specificationText="PNG, JPG, WEBP, HEIC, or SVG"
                  title="Profile picture"
                />
              </FormField>
            </div>
            <SubmitButton>Save profile</SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Set a new password for this account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/account/password" className="flex flex-col gap-3 md:flex-row md:items-end" method="post">
            <FormField className="w-full" hint="Minimum 8 characters" label="New password">
              <Input name="newPassword" required type="password" />
            </FormField>
            <SubmitButton>Update password</SubmitButton>
          </form>
        </CardContent>
      </Card>

    </>
  );
}
