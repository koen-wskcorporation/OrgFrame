import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { DashboardSection, DashboardShell } from "@/src/features/core/dashboard/components/DashboardShell";
import { EmptyState } from "@/src/features/core/dashboard/components/EmptyState";
import { Button } from "@orgframe/ui/primitives/button";
import { SubmitButton } from "@orgframe/ui/primitives/submit-button";
import { signOutAction } from "@/app/auth/actions";
import { getDashboardContext } from "@/src/features/core/dashboard/getDashboardContext";
import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";
import { getPlatformHost, getTenantBaseHosts, normalizeHost, resolveOrgSubdomain } from "@/src/shared/domains/customDomains";
import { parseHostWithPort } from "@/src/shared/domains/hostHeaders";
import { OrganizationsRepeater } from "@/app/OrganizationsRepeater";

export const metadata: Metadata = {
  title: "Dashboard"
};

function getMarketingOriginForHost(host: string) {
  const normalizedHost = normalizeHost(host);

  if (normalizedHost === "staging.orgframe.app") {
    return (process.env.NEXT_PUBLIC_STAGING_WEB_ORIGIN ?? process.env.ORGFRAME_STAGING_WEB_ORIGIN ?? "https://staging.orgframeapp.com").replace(/\/+$/, "");
  }

  if (normalizedHost === "orgframe.app") {
    return (process.env.NEXT_PUBLIC_WEB_ORIGIN ?? process.env.ORGFRAME_WEB_ORIGIN ?? "https://orgframeapp.com").replace(/\/+$/, "");
  }

  return null;
}

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) {
    const headerStore = await headers();
    const forwardedHost = headerStore.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = normalizeHost(forwardedHost || headerStore.get("host"));
    const marketingOrigin = getMarketingOriginForHost(host);

    if (marketingOrigin) {
      redirect(marketingOrigin);
    }

    redirect("/auth");
  }

  const { organizations } = await getDashboardContext();
  const headerStore = await headers();
  const parsedHost = parseHostWithPort(headerStore.get("x-forwarded-host") || headerStore.get("host"));
  const host = parsedHost.host;
  const tenantBaseHosts = getTenantBaseHosts();
  const orgSubdomain = resolveOrgSubdomain(host, tenantBaseHosts);
  const tenantBaseAuthority = orgSubdomain
    ? parsedHost.port
      ? `${orgSubdomain.baseHost}:${parsedHost.port}`
      : orgSubdomain.baseHost
    : tenantBaseHosts.has(host)
      ? parsedHost.hostWithPort || host
      : getPlatformHost();
  const forwardedProto = headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const protocol =
    forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : process.env.NODE_ENV === "production" ? "https" : "http";

  return (
    <DashboardShell
      actions={
        <>
          <Button href="/account" size="sm" variant="secondary">
            Account
          </Button>
          <form action={signOutAction}>
            <SubmitButton size="sm" variant="ghost">
              Sign out
            </SubmitButton>
          </form>
        </>
      }
      subtitle="Your sports in one place."
      title="Dashboard"
    >
      <DashboardSection description="Open an organization to view its public site and manage core settings." title="Organizations">
        {organizations.length === 0 ? (
          <EmptyState />
        ) : (
          <OrganizationsRepeater
            organizations={organizations.map((organization) => ({
              href: `${protocol}://${organization.orgSlug}.${tenantBaseAuthority}/`,
              iconUrl: organization.iconUrl,
              orgId: organization.orgId,
              orgName: organization.orgName,
              orgSlug: organization.orgSlug
            }))}
          />
        )}
      </DashboardSection>
    </DashboardShell>
  );
}
