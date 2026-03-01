import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { can } from "@/lib/permissions/can";
import { FacilitiesManagePanel } from "@/modules/facilities/components/FacilitiesManagePanel";
import { listFacilityReservationReadModel } from "@/modules/facilities/db/queries";

export const metadata: Metadata = {
  title: "Facilities"
};

export default async function OrgManageFacilitiesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const orgContext = await getOrgAuthContext(orgSlug);
  const canReadFacilities = can(orgContext.membershipPermissions, "facilities.read") || can(orgContext.membershipPermissions, "facilities.write");
  const canWriteFacilities = can(orgContext.membershipPermissions, "facilities.write");

  if (!canReadFacilities) {
    redirect("/forbidden");
  }

  const readModel = await listFacilityReservationReadModel(orgContext.orgId);

  return (
    <div className="space-y-6">
      <PageHeader
        description="Manage facility spaces, booking schedules, blackouts, and approvals."
        showBorder={false}
        title="Facilities"
      />
      {!canWriteFacilities ? <Alert variant="info">You have read-only access to facilities.</Alert> : null}
      <FacilitiesManagePanel canWrite={canWriteFacilities} initialReadModel={readModel} orgSlug={orgContext.orgSlug} />
    </div>
  );
}
