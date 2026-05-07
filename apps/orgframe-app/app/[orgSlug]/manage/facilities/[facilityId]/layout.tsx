import { notFound } from "next/navigation";
import {
  getFacilityMapManageDetailCached,
  listFacilitySpaceStatusesCached
} from "@/src/features/facilities/cached-loaders";
import { FacilityItemShell } from "@/src/features/facilities/components/FacilityItemShell";

export default async function FacilityManageLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string; facilityId: string }>;
}) {
  const { orgSlug, facilityId } = await params;
  const detail = await getFacilityMapManageDetailCached(orgSlug, facilityId);
  if (!detail) {
    notFound();
  }
  const spaceStatuses = await listFacilitySpaceStatusesCached(detail.org.orgId);

  return (
    <FacilityItemShell
      canWrite={detail.canWrite}
      initialFacility={detail.facility}
      orgSlug={orgSlug}
      spaceStatuses={spaceStatuses}
    >
      {children}
    </FacilityItemShell>
  );
}
