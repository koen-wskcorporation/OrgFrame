import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { can } from "@/src/shared/permissions/can";
import { isOrgToolEnabled } from "@/src/shared/org/features";
import { FormsManagePanel } from "@/src/features/forms/components/FormsManagePanel";
import { listFormsForManage } from "@/src/features/forms/db/queries";
import { listProgramsForManage } from "@/src/features/programs/db/queries";
import { ToolUnavailablePanel } from "../ToolUnavailablePanel";

export const metadata: Metadata = {
  title: "Forms"
};

export default async function OrgManageFormsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const orgContext = await getOrgAuthContext(orgSlug);
  if (!isOrgToolEnabled(orgContext.toolAvailability, "forms")) {
    return (
      <PageStack>
        <PageHeader description="Build, publish, and operate generic and registration forms." showBorder={false} title="Forms" />
        <ToolUnavailablePanel title="Forms" />
      </PageStack>
    );
  }
  const canReadForms = can(orgContext.membershipPermissions, "forms.read") || can(orgContext.membershipPermissions, "forms.write");
  const canWriteForms = can(orgContext.membershipPermissions, "forms.write");

  if (!canReadForms) {
    redirect("/forbidden");
  }

  const [forms, programs] = await Promise.all([
    listFormsForManage(orgContext.orgId),
    (can(orgContext.membershipPermissions, "programs.read") || can(orgContext.membershipPermissions, "programs.write"))
      ? listProgramsForManage(orgContext.orgId)
      : Promise.resolve([])
  ]);

  return (
    <PageStack>
      <PageHeader description="Build, publish, and operate generic and registration forms." showBorder={false} title="Forms" />
      {!canWriteForms ? <Alert variant="info">You have read-only access to forms.</Alert> : null}
      <FormsManagePanel canWrite={canWriteForms} forms={forms} orgSlug={orgContext.orgSlug} programs={programs} />
    </PageStack>
  );
}
