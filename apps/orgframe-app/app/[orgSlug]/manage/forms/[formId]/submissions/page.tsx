import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { Alert } from "@orgframe/ui/ui/alert";
import { Button } from "@orgframe/ui/ui/button";
import { Chip } from "@orgframe/ui/ui/chip";
import { PageStack } from "@orgframe/ui/ui/layout";
import { PageHeader } from "@orgframe/ui/ui/page-header";
import { PageTabs } from "@orgframe/ui/ui/page-tabs";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { can } from "@/lib/permissions/can";
import { getFormGoogleSheetIntegrationAction, getFormSubmissionViewsDataAction } from "@/modules/forms/actions";
import { FormPublishToggleButton } from "@orgframe/ui/modules/forms/components/FormPublishToggleButton";
import { FormSubmissionsPanel } from "@orgframe/ui/modules/forms/components/FormSubmissionsPanel";
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

  const [submissions, viewsResult, googleSheetResult] = await Promise.all([
    listFormSubmissionsWithEntries(orgContext.orgId, form.id),
    getFormSubmissionViewsDataAction({
      orgSlug: orgContext.orgSlug,
      formId: form.id
    }),
    getFormGoogleSheetIntegrationAction({
      orgSlug: orgContext.orgSlug,
      formId: form.id
    })
  ]);
  const canWriteForms = can(orgContext.membershipPermissions, "forms.write");
  const submissionViews = viewsResult.ok ? viewsResult.data.views : [];
  const viewAdminAccounts = viewsResult.ok ? viewsResult.data.adminAccounts : [];
  const googleSheetIntegration = googleSheetResult.ok ? googleSheetResult.data.integration : null;
  const googleSheetRecentRuns = googleSheetResult.ok ? googleSheetResult.data.recentRuns : [];
  const googleSheetConfigured = googleSheetResult.ok ? googleSheetResult.data.configured : false;
  const statusLabel = form.status === "published" ? "Published" : "Not published";
  const statusColor = form.status === "published" ? "green" : "yellow";

  return (
    <PageStack>
      <PageHeader
        actions={
          <>
            <Button href={`/${orgContext.orgSlug}/manage/forms`} variant="secondary">
              Back to forms
            </Button>
            <Button href={`/${orgContext.orgSlug}/manage/forms/${form.id}/settings`} variant="secondary">
              Settings
            </Button>
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
      <PageTabs
        active="submissions"
        ariaLabel="Form pages"
        items={[
          {
            key: "builder",
            label: "Builder",
            description: "Fields, pages, and logic",
            href: `/${orgContext.orgSlug}/manage/forms/${form.id}/editor`,
            prefetch: false
          },
          {
            key: "submissions",
            label: "Submissions",
            description: "Review, triage, and exports",
            href: `/${orgContext.orgSlug}/manage/forms/${form.id}/submissions`,
            prefetch: false
          },
          {
            key: "settings",
            label: "Settings",
            description: "Metadata, publishing, and rules",
            href: `/${orgContext.orgSlug}/manage/forms/${form.id}/settings`,
            prefetch: false
          }
        ]}
      />
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
        googleSheetConfigured={googleSheetConfigured}
        googleSheetIntegration={googleSheetIntegration}
        googleSheetRecentRuns={googleSheetRecentRuns}
      />
    </PageStack>
  );
}
