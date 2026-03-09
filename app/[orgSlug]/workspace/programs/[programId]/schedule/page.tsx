import type { Metadata } from "next";
import { ProgramManageDetailPage } from "@/modules/programs/components/ProgramManageDetailPage";

export const metadata: Metadata = {
  title: "Program Schedule"
};

export default async function OrgManageProgramSchedulePage({
  params
}: {
  params: Promise<{ orgSlug: string; programId: string }>;
}) {
  const { orgSlug, programId } = await params;

  return <ProgramManageDetailPage activeSection="schedule" orgSlug={orgSlug} programId={programId} />;
}
