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
  params: Promise<{ orgSlug: string; spaceId: string }>;
}) {
  const { orgSlug, spaceId } = await params;
  const detail = await getFacilityMapManageDetail(orgSlug, spaceId);
  if (!detail) {
    notFound();
  }
  const spaceStatuses = await listFacilitySpaceStatuses(detail.org.orgId);

  return (
    <PageStack>
      <FacilityItemShell
        canWrite={detail.canWrite}
        initialSpace={detail.space}
        orgSlug={orgSlug}
        spaces={detail.spaces}
        spaceStatuses={spaceStatuses}
      >
        {children}
      </FacilityItemShell>
    </PageStack>
  );
}
