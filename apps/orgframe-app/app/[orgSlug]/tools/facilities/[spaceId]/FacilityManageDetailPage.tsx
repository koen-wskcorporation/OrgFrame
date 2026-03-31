import { notFound, redirect } from "next/navigation";
import { Alert } from "@orgframe/ui/primitives/alert";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { PageTabs } from "@orgframe/ui/primitives/page-tabs";
import { FacilityManageDetailPanel, type FacilityManageDetailSection } from "@/src/features/facilities/components/FacilityManageDetailPanel";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { can } from "@/src/shared/permissions/can";
import { isOrgToolEnabled } from "@/src/shared/org/features";
import { listFacilityReservationReadModel } from "@/src/features/facilities/db/queries";
import { ToolUnavailablePanel } from "../../ToolUnavailablePanel";

export async function FacilityManageDetailPage({
  orgSlug,
  spaceId,
  activeSection
}: {
  orgSlug: string;
  spaceId: string;
  activeSection: FacilityManageDetailSection;
}) {
  const orgContext = await getOrgAuthContext(orgSlug);
  if (!isOrgToolEnabled(orgContext.toolAvailability, "facilities")) {
    return (
      <PageStack>
        <PageHeader
          description="Manage structure and settings for this facility space."
          showBorder={false}
          title="Facility unavailable"
        />
        <ToolUnavailablePanel title="Facilities" />
      </PageStack>
    );
  }
  const canReadFacilities = can(orgContext.membershipPermissions, "facilities.read") || can(orgContext.membershipPermissions, "facilities.write");
  const canWriteFacilities = can(orgContext.membershipPermissions, "facilities.write");

  if (!canReadFacilities) {
    redirect("/forbidden");
  }

  const readModel = await listFacilityReservationReadModel(orgContext.orgId);
  const selectedSpace = readModel.spaces.find((space) => space.id === spaceId);

  if (!selectedSpace) {
    notFound();
  }

  return (
    <PageStack>
      <PageHeader
        description="Manage structure and settings for this facility space."
        showBorder={false}
        title={selectedSpace.name}
      />
      <PageTabs
        active={activeSection}
        ariaLabel="Facility pages"
        items={[
          {
            key: "overview",
            label: "Overview",
            description: "Status, visibility, and controls",
            href: `/${orgContext.orgSlug}/tools/facilities/${selectedSpace.id}/overview`
          },
          {
            key: "structure",
            label: "Structure",
            description: "Zones, rooms, and nested layout",
            href: `/${orgContext.orgSlug}/tools/facilities/${selectedSpace.id}/structure`
          },
          {
            key: "settings",
            label: "Settings",
            description: "Status, booking controls, and archive",
            href: `/${orgContext.orgSlug}/tools/facilities/${selectedSpace.id}/settings`
          }
        ]}
      />
      {!canWriteFacilities ? <Alert variant="info">You have read-only access to facilities.</Alert> : null}
      <FacilityManageDetailPanel
        activeSection={activeSection}
        canWrite={canWriteFacilities}
        initialReadModel={readModel}
        orgSlug={orgContext.orgSlug}
        selectedSpace={selectedSpace}
      />
    </PageStack>
  );
}
