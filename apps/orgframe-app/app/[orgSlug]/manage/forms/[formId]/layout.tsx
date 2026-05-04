import { notFound } from "next/navigation";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { Chip } from "@orgframe/ui/primitives/chip";
import { ManagePageShell } from "@/src/features/core/layout/components/ManagePageShell";
import { gateManageSection } from "@/src/features/core/layout/gateManageSection";
import { can } from "@/src/shared/permissions/can";
import { FormPublishToggleButton } from "@/src/features/forms/components/FormPublishToggleButton";
import { getFormByIdCached } from "@/src/features/forms/cached-loaders";
import { ToolUnavailablePanel } from "../../ToolUnavailablePanel";
import { FormPageTabs } from "./FormPageTabs";

export default async function FormManageLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string; formId: string }>;
}) {
  const { orgSlug, formId } = await params;
  const { orgContext, unavailable } = await gateManageSection(orgSlug, {
    permission: ["forms.read", "forms.write"],
    tool: "forms"
  });

  if (unavailable) {
    return (
      <ManagePageShell title="Forms">
        <ToolUnavailablePanel title="Forms" />
      </ManagePageShell>
    );
  }

  const form = await getFormByIdCached(orgContext.orgId, formId);
  if (!form) {
    notFound();
  }

  const canWriteForms = can(orgContext.membershipPermissions, "forms.write");
  const statusLabel = form.status === "published" ? "Published" : "Not published";
  const statusColor = form.status === "published" ? "green" : "yellow";

  return (
    <ManagePageShell
      actions={
        <>
          <Button href={`/${orgSlug}/manage/forms`} variant="secondary">
            Back to forms
          </Button>
          <FormPublishToggleButton canWrite={canWriteForms} form={form} orgSlug={orgSlug} />
        </>
      }
      tabs={<FormPageTabs formId={form.id} orgSlug={orgSlug} />}
      title={
        <span className="inline-flex items-center gap-3">
          <span>{form.name}</span>
          <Chip className="normal-case tracking-normal" color={statusColor}>{statusLabel}</Chip>
        </span>
      }
    >
      {!canWriteForms ? <Alert className="mb-3" variant="info">You have read-only access to this form.</Alert> : null}
      {children}
    </ManagePageShell>
  );
}
