import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Facility"
};

export default async function OrgManageFacilityDetailPage({
  params
}: {
  params: Promise<{ orgSlug: string; spaceId: string }>;
}) {
  const { orgSlug, spaceId } = await params;
  redirect(`/${orgSlug}/manage/facilities/${spaceId}/overview`);
}
