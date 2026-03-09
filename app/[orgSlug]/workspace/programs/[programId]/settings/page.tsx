import type { Metadata } from "next";
import { ProgramManageDetailPage } from "@/modules/programs/components/ProgramManageDetailPage";

export const metadata: Metadata = {
  title: "Program Settings"
};

export default async function OrgManageProgramSettingsPage({
  params
}: {
  params: Promise<{ orgSlug: string; programId: string }>;
}) {
  const { orgSlug, programId } = await params;

  return <ProgramManageDetailPage activeSection="settings" orgSlug={orgSlug} programId={programId} />;
}
