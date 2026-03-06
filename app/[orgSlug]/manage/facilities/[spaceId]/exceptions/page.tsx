import type { Metadata } from "next";
import { FacilityManageDetailPage } from "@/modules/facilities/components/FacilityManageDetailPage";

export const metadata: Metadata = {
  title: "Facility Exceptions"
};

export default async function OrgManageFacilityExceptionsPage({
  params
}: {
  params: Promise<{ orgSlug: string; spaceId: string }>;
}) {
  const { orgSlug, spaceId } = await params;

  return <FacilityManageDetailPage activeSection="exceptions" orgSlug={orgSlug} spaceId={spaceId} />;
}
