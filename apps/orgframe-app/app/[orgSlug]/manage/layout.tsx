import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ManageSidebar, ManageSidebarMobile } from "@/src/features/core/navigation/components/ToolsSidebar";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { getOrgCapabilities } from "@/src/shared/permissions/orgCapabilities";

export const metadata: Metadata = {
  title: "Manage"
};

/**
 * Manage permission gate + sidebar. The parent [orgSlug] layout
 * already provides AppShell, so this layout renders the same
 * `sidebar-shell` grid that AppShell would have rendered if a
 * sidebar were passed in directly — scoped to /manage routes.
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

  return (
    <div className="sidebar-shell">
      <aside className="sidebar-shell__sidebar">
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
      </aside>
      <div className="sidebar-shell__content">{children}</div>
    </div>
  );
}
