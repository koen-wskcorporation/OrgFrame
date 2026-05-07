import type { Metadata } from "next";
import { PageShell } from "@/src/features/core/layout/components/PageShell";
import { gateManageSection } from "@/src/features/core/layout/gateManageSection";
import { can } from "@/src/shared/permissions/can";
import { FormsManagePanel } from "@/src/features/forms/components/FormsManagePanel";
import { listFormsForManage } from "@/src/features/forms/db/queries";
import { listProgramsForManage } from "@/src/features/programs/db/queries";
import { ToolUnavailablePanel } from "../ToolUnavailablePanel";

export const metadata: Metadata = {
  title: "Forms"
};

export default async function OrgManageFormsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { orgContext, unavailable } = await gateManageSection(orgSlug, {
    permission: ["forms.read", "forms.write"],
    tool: "forms"
  });

  if (unavailable) {
    return (
      <PageShell description="Build, publish, and operate generic and registration forms." title="Forms">
        <ToolUnavailablePanel title="Forms" />
      </PageShell>
    );
  }

  const canWriteForms = can(orgContext.membershipPermissions, "forms.write");
  const canAccessPrograms = can(orgContext.membershipPermissions, "programs.read") || can(orgContext.membershipPermissions, "programs.write");
  const [forms, programs] = await Promise.all([
    listFormsForManage(orgContext.orgId),
    canAccessPrograms ? listProgramsForManage(orgContext.orgId) : Promise.resolve([])
  ]);

  return <FormsManagePanel canWrite={canWriteForms} forms={forms} orgSlug={orgSlug} programs={programs} />;
}
