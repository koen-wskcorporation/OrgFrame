import { Alert } from "@orgframe/ui/primitives/alert";
import type { Metadata } from "next";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Select } from "@orgframe/ui/primitives/select";
import { SubmitButton } from "@orgframe/ui/primitives/submit-button";
import { listGoverningBodies } from "@/src/shared/org/listGoverningBodies";
import { ORG_TYPE_LABELS, ORG_TYPE_OPTIONS } from "@/src/shared/org/orgTypes";
import { can } from "@/src/shared/permissions/can";
import { requireOrgPermission } from "@/src/shared/permissions/requireOrgPermission";
import { isOrgToolEnabled } from "@/src/features/core/config/tools";
import { getRoleLabel } from "@/src/features/core/access";
import { PageShell } from "@/src/features/core/layout/components/PageShell";
import { ManageSection } from "@/src/features/core/layout/components/ManageSection";
import { OrgInfoPageToasts } from "./OrgInfoPageToasts";
import { saveOrgInfoAction } from "./actions";
import { ToolUnavailablePanel } from "../ToolUnavailablePanel";

export const metadata: Metadata = {
  title: "Org Info"
};

const successMessageByCode: Record<string, string> = {
  "1": "Organization details updated successfully."
};

const errorMessageByCode: Record<string, string> = {
  save_failed: "Unable to save organization details right now."
};

type InfoFieldProps = {
  label: string;
  value: string;
};

function InfoField({ label, value }: InfoFieldProps) {
  return (
    <div className="space-y-1">
      <p className="ui-kv-label">{label}</p>
      <p className="ui-kv-value break-all">{value}</p>
    </div>
  );
}

export default async function OrgInfoPage({
  params,
  searchParams
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { orgSlug } = await params;
  const [orgContext, governingBodies, query] = await Promise.all([
    requireOrgPermission(orgSlug, "org.manage.read"),
    listGoverningBodies(),
    searchParams
  ]);
  if (!isOrgToolEnabled(orgContext.toolAvailability, "info")) {
    return (
      <PageShell
        description="View and manage organization identity details used across public and staff routes."
        title="Org Info"
      >
        <ToolUnavailablePanel title="Org Info" />
      </PageShell>
    );
  }

  const canSave = can(orgContext.membershipPermissions, "org.branding.write");
  const successMessage = query.saved ? successMessageByCode[query.saved] : null;
  const errorMessage = query.error ? errorMessageByCode[query.error] : null;

  return (
    <PageShell description="View and manage organization identity details used across public and staff routes." title="Org Info">
      <OrgInfoPageToasts errorMessage={errorMessage} successMessage={successMessage} />
      <ManageSection
        contentClassName="space-y-4 p-5 md:p-6"
        description="Identity details used across public and staff routes."
        fill={false}
        title="Organization details"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <InfoField label="Organization name" value={orgContext.orgName} />
          <InfoField label="Organization slug" value={orgContext.orgSlug} />
          <InfoField label="Organization ID" value={orgContext.orgId} />
          <InfoField label="Your role" value={getRoleLabel(orgContext.membershipRole)} />
        </div>

        <form action={saveOrgInfoAction.bind(null, orgSlug)} className="space-y-4">
          <FormField hint="Categorizes this organization to tailor available features." label="Organization type">
            <Select
              defaultValue={orgContext.orgType ?? ""}
              disabled={!canSave}
              name="orgType"
              options={[{ label: "Not specified", value: "" }, ...ORG_TYPE_OPTIONS]}
            />
          </FormField>

          <p className="text-xs text-text-muted">
            Current type:{" "}
            <span className="font-semibold text-text">
              {orgContext.orgType ? ORG_TYPE_LABELS[orgContext.orgType] : "Not specified"}
            </span>
          </p>

          <FormField label="Governing body">
            <Select
              defaultValue={orgContext.governingBody?.id ?? ""}
              disabled={!canSave}
              name="governingBodyId"
              options={[
                { label: "None", value: "" },
                ...governingBodies.map((body) => ({
                  label: body.name,
                  value: body.id,
                  imageSrc: body.logoUrl,
                  imageAlt: `${body.name} logo`
                }))
              ]}
            />
          </FormField>

          {orgContext.governingBody ? (
            <p className="text-xs text-text-muted">
              Current selection: <span className="font-semibold text-text">{orgContext.governingBody.name}</span>
            </p>
          ) : (
            <p className="text-xs text-text-muted">No governing body selected.</p>
          )}

          {canSave ? (
            <SubmitButton variant="secondary">Save org details</SubmitButton>
          ) : (
            <Alert variant="warning">You have read-only access to these organization settings.</Alert>
          )}
        </form>
      </ManageSection>
    </PageShell>
  );
}
