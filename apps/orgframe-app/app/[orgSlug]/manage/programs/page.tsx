import type { Metadata } from "next";
import { PageShell } from "@/src/features/core/layout/components/PageShell";
import { gateManageSection } from "@/src/features/core/layout/gateManageSection";
import { can } from "@/src/shared/permissions/can";
import { ProgramsManagePanel } from "@/src/features/programs/components/ProgramsManagePanel";
import { listProgramsForManage } from "@/src/features/programs/db/queries";
import { ToolUnavailablePanel } from "../ToolUnavailablePanel";

export const metadata: Metadata = {
  title: "Programs"
};

export default async function OrgManageProgramsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { orgContext, unavailable } = await gateManageSection(orgSlug, {
    permission: ["programs.read", "programs.write"],
    tool: "programs"
  });

  if (unavailable) {
    return (
      <PageShell description="Create and manage program catalogs, structure maps, and schedules." title="Programs">
        <ToolUnavailablePanel title="Programs" />
      </PageShell>
    );
  }

  const canWritePrograms = can(orgContext.membershipPermissions, "programs.write");
  const programs = await listProgramsForManage(orgContext.orgId);

  return <ProgramsManagePanel canWrite={canWritePrograms} orgDisplayHost={orgContext.displayHost} orgSlug={orgSlug} programs={programs} />;
}
