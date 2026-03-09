import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { PageStack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { getPlatformHost } from "@/lib/domains/customDomains";
import { can } from "@/lib/permissions/can";
import { requireOrgPermission } from "@/lib/permissions/requireOrgPermission";
import { createSupabaseServer } from "@/lib/supabase/server";
import { removeOrgCustomDomainAction, saveOrgCustomDomainAction, verifyOrgCustomDomainAction } from "./actions";

export const metadata: Metadata = {
  title: "Custom Domains"
};

const errorMessageByCode: Record<string, string> = {
  invalid_domain: "Enter a valid domain like example.com or www.example.com.",
  domain_taken: "That domain is already connected to another organization.",
  missing_domain: "Save a domain before requesting verification.",
  verification_failed: "DNS verification failed. Check your DNS records and try again.",
  remove_failed: "Unable to remove the custom domain right now.",
  save_failed: "Unable to save the custom domain right now."
};

const statusMessageByCode: Record<string, string> = {
  pending: "Pending verification",
  verified: "Verified",
  failed: "Needs attention"
};

type DomainRecord = {
  domain: string;
  status: "pending" | "verified" | "failed";
  verification_token: string;
  verified_at: string | null;
  last_error: string | null;
};

export default async function OrgManageDomainsPage({
  params,
  searchParams
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ saved?: string; removed?: string; verified?: string; error?: string }>;
}) {
  const { orgSlug } = await params;
  const [orgContext, query] = await Promise.all([requireOrgPermission(orgSlug, "org.manage.read"), searchParams]);
  const canManage = can(orgContext.membershipPermissions, "org.manage.read");

  const supabase = await createSupabaseServer();
  const { data: domainData, error: domainError } = await supabase
    .from("org_custom_domains")
    .select("domain, status, verification_token, verified_at, last_error")
    .eq("org_id", orgContext.orgId)
    .maybeSingle();

  const customDomain = domainData as DomainRecord | null;
  const platformHost = getPlatformHost();
  const verificationHost = customDomain ? `_sports-saas-verification.${customDomain.domain}` : null;
  const errorMessage = query.error ? errorMessageByCode[query.error] : null;
  const statusMessage = customDomain ? statusMessageByCode[customDomain.status] ?? "Pending verification" : null;

  return (
    <PageStack>
      <PageHeader
        description="Connect a domain you own to this organization and publish the DNS records needed for routing."
        showBorder={false}
        title="Custom Domains"
      />

      {query.saved === "1" ? <Alert variant="success">Custom domain settings saved.</Alert> : null}
      {query.removed === "1" ? <Alert variant="success">Custom domain removed.</Alert> : null}
      {query.verified === "1" ? <Alert variant="success">Domain verified successfully. Host-based routing is now active.</Alert> : null}
      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}
      {domainError ? <Alert variant="destructive">Unable to load custom domain settings right now.</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Domain Connection</CardTitle>
            <CardDescription>Set the hostname you want to use for this org site.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <form action={saveOrgCustomDomainAction.bind(null, orgSlug)} className="space-y-4">
              <fieldset className="space-y-4" disabled={!canManage}>
                <FormField hint="Example: example.com or www.example.com" htmlFor="custom-domain-input" label="Custom domain">
                  <Input
                    defaultValue={customDomain?.domain ?? ""}
                    id="custom-domain-input"
                    name="domain"
                    placeholder="www.example.com"
                    required
                  />
                </FormField>
              </fieldset>

              {customDomain ? (
                <p className="text-xs text-text-muted">
                  Status: <span className="font-semibold text-text">{statusMessage}</span>
                </p>
              ) : (
                <p className="text-xs text-text-muted">No custom domain is connected yet.</p>
              )}

              {!canManage ? <Alert variant="warning">You have read-only access to custom domain settings.</Alert> : null}
              <SubmitButton disabled={!canManage} variant="secondary">
                {customDomain ? "Update domain" : "Connect domain"}
              </SubmitButton>
            </form>

            {customDomain && canManage ? (
              <div className="flex flex-wrap gap-2">
                <form action={verifyOrgCustomDomainAction.bind(null, orgSlug)}>
                  <Button type="submit" variant="secondary">
                    Verify DNS now
                  </Button>
                </form>
                <form action={removeOrgCustomDomainAction.bind(null, orgSlug)}>
                  <Button className="ui-button-danger" type="submit" variant="secondary">
                    Remove domain
                  </Button>
                </form>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>DNS Setup</CardTitle>
            <CardDescription>Add these records at your DNS provider, then allow time for propagation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <p className="ui-kv-label">CNAME Target</p>
              <p className="ui-kv-value break-all">{platformHost}</p>
            </div>

            {customDomain ? (
              <>
                <div className="space-y-1">
                  <p className="ui-kv-label">Recommended CNAME Host</p>
                  <p className="ui-kv-value break-all">{customDomain.domain}</p>
                </div>

                <div className="space-y-1">
                  <p className="ui-kv-label">Verification TXT Host</p>
                  <p className="ui-kv-value break-all">{verificationHost}</p>
                </div>

                <div className="space-y-1">
                  <p className="ui-kv-label">Verification TXT Value</p>
                  <p className="ui-kv-value break-all">{customDomain.verification_token}</p>
                </div>

                {customDomain.verified_at ? (
                  <div className="space-y-1">
                    <p className="ui-kv-label">Verified At</p>
                    <p className="ui-kv-value break-all">{new Date(customDomain.verified_at).toLocaleString()}</p>
                  </div>
                ) : null}

                {customDomain.last_error ? <Alert variant="warning">Latest verification note: {customDomain.last_error}</Alert> : null}
              </>
            ) : (
              <Alert variant="info">Save a domain first to generate verification values.</Alert>
            )}

            <Alert variant="info">
              Some DNS providers do not support CNAME at apex/root domains. If needed, point <span className="font-semibold">www</span> and forward your root
              domain.
            </Alert>
          </CardContent>
        </Card>
      </div>
    </PageStack>
  );
}
