import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { PageHeader } from "@/components/ui/page-header";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { can } from "@/lib/permissions/can";
import { getFormSubmissionViewsDataAction } from "@/modules/forms/actions";
import { FormPageTabs } from "@/modules/forms/components/FormPageTabs";
import { FormPublishToggleButton } from "@/modules/forms/components/FormPublishToggleButton";
import { FormSubmissionsPanel } from "@/modules/forms/components/FormSubmissionsPanel";
import { getFormById, listFormSubmissionsWithEntries } from "@/modules/forms/db/queries";

export const metadata: Metadata = {
  title: "Form Submissions"
};

export default async function OrgManageFormSubmissionsPage({
  params
}: {
  params: Promise<{ orgSlug: string; formId: string }>;
}) {
  noStore();
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

  const [submissions, viewsResult] = await Promise.all([
    listFormSubmissionsWithEntries(orgContext.orgId, form.id),
    getFormSubmissionViewsDataAction({
      orgSlug: orgContext.orgSlug,
      formId: form.id
    })
  ]);
  const canWriteForms = can(orgContext.membershipPermissions, "forms.write");
  const submissionViews = viewsResult.ok ? viewsResult.data.views : [];
  const viewAdminAccounts = viewsResult.ok ? viewsResult.data.adminAccounts : [];
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
            <Link className={buttonVariants({ variant: "secondary" })} href={`/${orgContext.orgSlug}/tools/forms/${form.id}/editor?panel=settings`}>
              Settings
            </Link>
            <FormPublishToggleButton canWrite={canWriteForms} form={form} orgSlug={orgContext.orgSlug} />
          </>
        }
        description="Manage form questions and submission data."
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
      <FormPageTabs active="submissions" formId={form.id} orgSlug={orgContext.orgSlug} />
      {!canWriteForms ? <Alert variant="info">You have read-only access to submissions.</Alert> : null}
      <FormSubmissionsPanel
        canWrite={canWriteForms}
        formId={form.id}
        formKind={form.formKind}
        formSchema={form.schemaJson}
        orgSlug={orgContext.orgSlug}
        submissions={submissions}
        viewAdminAccounts={viewAdminAccounts}
        views={submissionViews}
      />
    </div>
  );
}
