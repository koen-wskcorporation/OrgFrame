import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { gateManageSection } from "@/src/features/core/layout/gateManageSection";
import { can } from "@/src/shared/permissions/can";
import { getFormGoogleSheetIntegrationAction, getFormSubmissionViewsDataAction } from "@/src/features/forms/actions";
import { FormSubmissionsPanel } from "@/src/features/forms/components/FormSubmissionsPanel";
import { getFormByIdCached } from "@/src/features/forms/cached-loaders";
import { listFormSubmissionsWithEntries } from "@/src/features/forms/db/queries";

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
  const { orgContext, unavailable } = await gateManageSection(orgSlug, {
    permission: ["forms.read", "forms.write"],
    tool: "forms"
  });
  if (unavailable) return null;

  const form = await getFormByIdCached(orgContext.orgId, formId);
  if (!form) notFound();

  const [submissions, viewsResult, googleSheetResult] = await Promise.all([
    listFormSubmissionsWithEntries(orgContext.orgId, form.id),
    getFormSubmissionViewsDataAction({ orgSlug, formId: form.id }),
    getFormGoogleSheetIntegrationAction({ orgSlug, formId: form.id })
  ]);
  const canWriteForms = can(orgContext.membershipPermissions, "forms.write");
  const submissionViews = viewsResult.ok ? viewsResult.data.views : [];
  const viewAdminAccounts = viewsResult.ok ? viewsResult.data.adminAccounts : [];
  const googleSheetIntegration = googleSheetResult.ok ? googleSheetResult.data.integration : null;
  const googleSheetRecentRuns = googleSheetResult.ok ? googleSheetResult.data.recentRuns : [];
  const googleSheetConfigured = googleSheetResult.ok ? googleSheetResult.data.configured : false;

  return (
    <FormSubmissionsPanel
      canWrite={canWriteForms}
      formId={form.id}
      formKind={form.formKind}
      formSchema={form.schemaJson}
      orgSlug={orgSlug}
      submissions={submissions}
      viewAdminAccounts={viewAdminAccounts}
      views={submissionViews}
      googleSheetConfigured={googleSheetConfigured}
      googleSheetIntegration={googleSheetIntegration}
      googleSheetRecentRuns={googleSheetRecentRuns}
    />
  );
}
