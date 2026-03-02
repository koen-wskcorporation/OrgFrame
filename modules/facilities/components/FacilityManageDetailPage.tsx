import { notFound, redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { PageStack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { PageTabs } from "@/components/ui/page-tabs";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { can } from "@/lib/permissions/can";
import { FacilityManageDetailPanel, type FacilityManageDetailSection } from "@/modules/facilities/components/FacilityManageDetailPanel";
import { listFacilityReservationReadModel } from "@/modules/facilities/db/queries";

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
        description="Manage reservations, recurring rules, and availability for this facility space."
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
            key: "schedule",
            label: "Schedule",
            description: "Reservations, rules, and blackouts",
            href: `/${orgContext.orgSlug}/tools/facilities/${selectedSpace.id}/schedule`
          },
          {
            key: "exceptions",
            label: "Exceptions",
            description: "Skip and override records",
            href: `/${orgContext.orgSlug}/tools/facilities/${selectedSpace.id}/exceptions`
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
