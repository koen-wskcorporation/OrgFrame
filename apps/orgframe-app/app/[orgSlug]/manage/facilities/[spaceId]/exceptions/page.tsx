import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Facility Exceptions"
};

export default async function OrgManageFacilityExceptionsPage({
  params
}: {
  params: Promise<{ orgSlug: string; spaceId: string }>;
}) {
  const { orgSlug } = await params;
  redirect(`/manage/calendar`);
}
