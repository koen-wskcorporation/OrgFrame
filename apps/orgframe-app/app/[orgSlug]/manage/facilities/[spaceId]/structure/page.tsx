import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFacilityMapManageDetail } from "@/src/features/facilities/actions";
import { FacilityMapWorkspace } from "@/src/features/facilities/map/components/FacilityMapWorkspace";

export const metadata: Metadata = {
  title: "Facility Structure"
};

export default async function OrgManageFacilityStructurePage({
  params
}: {
  params: Promise<{ orgSlug: string; spaceId: string }>;
}) {
  const { orgSlug, spaceId } = await params;
  const detail = await getFacilityMapManageDetail(orgSlug, spaceId);
  if (!detail) {
    notFound();
  }

  return (
    <FacilityMapWorkspace
      activeSpaceId={detail.space.id}
      activeSpaceName={detail.space.name}
      canWrite={detail.canWrite}
      initialNodes={detail.nodes}
      orgSlug={detail.org.orgSlug}
      spaces={detail.spaces}
    />
  );
}
