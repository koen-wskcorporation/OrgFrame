import { notFound } from "next/navigation";
import { Alert } from "@orgframe/ui/primitives/alert";
import { can } from "@/src/shared/permissions/can";
import { getProgramManageDetail } from "@/src/features/programs/actions";
import { ProgramItemShell } from "@/src/features/programs/components/ProgramItemShell";
import { ProgramTabsNav } from "./ProgramTabsNav";

export default async function ProgramManageLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string; programId: string }>;
}) {
  const { orgSlug, programId } = await params;

  let data;
  try {
    data = await getProgramManageDetail(orgSlug, programId);
  } catch (error) {
    if ((error as Error).message === "FORBIDDEN") {
      return <Alert variant="destructive">You don't have access to this program.</Alert>;
    }
    throw error;
  }

  if (!data) {
    notFound();
  }

  const canWrite = can(data.org.membershipPermissions, "programs.write");

  return (
    <div className="app-page-stack">
      <ProgramItemShell
        orgSlug={orgSlug}
        initialProgram={data.details.program}
        canWrite={canWrite}
        tabs={<ProgramTabsNav orgSlug={orgSlug} programId={programId} />}
      >
        {children}
      </ProgramItemShell>
    </div>
  );
}
