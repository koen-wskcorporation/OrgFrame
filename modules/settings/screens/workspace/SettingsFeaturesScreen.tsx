import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { PageStack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { orgFeatureDefinitions } from "@/lib/org/features";
import { can } from "@/lib/permissions/can";
import { requireOrgPermission } from "@/lib/permissions/requireOrgPermission";
import { saveOrgFeaturesAction } from "@/modules/settings/actions/features";

export const metadata: Metadata = {
  title: "Features"
};

const errorMessageByCode: Record<string, string> = {
  save_failed: "Unable to save org features right now."
};

export default async function SettingsFeaturesScreen({
  params,
  searchParams
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ saved?: string; error?: string; disabled?: string }>;
}) {
  const { orgSlug } = await params;
  const [orgContext, query] = await Promise.all([requireOrgPermission(orgSlug, "org.manage.read"), searchParams]);
  const canManage = can(orgContext.membershipPermissions, "org.manage.read");
  const errorMessage = query.error ? errorMessageByCode[query.error] : null;

  return (
    <PageStack>
      <PageHeader
        description="Choose which product areas this org should actively use. This model can also support plan gating later."
        showBorder={false}
        title="Features"
      />

      {query.saved === "1" ? <Alert variant="success">Feature settings saved.</Alert> : null}
      {query.disabled ? <Alert variant="warning">That area is currently disabled for this org.</Alert> : null}
      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Enabled Features</CardTitle>
          <CardDescription>Disable areas you do not want in the org workspace today. Billing rules can layer onto these toggles later.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <form action={saveOrgFeaturesAction.bind(null, orgSlug)} className="space-y-5">
            <fieldset className="space-y-4" disabled={!canManage}>
              {orgFeatureDefinitions.map((feature) => (
                <label className="flex items-start gap-3 rounded-[var(--radius-md)] border border-border/60 bg-canvas/40 px-4 py-3" key={feature.key}>
                  <Checkbox defaultChecked={orgContext.features[feature.key].enabled} name="features" value={feature.key} />
                  <span className="space-y-1">
                    <span className="block text-sm font-semibold text-text">{feature.label}</span>
                    <span className="block text-sm text-text-muted">{feature.description}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {!canManage ? <Alert variant="warning">You have read-only access to org feature settings.</Alert> : null}
            <SubmitButton disabled={!canManage} variant="secondary">
              Save feature settings
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </PageStack>
  );
}
