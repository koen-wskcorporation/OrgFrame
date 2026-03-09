import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageStack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { isOrgFeatureEnabled } from "@/lib/org/features";
import { orgWorkspaceSettingsSectionPath } from "@/lib/org/routes";
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

  if (!isOrgFeatureEnabled(orgContext.features, "programs")) {
    return (
      <PageStack>
        <PageHeader description="Create and manage program catalogs, structure maps, and schedules." showBorder={false} title="Programs" />
        <Alert variant="warning">Programs is currently disabled for this org.</Alert>
        <div>
          <Button href={orgWorkspaceSettingsSectionPath(orgSlug, "features")} variant="secondary">
            Open feature settings
          </Button>
        </div>
      </PageStack>
    );
  }

  const programs = await listProgramsForManage(orgContext.orgId);

  return (
    <PageStack>
      <PageHeader description="Create and manage program catalogs, structure maps, and schedules." showBorder={false} title="Programs" />
      {!canWritePrograms ? <Alert variant="info">You have read-only access to programs.</Alert> : null}
      <ProgramsManagePanel canWrite={canWritePrograms} orgSlug={orgContext.orgSlug} programs={programs} />
    </PageStack>
  );
}
