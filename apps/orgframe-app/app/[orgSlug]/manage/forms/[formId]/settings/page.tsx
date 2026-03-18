import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/ui/alert";
import { Button } from "@orgframe/ui/ui/button";
import { Chip } from "@orgframe/ui/ui/chip";
import { PageStack } from "@orgframe/ui/ui/layout";
import { PageHeader } from "@orgframe/ui/ui/page-header";
import { PageTabs } from "@orgframe/ui/ui/page-tabs";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { can } from "@/lib/permissions/can";
import { FormPublishToggleButton } from "@orgframe/ui/modules/forms/components/FormPublishToggleButton";
import { FormSettingsPanel } from "@orgframe/ui/modules/forms/components/FormSettingsPanel";
import { getFormById } from "@/modules/forms/db/queries";
import { listProgramNodes, listProgramsForManage } from "@/modules/programs/db/queries";

export const metadata: Metadata = {
  title: "Form Settings"
};

export default async function OrgManageFormSettingsRedirectPage({
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
    <PageStack>
      <PageHeader
        actions={
          <>
            <Button href={`/${orgContext.orgSlug}/manage/forms`} variant="secondary">
              Back to forms
            </Button>
            <FormPublishToggleButton canWrite={canWriteForms} form={form} orgSlug={orgContext.orgSlug} />
          </>
        }
        description="Configure metadata, registration mapping, and publish state for this form."
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
        active="settings"
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
      {!canWriteForms ? <Alert variant="info">You have read-only access to this form.</Alert> : null}
      <FormSettingsPanel canWrite={canWriteForms} form={form} orgSlug={orgContext.orgSlug} programNodes={programNodes} programs={programs} />
    </PageStack>
  );
}
