import type { Metadata } from "next";
import { ProgramManageDetailPage } from "@/modules/programs/components/ProgramManageDetailPage";

export const metadata: Metadata = {
  title: "Program Structure"
};

export default async function OrgManageProgramStructurePage({
  params
}: {
  params: Promise<{ orgSlug: string; programId: string }>;
}) {
  const { orgSlug, programId } = await params;

  return <ProgramManageDetailPage activeSection="structure" orgSlug={orgSlug} programId={programId} />;
}
