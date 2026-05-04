import type { Metadata } from "next";
import { PageShell } from "@/src/features/core/layout/components/PageShell";
import { gateManageSection } from "@/src/features/core/layout/gateManageSection";
import { can } from "@/src/shared/permissions/can";
import { FacilitiesManagePanel } from "@/src/features/facilities/components/FacilitiesManagePanel";
import { listFacilityReservationReadModel } from "@/src/features/facilities/db/queries";
import { ToolUnavailablePanel } from "../ToolUnavailablePanel";

export const metadata: Metadata = {
  title: "Facilities"
};

export default async function OrgManageFacilitiesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { orgContext, unavailable } = await gateManageSection(orgSlug, {
    permission: ["facilities.read", "facilities.write"],
    tool: "facilities"
  });

  if (unavailable) {
    return (
      <PageShell description="Manage facility spaces and structure." title="Facilities">
        <ToolUnavailablePanel title="Facilities" />
      </PageShell>
    );
  }

  const canWriteFacilities = can(orgContext.membershipPermissions, "facilities.write");
  const readModel = await listFacilityReservationReadModel(orgContext.orgId);

  return <FacilitiesManagePanel canWrite={canWriteFacilities} initialReadModel={readModel} orgId={orgContext.orgId} orgSlug={orgSlug} />;
}
