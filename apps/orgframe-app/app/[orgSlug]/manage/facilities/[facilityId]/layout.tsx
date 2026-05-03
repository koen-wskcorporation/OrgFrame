import { notFound } from "next/navigation";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { getFacilityMapManageDetail } from "@/src/features/facilities/actions";
import { FacilityItemShell } from "@/src/features/facilities/components/FacilityItemShell";
import { listFacilitySpaceStatuses } from "@/src/features/facilities/db/queries";

export default async function FacilityManageLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string; facilityId: string }>;
}) {
  const { orgSlug, facilityId } = await params;
  const detail = await getFacilityMapManageDetail(orgSlug, facilityId);
  if (!detail) {
    notFound();
  }
  const spaceStatuses = await listFacilitySpaceStatuses(detail.org.orgId);

  return (
    <PageStack>
      <FacilityItemShell
        canWrite={detail.canWrite}
        initialFacility={detail.facility}
        orgSlug={orgSlug}
        spaceStatuses={spaceStatuses}
      >
        {children}
      </FacilityItemShell>
    </PageStack>
  );
}
