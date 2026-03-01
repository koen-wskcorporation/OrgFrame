import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { can } from "@/lib/permissions/can";
import { ProgramsManagePanel } from "@/modules/programs/components/ProgramsManagePanel";
import { listProgramsForManage } from "@/modules/programs/db/queries";

export const metadata: Metadata = {
  title: "Programs"
};

export default async function OrgManageProgramsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const orgContext = await getOrgAuthContext(orgSlug);
  const canReadPrograms = can(orgContext.membershipPermissions, "programs.read") || can(orgContext.membershipPermissions, "programs.write");
  const canWritePrograms = can(orgContext.membershipPermissions, "programs.write");

  if (!canReadPrograms) {
    redirect("/forbidden");
  }

  const programs = await listProgramsForManage(orgContext.orgId);

  return (
    <div className="space-y-6">
      <PageHeader description="Create and manage program catalogs, structure maps, and schedules." showBorder={false} title="Programs" />
      {!canWritePrograms ? <Alert variant="info">You have read-only access to programs.</Alert> : null}
      <ProgramsManagePanel canWrite={canWritePrograms} orgSlug={orgContext.orgSlug} programs={programs} />
    </div>
  );
}
