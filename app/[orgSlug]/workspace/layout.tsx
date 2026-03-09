import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { WorkspaceSidebar, WorkspaceSidebarMobile } from "@/components/workspace/WorkspaceSidebar";
import { UniversalAppShell } from "@/components/shared/UniversalAppShell";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { getOrgCapabilities } from "@/lib/permissions/orgCapabilities";

export const metadata: Metadata = {
  title: "Workspace"
};

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

  if (!capabilities.workspace.canAccessArea) {
    redirect("/forbidden");
  }

  return (
    <UniversalAppShell
      mobileSidebar={<WorkspaceSidebarMobile features={orgContext.features} orgSlug={orgContext.orgSlug} />}
      sidebar={<WorkspaceSidebar features={orgContext.features} orgSlug={orgContext.orgSlug} />}
    >
      {children}
    </UniversalAppShell>
  );
}
