import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { can } from "@/src/shared/permissions/can";
import { isOrgToolEnabled } from "@/src/features/core/config/tools";
import { ProgramsManagePanel } from "@/src/features/programs/components/ProgramsManagePanel";
import { listProgramsForManage } from "@/src/features/programs/db/queries";
import { ToolUnavailablePanel } from "../ToolUnavailablePanel";

export const metadata: Metadata = {
  title: "Programs"
};

export default async function OrgManageProgramsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const orgContext = await getOrgAuthContext(orgSlug);
  if (!isOrgToolEnabled(orgContext.toolAvailability, "programs")) {
    return (
      <PageStack>
        <PageHeader description="Create and manage program catalogs, structure maps, and schedules." showBorder={false} title="Programs" />
        <ToolUnavailablePanel title="Programs" />
      </PageStack>
    );
  }
  const canReadPrograms = can(orgContext.membershipPermissions, "programs.read") || can(orgContext.membershipPermissions, "programs.write");
  const canWritePrograms = can(orgContext.membershipPermissions, "programs.write");

  if (!canReadPrograms) {
    redirect("/forbidden");
  }

  const programs = await listProgramsForManage(orgContext.orgId);

  return (
    <PageStack>
      <PageHeader description="Create and manage program catalogs, structure maps, and schedules." showBorder={false} title="Programs" />
      {!canWritePrograms ? <Alert variant="info">You have read-only access to programs.</Alert> : null}
      <ProgramsManagePanel canWrite={canWritePrograms} orgDisplayHost={orgContext.displayHost} orgSlug={orgContext.orgSlug} programs={programs} />
    </PageStack>
  );
}
