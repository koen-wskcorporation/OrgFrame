import type { Metadata } from "next";
import { ProgramManageDetailPage } from "@/modules/programs/components/ProgramManageDetailPage";

export const metadata: Metadata = {
  title: "Program Registration"
};

export default async function OrgManageProgramRegistrationPage({
  params
}: {
  params: Promise<{ orgSlug: string; programId: string }>;
}) {
  const { orgSlug, programId } = await params;

  return <ProgramManageDetailPage activeSection="registration" orgSlug={orgSlug} programId={programId} />;
}
