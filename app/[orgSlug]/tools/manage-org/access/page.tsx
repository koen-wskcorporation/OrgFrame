import { redirect } from "next/navigation";

export default async function OrgMembersSettingsLegacyPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  redirect(`/${orgSlug}/tools/manage/access`);
}
