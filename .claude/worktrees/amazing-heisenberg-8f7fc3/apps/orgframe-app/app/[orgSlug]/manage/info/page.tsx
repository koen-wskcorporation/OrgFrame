import { Alert } from "@orgframe/ui/primitives/alert";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { Select } from "@orgframe/ui/primitives/select";
import { SubmitButton } from "@orgframe/ui/primitives/submit-button";
import { listGoverningBodies } from "@/src/shared/org/listGoverningBodies";
import { can } from "@/src/shared/permissions/can";
import { requireOrgPermission } from "@/src/shared/permissions/requireOrgPermission";
import { isOrgToolEnabled } from "@/src/shared/org/features";
import { getRoleLabel } from "@/src/features/core/access";
import { OrgInfoPageToasts } from "./OrgInfoPageToasts";
import { saveOrgGoverningBodyAction } from "./actions";
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
      <PageStack>
        <PageHeader description="View and manage organization identity details used across public and staff routes." showBorder={false} title="Org Info" />
        <ToolUnavailablePanel title="Org Info" />
      </PageStack>
    );
  }

  const canSave = can(orgContext.membershipPermissions, "org.branding.write");
  const successMessage = query.saved ? successMessageByCode[query.saved] : null;
  const errorMessage = query.error ? errorMessageByCode[query.error] : null;

  return (
    <PageStack>
      <PageHeader description="View and manage organization identity details used across public and staff routes." showBorder={false} title="Org Info" />
      <OrgInfoPageToasts errorMessage={errorMessage} successMessage={successMessage} />

      <Card>
        <CardHeader>
          <CardTitle>Organization Details</CardTitle>
          <CardDescription>Set your governing body for header presentation and public brand context.</CardDescription>
        </CardHeader>
        <CardContent className="app-section-stack">
          <div className="grid gap-4 md:grid-cols-2">
            <InfoField label="Organization name" value={orgContext.orgName} />
            <InfoField label="Organization slug" value={orgContext.orgSlug} />
            <InfoField label="Organization ID" value={orgContext.orgId} />
            <InfoField label="Your role" value={getRoleLabel(orgContext.membershipRole)} />
          </div>

          <form action={saveOrgGoverningBodyAction.bind(null, orgSlug)} className="space-y-4">
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
              <Alert variant="warning">You have read-only access for governing body settings.</Alert>
            )}
          </form>
        </CardContent>
      </Card>
    </PageStack>
  );
}
