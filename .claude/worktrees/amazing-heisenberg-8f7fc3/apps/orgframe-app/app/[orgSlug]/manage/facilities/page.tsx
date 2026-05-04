import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { can } from "@/src/shared/permissions/can";
import { isOrgToolEnabled } from "@/src/shared/org/features";
import { FacilitiesManagePanel } from "@/src/features/facilities/components/FacilitiesManagePanel";
import { listFacilityReservationReadModel } from "@/src/features/facilities/db/queries";
import { ToolUnavailablePanel } from "../ToolUnavailablePanel";

export const metadata: Metadata = {
  title: "Facilities"
};

export default async function OrgManageFacilitiesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const orgContext = await getOrgAuthContext(orgSlug);
  if (!isOrgToolEnabled(orgContext.toolAvailability, "facilities")) {
    return (
      <PageStack>
        <PageHeader
          description="Manage facility spaces and structure."
          showBorder={false}
          title="Facilities"
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

  return (
    <PageStack>
      <PageHeader
        description="Manage facility spaces and structure."
        showBorder={false}
        title="Facilities"
      />
      {!canWriteFacilities ? <Alert variant="info">You have read-only access to facilities.</Alert> : null}
      <FacilitiesManagePanel canWrite={canWriteFacilities} initialReadModel={readModel} orgSlug={orgContext.orgSlug} />
    </PageStack>
  );
}
