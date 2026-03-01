import { Alert } from "@/components/ui/alert";
import type { Metadata } from "next";
import { AssetTile } from "@/components/ui/asset-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ColorPickerInput } from "@/components/ui/color-picker-input";
import { FormField } from "@/components/ui/form-field";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { getOrgAssetPublicUrl } from "@/lib/branding/getOrgAssetPublicUrl";
import { can } from "@/lib/permissions/can";
import { requireOrgPermission } from "@/lib/permissions/requireOrgPermission";
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
    <>
      <PageHeader description="Control how your organization appears across public and staff routes." showBorder={false} title="Branding" />

      {query.saved === "1" ? <Alert variant="success">Branding saved successfully.</Alert> : null}
      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Brand Assets</CardTitle>
          <CardDescription>Logo and icon are used in org routes and the org favicon endpoint.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <form action={saveBranding} className="space-y-5">
            <fieldset className="space-y-4" disabled={!canManageBranding}>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField className="space-y-2" label="Org Logo">
                  <AssetTile
                    constraints={{
                      accept: "image/*,.svg",
                      maxSizeMB: 10,
                      aspect: "free",
                      recommendedPx: {
                        w: 1200,
                        h: 500
                      }
                    }}
                    disabled={!canManageBranding}
                    emptyLabel="Upload logo"
                    fit="contain"
                    initialPath={orgContext.branding.logoPath}
                    initialUrl={logoUrl}
                    kind="org"
                    name="logoPath"
                    orgSlug={orgSlug}
                    previewAlt={`${orgContext.orgName} logo`}
                    purpose="org-logo"
                    specificationText="PNG, JPG, WEBP, HEIC, or SVG"
                    title="Org Logo"
                  />
                </FormField>

                <FormField className="space-y-2" label="Org Icon">
                  <AssetTile
                    constraints={{
                      accept: "image/*,.ico",
                      maxSizeMB: 10,
                      aspect: "square",
                      recommendedPx: {
                        w: 512,
                        h: 512
                      }
                    }}
                    disabled={!canManageBranding}
                    emptyLabel="Upload icon"
                    fit="contain"
                    initialPath={orgContext.branding.iconPath}
                    initialUrl={iconUrl}
                    kind="org"
                    name="iconPath"
                    orgSlug={orgSlug}
                    previewAlt={`${orgContext.orgName} icon`}
                    purpose="org-icon"
                    specificationText="PNG, ICO, JPG, HEIC, or SVG"
                    title="Org Icon"
                  />
                </FormField>
              </div>

              <FormField hint="Hex format: #RRGGBB" label="Accent Color">
                <ColorPickerInput defaultValue={orgContext.branding.accent ?? ""} name="accent" />
              </FormField>
            </fieldset>

            {!canManageBranding ? <Alert variant="warning">You have read-only access to branding settings.</Alert> : null}
            <SubmitButton disabled={!canManageBranding}>Save Branding</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
