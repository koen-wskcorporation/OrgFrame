import { Alert } from "@orgframe/ui/primitives/alert";
import type { Metadata } from "next";
import { getOrgAssetPublicUrl } from "@/src/shared/branding/getOrgAssetPublicUrl";
import { can } from "@/src/shared/permissions/can";
import { gateManageSection } from "@/src/features/core/layout/gateManageSection";
import { PageShell } from "@/src/features/core/layout/components/PageShell";
import { Section } from "@orgframe/ui/primitives/section";
import { BrandingForm } from "./BrandingForm";
import { saveOrgBrandingAction } from "./actions";
import { ToolUnavailablePanel } from "../ToolUnavailablePanel";

export const metadata: Metadata = {
  title: "Branding"
};

const errorMessageByCode: Record<string, string> = {
  invalid_accent: "Accent color must be a valid hex value.",
  save_failed: "Unable to save branding settings right now."
};

export default async function OrgBrandingSettingsPage({
  params,
  searchParams
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { orgSlug } = await params;
  const { orgContext, unavailable } = await gateManageSection(orgSlug, {
    permission: "org.branding.read",
    tool: "branding"
  });
  if (unavailable) {
    return (
      <PageShell
        description="Control how your organization appears across public and staff routes."
        title="Branding"
      >
        <ToolUnavailablePanel title="Branding" />
      </PageShell>
    );
  }
  const canManageBranding = can(orgContext.membershipPermissions, "org.branding.write");

  const query = await searchParams;
  const logoUrl = getOrgAssetPublicUrl(orgContext.branding.logoPath);
  const iconUrl = getOrgAssetPublicUrl(orgContext.branding.iconPath);
  const errorMessage = query.error ? errorMessageByCode[query.error] : null;
  const saveBranding = saveOrgBrandingAction.bind(null, orgSlug);

  return (
    <PageShell description="Control how your organization appears across public and staff routes." title="Branding">
      {query.saved === "1" ? <Alert variant="success">Branding saved successfully.</Alert> : null}
      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}
      <Section
        contentClassName="space-y-4 p-5 md:p-6"
        description="Control how your organization appears across public and staff routes."
        fill={false}
        title="Branding"
      >
        <BrandingForm
          accent={orgContext.branding.accent}
          canManageBranding={canManageBranding}
          iconPath={orgContext.branding.iconPath}
          iconUrl={iconUrl}
          logoPath={orgContext.branding.logoPath}
          logoUrl={logoUrl}
          orgName={orgContext.orgName}
          orgSlug={orgSlug}
          saveAction={saveBranding}
        />
      </Section>
    </PageShell>
  );
}
