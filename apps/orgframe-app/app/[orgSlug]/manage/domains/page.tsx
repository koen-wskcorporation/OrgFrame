import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { getPlatformHost } from "@/src/shared/domains/customDomains";
import { buildGoDaddyQuickConnect, type GoDaddyQuickConnect } from "@/src/shared/domains/domainConnect";
import { getVercelDomainDnsInstructions, type VercelDnsInstruction } from "@/src/shared/domains/vercelProjectDomains";
import { can } from "@/src/shared/permissions/can";
import { requireOrgPermission } from "@/src/shared/permissions/requireOrgPermission";
import { isOrgToolEnabled } from "@/src/shared/org/features";
import { createSupabaseServer } from "@/src/shared/data-api/server";
import { DomainSetupModal } from "./DomainSetupModal";
import { removeOrgCustomDomainAction, saveOrgCustomDomainAction, verifyOrgCustomDomainAction } from "./actions";
import { ToolUnavailablePanel } from "../ToolUnavailablePanel";

export const metadata: Metadata = {
  title: "Custom Domains"
};

const errorMessageByCode: Record<string, string> = {
  invalid_domain: "Enter a valid domain like example.com or www.example.com.",
  domain_taken: "That domain is already connected to another organization.",
  missing_domain: "Save a domain before requesting verification.",
  verification_failed: "DNS verification failed. Check your DNS records and try again.",
  vercel_not_configured: "Automatic Vercel domain connection is not configured on the server yet.",
  vercel_attach_failed: "We could not automatically connect this domain in Vercel.",
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

type RequiredDnsRecord = {
  type: string;
  host: string;
  value: string;
  note: string | null;
};

function isLikelyApexDomain(domain: string) {
  return !domain.startsWith("www.");
}

const defaultQuickConnect: GoDaddyQuickConnect = {
  available: false,
  reason: null,
  applyUrl: null,
  providerLabel: "GoDaddy"
};

export default async function OrgManageDomainsPage({
  params,
  searchParams
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ saved?: string; removed?: string; verified?: string; error?: string; detail?: string; setup?: string; step?: string; method?: string }>;
}) {
  const { orgSlug } = await params;
  const [orgContext, query] = await Promise.all([requireOrgPermission(orgSlug, "org.manage.read"), searchParams]);
  if (!isOrgToolEnabled(orgContext.toolAvailability, "domains")) {
    return (
      <PageStack>
        <PageHeader description="Connect your domain in a guided flow designed for non-technical users." showBorder={false} title="Custom Domains" />
        <ToolUnavailablePanel title="Custom Domains" />
      </PageStack>
    );
  }
  const canManage = can(orgContext.membershipPermissions, "org.manage.read");

  const supabase = await createSupabaseServer();
  const { data: domainData, error: domainError } = await supabase
    .schema("orgs").from("custom_domains")
    .select("domain, status, verification_token, verified_at, last_error")
    .eq("org_id", orgContext.orgId)
    .maybeSingle();

  const customDomain = domainData as DomainRecord | null;
  const platformHost = getPlatformHost();
  const errorMessage = query.error ? errorMessageByCode[query.error] : null;
  const errorDetail = query.detail?.trim() ? query.detail.trim() : null;
  const statusMessage = customDomain ? statusMessageByCode[customDomain.status] ?? "Pending verification" : null;
  const setupStep = Math.min(Math.max(Number.parseInt(query.step ?? "1", 10) || 1, 1), 3);
  const setupOpen = query.setup === "1";
  const setupMethod = query.method ?? null;
  const openSetupHref = `/manage/domains?setup=1&step=${customDomain ? "2" : "1"}`;
  const quickConnect =
    customDomain && canManage
      ? await buildGoDaddyQuickConnect({
          domain: customDomain.domain,
          orgSlug,
          platformHost,
          verificationHost: `_orgframe-verification.${customDomain.domain}`,
          verificationToken: customDomain.verification_token
        })
      : defaultQuickConnect;
  const requiredDnsRecords: RequiredDnsRecord[] = customDomain
    ? [
        {
          type: "TXT",
          host: `_orgframe-verification.${customDomain.domain}`,
          value: customDomain.verification_token,
          note: "OrgFrame ownership verification"
        }
      ]
    : [];

  if (customDomain) {
    const vercelRecords = await getVercelDomainDnsInstructions(customDomain.domain);

    if (vercelRecords.ok && vercelRecords.records.length > 0) {
      vercelRecords.records.forEach((record: VercelDnsInstruction) => {
        requiredDnsRecords.push({
          type: record.type,
          host: record.host,
          value: record.value,
          note: record.reason ?? "Required by Vercel"
        });
      });
    } else if (vercelRecords.ok && vercelRecords.records.length === 0) {
      if (isLikelyApexDomain(customDomain.domain)) {
        requiredDnsRecords.push({
          type: "A",
          host: "@",
          value: process.env.VERCEL_APEX_A_RECORD?.trim() || "216.198.79.1",
          note: "Apex/root fallback for Vercel. If Vercel dashboard shows a different IP, use Vercel's value."
        });
      } else {
        requiredDnsRecords.push({
          type: "CNAME",
          host: customDomain.domain,
          value: platformHost,
          note: "Subdomain fallback routing target"
        });
      }
    } else {
      if (isLikelyApexDomain(customDomain.domain)) {
        requiredDnsRecords.push({
          type: "A",
          host: "@",
          value: process.env.VERCEL_APEX_A_RECORD?.trim() || "216.198.79.1",
          note: "Apex/root fallback for Vercel. If Vercel dashboard shows a different IP, use Vercel's value."
        });
      } else {
        requiredDnsRecords.push({
          type: "CNAME",
          host: customDomain.domain,
          value: platformHost,
          note: "Subdomain fallback routing target"
        });
      }
    }
  }

  return (
    <PageStack>
      <PageHeader
        description="Connect your domain in a guided flow designed for non-technical users."
        showBorder={false}
        title="Custom Domains"
      />

      {query.saved === "1" ? <Alert variant="success">Custom domain settings saved.</Alert> : null}
      {query.removed === "1" ? <Alert variant="success">Custom domain removed.</Alert> : null}
      {query.verified === "1" ? <Alert variant="success">Domain verified successfully. Host-based routing is now active.</Alert> : null}
      {errorMessage ? (
        <Alert variant="destructive">
          {errorMessage}
          {errorDetail ? <span className="block mt-1 text-xs">{errorDetail}</span> : null}
        </Alert>
      ) : null}
      {domainError ? <Alert variant="destructive">Unable to load custom domain settings right now.</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Domain Status</CardTitle>
          <CardDescription>Use the guided setup wizard to connect through your registrar first, with manual DNS as backup.</CardDescription>
        </CardHeader>
        <CardContent className="app-section-stack">
          {customDomain ? (
            <div className="ui-muted-block">
              <p className="text-sm font-semibold text-text">{customDomain.domain}</p>
              <p className="text-xs text-text-muted">
                Status: <span className="font-semibold text-text">{statusMessage}</span>
              </p>
              {customDomain.verified_at ? <p className="mt-1 text-xs text-text-muted">Verified: {new Date(customDomain.verified_at).toLocaleString()}</p> : null}
              {customDomain.last_error ? <p className="mt-1 text-xs text-warning">Latest verification note: {customDomain.last_error}</p> : null}
            </div>
          ) : (
            <Alert variant="info">No custom domain connected yet.</Alert>
          )}

          {!canManage ? <Alert variant="warning">You have read-only access to custom domain settings.</Alert> : null}

          <div className="flex flex-wrap gap-2">
            <Button disabled={!canManage} href={openSetupHref} variant="secondary">
              {customDomain ? "Open setup wizard" : "Connect domain"}
            </Button>
            <Button href={`/manage/domains/diagnostics`} variant="ghost">
              Quick-connect diagnostics
            </Button>

            {customDomain && canManage ? (
              <form action={verifyOrgCustomDomainAction.bind(null, orgSlug)}>
                <Button type="submit" variant="secondary">
                  Verify now
                </Button>
              </form>
            ) : null}

            {customDomain && canManage ? (
              <form action={removeOrgCustomDomainAction.bind(null, orgSlug)}>
                <Button className="ui-button-danger" type="submit" variant="secondary">
                  Remove domain
                </Button>
              </form>
            ) : null}
          </div>

          <Alert variant="info">
            If your registrar cannot place a CNAME on the root domain, connect <span className="font-semibold">www</span> and forward the apex/root domain.
          </Alert>
        </CardContent>
      </Card>

      <DomainSetupModal
        canManage={canManage}
        customDomain={customDomain}
        initialMethod={setupMethod}
        initialOpen={setupOpen}
        initialStep={setupStep}
        quickConnect={quickConnect}
        requiredDnsRecords={requiredDnsRecords}
        orgSlug={orgSlug}
        platformHost={platformHost}
        saveAction={saveOrgCustomDomainAction.bind(null, orgSlug)}
        verifyAction={verifyOrgCustomDomainAction.bind(null, orgSlug)}
      />
    </PageStack>
  );
}
