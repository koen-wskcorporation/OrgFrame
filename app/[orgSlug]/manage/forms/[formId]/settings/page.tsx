import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Form Settings"
};

export default async function OrgManageFormSettingsRedirectPage({
  params
}: {
  params: Promise<{ orgSlug: string; formId: string }>;
}) {
  const { orgSlug, formId } = await params;
  redirect(`/${orgSlug}/tools/forms/${formId}/editor?panel=settings`);
}
