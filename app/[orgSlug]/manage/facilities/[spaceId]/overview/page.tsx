import type { Metadata } from "next";
import { FacilityManageDetailPage } from "@/modules/facilities/components/FacilityManageDetailPage";

export const metadata: Metadata = {
  title: "Facility Overview"
};

export default async function OrgManageFacilityOverviewPage({
  params
}: {
  params: Promise<{ orgSlug: string; spaceId: string }>;
}) {
  const { orgSlug, spaceId } = await params;

  return <FacilityManageDetailPage activeSection="overview" orgSlug={orgSlug} spaceId={spaceId} />;
}
