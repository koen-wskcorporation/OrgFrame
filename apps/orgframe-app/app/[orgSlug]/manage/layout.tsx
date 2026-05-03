import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { getOrgCapabilities } from "@/src/shared/permissions/orgCapabilities";

export const metadata: Metadata = {
  title: "Manage"
};

/**
 * Manage permission gate. The visual shell (sidebar + topbar) is owned
 * by the parent [orgSlug]/layout.tsx via parallel-route slots; the
 * manage sidebar specifically is rendered by the @sidebar/manage
 * parallel-route slot — see ../@sidebar/manage/_render.tsx.
 */
export default async function OrgManageLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const orgContext = await getOrgAuthContext(orgSlug);
  const capabilities = getOrgCapabilities(orgContext.membershipPermissions);

  if (!capabilities.manage.canAccessArea) {
    redirect("/forbidden?reason=manage-layout-access");
  }

  return <>{children}</>;
}
