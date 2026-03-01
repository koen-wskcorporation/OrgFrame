import { redirect } from "next/navigation";

export default async function OrgBillingLegacyPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  redirect(`/${orgSlug}/tools/manage/billing`);
}
