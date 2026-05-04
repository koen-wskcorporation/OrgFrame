import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Facility Schedule"
};

export default async function OrgManageFacilitySchedulePage({
  params
}: {
  params: Promise<{ orgSlug: string; spaceId: string }>;
}) {
  const { orgSlug } = await params;
  redirect(`/tools/calendar`);
}
