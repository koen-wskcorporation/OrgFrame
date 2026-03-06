import type { Metadata } from "next";
import { FacilityManageDetailPage } from "@/modules/facilities/components/FacilityManageDetailPage";

export const metadata: Metadata = {
  title: "Facility Structure"
};

export default async function OrgManageFacilityStructurePage({
  params
}: {
  params: Promise<{ orgSlug: string; spaceId: string }>;
}) {
  const { orgSlug, spaceId } = await params;

  return <FacilityManageDetailPage activeSection="structure" orgSlug={orgSlug} spaceId={spaceId} />;
}
