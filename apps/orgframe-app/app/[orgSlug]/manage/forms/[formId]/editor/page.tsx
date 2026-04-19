import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { Chip } from "@orgframe/ui/primitives/chip";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { PageTabs } from "@orgframe/ui/primitives/page-tabs";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { can } from "@/src/shared/permissions/can";
import { isOrgToolEnabled } from "@/src/shared/org/features";
import { FormEditorPanel } from "@/src/features/forms/components/FormEditorPanel";
import { FormPublishToggleButton } from "@/src/features/forms/components/FormPublishToggleButton";
import { getFormById } from "@/src/features/forms/db/queries";
import { listProgramNodes, listProgramsForManage } from "@/src/features/programs/db/queries";
import { ToolUnavailablePanel } from "../../../ToolUnavailablePanel";

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
  if (!isOrgToolEnabled(orgContext.toolAvailability, "forms")) {
    return (
      <PageStack>
        <PageHeader description="Build fields visually, preview output, and publish immutable versions." showBorder={false} title="Form Builder" />
        <ToolUnavailablePanel title="Forms" />
      </PageStack>
    );
  }
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
      <PageTabs
        active="builder"
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
      <FormEditorPanel canWrite={canWriteForms} form={form} orgSlug={orgContext.orgSlug} programNodes={programNodes} programs={programs} />
    </PageStack>
  );
}
