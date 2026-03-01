import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Program Editor"
};

export default async function OrgManageProgramDetailPage({
  params
}: {
  params: Promise<{ orgSlug: string; programId: string }>;
}) {
  const { orgSlug, programId } = await params;
  redirect(`/${orgSlug}/tools/programs/${programId}/structure`);
}
