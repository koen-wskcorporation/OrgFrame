import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { PageHeader } from "@/components/ui/page-header";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { can } from "@/lib/permissions/can";
import { FormEditorPanel } from "@/modules/forms/components/FormEditorPanel";
import { FormPageTabs } from "@/modules/forms/components/FormPageTabs";
import { FormPublishToggleButton } from "@/modules/forms/components/FormPublishToggleButton";
import { getFormById } from "@/modules/forms/db/queries";
import { listProgramNodes, listProgramsForManage } from "@/modules/programs/db/queries";

export const metadata: Metadata = {
  title: "Form Builder"
};

export default async function OrgManageFormEditorPage({
  params
}: {
  params: Promise<{ orgSlug: string; formId: string }>;
}) {
  const { orgSlug, formId } = await params;
  const orgContext = await getOrgAuthContext(orgSlug);
  const canReadForms = can(orgContext.membershipPermissions, "forms.read") || can(orgContext.membershipPermissions, "forms.write");

  if (!canReadForms) {
    redirect("/forbidden");
  }

  const form = await getFormById(orgContext.orgId, formId);

  if (!form) {
    notFound();
  }

  const canWriteForms = can(orgContext.membershipPermissions, "forms.write");
  const canAccessPrograms = can(orgContext.membershipPermissions, "programs.read") || can(orgContext.membershipPermissions, "programs.write");
  const [programs, programNodes] = await Promise.all([
    canAccessPrograms ? listProgramsForManage(orgContext.orgId) : Promise.resolve([]),
    canAccessPrograms && form.programId ? listProgramNodes(form.programId) : Promise.resolve([])
  ]);
  const statusLabel = form.status === "published" ? "Published" : "Not published";
  const statusColor = form.status === "published" ? "green" : "yellow";

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <>
            <Link className={buttonVariants({ variant: "secondary" })} href={`/${orgContext.orgSlug}/tools/forms`}>
              Back to forms
            </Link>
            <FormPublishToggleButton canWrite={canWriteForms} form={form} orgSlug={orgContext.orgSlug} />
          </>
        }
        description="Build fields visually, preview output, and publish immutable versions."
        showBorder={false}
        title={
          <span className="inline-flex items-center gap-3">
            <span>{form.name}</span>
            <Chip className="normal-case tracking-normal" color={statusColor}>
              {statusLabel}
            </Chip>
          </span>
        }
      />
      <FormPageTabs active="builder" formId={form.id} orgSlug={orgContext.orgSlug} />
      {!canWriteForms ? <Alert variant="info">You have read-only access to this form.</Alert> : null}
      <FormEditorPanel canWrite={canWriteForms} form={form} orgSlug={orgContext.orgSlug} programNodes={programNodes} programs={programs} />
    </div>
  );
}
