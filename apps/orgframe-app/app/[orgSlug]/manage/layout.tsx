import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { SidebarShell } from "@/src/features/core/layout/components/SidebarShell";
import { ManageSidebar, ManageSidebarMobile } from "@/src/features/core/navigation/components/ToolsSidebar";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { getOrgCapabilities } from "@/src/shared/permissions/orgCapabilities";

export const metadata: Metadata = {
  title: "Manage"
};

/**
 * Manage permission gate + sidebar shell. Renders the manage sidebar
 * directly inside ManageShell so it's scoped to /manage routes and
 * can't leak onto public pages (the previous @sidebar parallel-slot
 * implementation suffered from slot-state bleed across soft navs).
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

  const roleLabel = orgContext.membershipRole
    .split(/[-_ ]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  const sidebar = (
    <>
      <div className="hidden lg:block">
        <ManageSidebar
          capabilities={capabilities}
          orgSlug={orgContext.orgSlug}
          roleLabel={roleLabel}
          toolAvailability={orgContext.toolAvailability}
        />
      </div>
      <div className="lg:hidden">
        <ManageSidebarMobile
          capabilities={capabilities}
          orgSlug={orgContext.orgSlug}
          roleLabel={roleLabel}
          toolAvailability={orgContext.toolAvailability}
        />
      </div>
    </>
  );

  return <SidebarShell sidebar={sidebar}>{children}</SidebarShell>;
}
