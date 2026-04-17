import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ManageSidebar, ManageSidebarMobile } from "@/src/features/core/navigation/components/ToolsSidebar";
import { UniversalAppShell } from "@/src/features/core/layout/components/UniversalAppShell";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { getOrgCapabilities } from "@/src/shared/permissions/orgCapabilities";

export const metadata: Metadata = {
  title: "Manage"
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

  if (!capabilities.manage.canAccessArea) {
    redirect("/forbidden?reason=tools-layout-access");
  }

  return (
    <UniversalAppShell
      mobileSidebar={<ManageSidebarMobile capabilities={capabilities} orgSlug={orgContext.orgSlug} toolAvailability={orgContext.toolAvailability} />}
      sidebar={<ManageSidebar capabilities={capabilities} orgSlug={orgContext.orgSlug} toolAvailability={orgContext.toolAvailability} />}
    >
      {children}
    </UniversalAppShell>
  );
}
