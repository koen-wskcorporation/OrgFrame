import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert } from "@orgframe/ui/primitives/alert";
import { getProgramMapPageData } from "@/src/features/programs/map/actions";
import { ProgramMapWorkspace } from "@/src/features/programs/map/components/ProgramMapWorkspace";

export const metadata: Metadata = {
  title: "Program Structure"
};

export default async function OrgManageProgramStructurePage({
  params
}: {
  params: Promise<{ orgSlug: string; programId: string }>;
}) {
  const { orgSlug, programId } = await params;
  let data;
  try {
    data = await getProgramMapPageData(orgSlug, programId);
  } catch (error) {
    if ((error as Error).message === "FORBIDDEN") {
      return <Alert variant="destructive">You don't have access to this program.</Alert>;
    }
    throw error;
  }

  if (!data) {
    notFound();
  }

  return (
    <ProgramMapWorkspace
      orgSlug={data.org.orgSlug}
      programId={data.program.id}
      programName={data.program.name}
      canWrite={data.org.canWrite}
      initialNodes={data.nodes}
      teamIdByNodeId={data.teamIdByNodeId}
      assignmentDock={data.assignmentDock}
    />
  );
}
