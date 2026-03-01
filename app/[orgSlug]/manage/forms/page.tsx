import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { can } from "@/lib/permissions/can";
import { FormsManagePanel } from "@/modules/forms/components/FormsManagePanel";
import { listFormsForManage } from "@/modules/forms/db/queries";
import { listProgramsForManage } from "@/modules/programs/db/queries";

export const metadata: Metadata = {
  title: "Forms"
};

export default async function OrgManageFormsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const orgContext = await getOrgAuthContext(orgSlug);
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
    <div className="space-y-6">
      <PageHeader description="Build, publish, and operate generic and registration forms." showBorder={false} title="Forms" />
      {!canWriteForms ? <Alert variant="info">You have read-only access to forms.</Alert> : null}
      <FormsManagePanel canWrite={canWriteForms} forms={forms} orgSlug={orgContext.orgSlug} programs={programs} />
    </div>
  );
}
