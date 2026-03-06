import type { Metadata } from "next";
import { FacilityManageDetailPage } from "@/modules/facilities/components/FacilityManageDetailPage";

export const metadata: Metadata = {
  title: "Facility Schedule"
};

export default async function OrgManageFacilitySchedulePage({
  params
}: {
  params: Promise<{ orgSlug: string; spaceId: string }>;
}) {
  const { orgSlug, spaceId } = await params;

  return <FacilityManageDetailPage activeSection="schedule" orgSlug={orgSlug} spaceId={spaceId} />;
}
