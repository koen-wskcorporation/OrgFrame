import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ToolsSidebar, ToolsSidebarMobile } from "@/components/manage/ToolsSidebar";
import { UniversalAppShell } from "@/components/shared/UniversalAppShell";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { getOrgCapabilities } from "@/lib/permissions/orgCapabilities";

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
    redirect("/forbidden");
  }

  return (
    <UniversalAppShell
      mobileSidebar={<ToolsSidebarMobile orgSlug={orgContext.orgSlug} />}
      sidebar={<ToolsSidebar orgSlug={orgContext.orgSlug} />}
    >
      {children}
    </UniversalAppShell>
  );
}
