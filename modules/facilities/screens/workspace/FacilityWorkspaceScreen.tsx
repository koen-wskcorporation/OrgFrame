import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { PageStack } from "@/components/ui/layout";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { can } from "@/lib/permissions/can";
import { getFacilityById, listFacilityMapReadModel } from "@/modules/facilities/db/queries";
import { FacilityMapDetailPanel } from "@/modules/facilities/editor/FacilityMapDetailPanel";

export const metadata: Metadata = {
  title: "Facility"
};

export default async function FacilityWorkspaceScreen({
  params,
  searchParams
}: {
  params: Promise<{ orgSlug: string; facilityId: string }>;
  searchParams?: Promise<{ editMap?: string }>;
}) {
  const { orgSlug, facilityId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const orgContext = await getOrgAuthContext(orgSlug);
  const canReadFacilities = can(orgContext.membershipPermissions, "spaces.read") || can(orgContext.membershipPermissions, "spaces.write");
  const canWriteFacilities = can(orgContext.membershipPermissions, "spaces.write");
  const openEditorOnMount =
    resolvedSearchParams?.editMap === "1" ||
    resolvedSearchParams?.editMap === "true" ||
    resolvedSearchParams?.editMap === "yes";

  if (!canReadFacilities) {
    redirect("/forbidden");
  }

  const [facility, readModel] = await Promise.all([
    getFacilityById(orgContext.orgId, facilityId),
    listFacilityMapReadModel(orgContext.orgId)
  ]);

  if (!facility) {
    notFound();
  }

  const nodes = readModel.nodes.filter((node) => node.facilityId === facility.id);

  return (
    <PageStack>
      <PageHeader
        description="Read-only facility map view used by booking flows."
        showBorder={false}
        title={facility.name}
      />
      {!canWriteFacilities ? <Alert variant="info">You have read-only access to facilities.</Alert> : null}
      <FacilityMapDetailPanel
        canWrite={canWriteFacilities}
        facility={facility}
        initialReadModel={readModel}
        nodes={nodes}
        openEditorOnMount={openEditorOnMount}
        orgSlug={orgContext.orgSlug}
      />
    </PageStack>
  );
}
