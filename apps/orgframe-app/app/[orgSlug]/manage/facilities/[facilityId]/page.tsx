import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getFacilityMapManageDetailCached,
  listFacilitySpaceStatusesCached
} from "@/src/features/facilities/cached-loaders";
import { FacilityMapWorkspace } from "@/src/features/facilities/map/components/FacilityMapWorkspace";

export const metadata: Metadata = {
  title: "Facility"
};

export default async function OrgManageFacilityPage({
  params
}: {
  params: Promise<{ orgSlug: string; facilityId: string }>;
}) {
  const { orgSlug, facilityId } = await params;
  const detail = await getFacilityMapManageDetailCached(orgSlug, facilityId);
  if (!detail) {
    notFound();
  }
  const spaceStatuses = await listFacilitySpaceStatusesCached(detail.org.orgId);

  return (
    <FacilityMapWorkspace
      canWrite={detail.canWrite}
      facility={detail.facility}
      orgId={detail.org.orgId}
      orgSlug={detail.org.orgSlug}
      spaceStatuses={spaceStatuses}
      spaces={detail.spaces}
    />
  );
}
