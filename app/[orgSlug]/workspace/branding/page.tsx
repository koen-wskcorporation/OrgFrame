import { Alert } from "@/components/ui/alert";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageStack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { getOrgAssetPublicUrl } from "@/lib/branding/getOrgAssetPublicUrl";
import { can } from "@/lib/permissions/can";
import { requireOrgPermission } from "@/lib/permissions/requireOrgPermission";
import { BrandingForm } from "./BrandingForm";
import { saveOrgBrandingAction } from "./actions";

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
  const orgContext = await requireOrgPermission(orgSlug, "org.branding.read");
  const canManageBranding = can(orgContext.membershipPermissions, "org.branding.write");

  const query = await searchParams;
  const logoUrl = getOrgAssetPublicUrl(orgContext.branding.logoPath);
  const iconUrl = getOrgAssetPublicUrl(orgContext.branding.iconPath);
  const errorMessage = query.error ? errorMessageByCode[query.error] : null;
  const saveBranding = saveOrgBrandingAction.bind(null, orgSlug);

  return (
    <PageStack>
      <PageHeader description="Control how your organization appears across public and staff routes." showBorder={false} title="Branding" />

      {query.saved === "1" ? <Alert variant="success">Branding saved successfully.</Alert> : null}
      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Brand Assets</CardTitle>
          <CardDescription>Logo and icon are used in org routes and the org favicon endpoint.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
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
        </CardContent>
      </Card>
    </PageStack>
  );
}
