import { ManageSidebar, ManageSidebarMobile } from "@/src/features/core/navigation/components/ToolsSidebar";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { getOrgCapabilities } from "@/src/shared/permissions/orgCapabilities";

/**
 * Shared renderer for the manage sidebar slot. Used by both
 * `manage/page.tsx` (the bare `/manage` route) and
 * `manage/[...rest]/page.tsx` (everything below it).
 */
export async function renderManageSidebarSlot(orgSlug: string) {
  const orgContext = await getOrgAuthContext(orgSlug).catch(() => null);
  if (!orgContext) return null;

  const capabilities = getOrgCapabilities(orgContext.membershipPermissions);
  if (!capabilities.manage.canAccessArea) return null;

  const roleLabel = orgContext.membershipRole
    .split(/[-_ ]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return (
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
}
