import { redirect } from "next/navigation";

export default async function SportsConnectLegacyRedirectPage({
  params
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  redirect(`/${orgSlug}/manage/imports`);
}
