import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFacilityMapManageDetail } from "@/src/features/facilities/actions";
import { FacilityMapWorkspace } from "@/src/features/facilities/map/components/FacilityMapWorkspace";
import { listFacilitySpaceStatuses } from "@/src/features/facilities/db/queries";

export const metadata: Metadata = {
  title: "Facility"
};

export default async function OrgManageFacilityPage({
  params
}: {
  params: Promise<{ orgSlug: string; facilityId: string }>;
}) {
  const { orgSlug, facilityId } = await params;
  const detail = await getFacilityMapManageDetail(orgSlug, facilityId);
  if (!detail) {
    notFound();
  }
  const spaceStatuses = await listFacilitySpaceStatuses(detail.org.orgId);

  return (
    <FacilityMapWorkspace
      canWrite={detail.canWrite}
      facility={detail.facility}
      initialNodes={detail.nodes}
      orgId={detail.org.orgId}
      orgSlug={detail.org.orgSlug}
      spaceStatuses={spaceStatuses}
      spaces={detail.spaces}
    />
  );
}
