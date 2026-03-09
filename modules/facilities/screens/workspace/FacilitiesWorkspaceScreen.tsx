import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PageStack } from "@/components/ui/layout";
import { isOrgFeatureEnabled } from "@/lib/org/features";
import { orgWorkspaceSettingsSectionPath } from "@/lib/org/routes";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { can } from "@/lib/permissions/can";
import { listFacilityMapReadModel } from "@/modules/facilities/db/queries";
import { FacilitiesWorkspacePanel } from "@/modules/facilities/editor/FacilitiesWorkspacePanel";

export const metadata: Metadata = {
  title: "Facilities"
};

export default async function FacilitiesWorkspaceScreen({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const orgContext = await getOrgAuthContext(orgSlug);
  const canReadFacilities = can(orgContext.membershipPermissions, "spaces.read") || can(orgContext.membershipPermissions, "spaces.write");
  const canWriteFacilities = can(orgContext.membershipPermissions, "spaces.write");

  if (!canReadFacilities) {
    redirect("/forbidden");
  }

  if (!isOrgFeatureEnabled(orgContext.features, "facilities")) {
    return (
      <PageStack>
        <PageHeader
          description="Create visual facility maps and nested spaces for booking-aware scheduling."
          showBorder={false}
          title="Facilities"
        />
        <Alert variant="warning">Facilities is currently disabled for this org.</Alert>
        <div>
          <Button href={orgWorkspaceSettingsSectionPath(orgSlug, "features")} variant="secondary">
            Open feature settings
          </Button>
        </div>
      </PageStack>
    );
  }

  const readModel = await listFacilityMapReadModel(orgContext.orgId);

  return (
    <PageStack>
      <PageHeader
        description="Create visual facility maps and nested spaces for booking-aware scheduling."
        showBorder={false}
        title="Facilities"
      />
      {!canWriteFacilities ? <Alert variant="info">You have read-only access to facilities.</Alert> : null}
      <FacilitiesWorkspacePanel canWrite={canWriteFacilities} initialReadModel={readModel} orgSlug={orgContext.orgSlug} />
    </PageStack>
  );
}
