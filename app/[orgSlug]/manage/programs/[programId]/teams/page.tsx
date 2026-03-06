import { ProgramManageDetailPage } from "@/modules/programs/components/ProgramManageDetailPage";

export default async function ProgramTeamsPage({
  params
}: {
  params: Promise<{ orgSlug: string; programId: string }>;
}) {
  const { orgSlug, programId } = await params;
  return <ProgramManageDetailPage activeSection="teams" orgSlug={orgSlug} programId={programId} />;
}
