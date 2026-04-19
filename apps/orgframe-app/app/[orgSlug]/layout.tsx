import type { Metadata } from "next";
import { BrandingCssVarsBridge } from "@/src/features/core/layout/components/BrandingCssVarsBridge";
import { OrgHeader } from "@/src/features/core/layout/components/OrgHeader";
import { OrgScopedWorkspaceShell } from "@/src/features/workspace/components/OrgScopedWorkspaceShell";
import { OrgShareProvider } from "@/src/features/org-share/OrgShareProvider";
import { applyBrandingVars } from "@/src/shared/branding/applyBrandingVars";
import { getOrgAssetPublicUrl } from "@/src/shared/branding/getOrgAssetPublicUrl";
import { shouldShowBranchHeaders } from "@/src/shared/env/branchVisibility";
import { getOrgRequestContext } from "@/src/shared/org/getOrgRequestContext";
import { listOrgNavItemsForHeader } from "@/src/features/site/db/queries";
import { getOrgAdminNavTree, prefixAdminNavHrefs } from "@/src/features/core/navigation/config/adminNav";
import { listUserOrgs } from "@/src/shared/org/listUserOrgs";
import { headers } from "next/headers";
import { getTenantBaseHosts, resolveOrgSubdomain } from "@/src/shared/domains/customDomains";
import { parseHostWithPort } from "@/src/shared/domains/hostHeaders";

export async function generateMetadata({ params }: { params: Promise<{ orgSlug: string }> }): Promise<Metadata> {
  const { orgSlug } = await params;
  const orgRequest = await getOrgRequestContext(orgSlug).catch(() => null);
  const orgName = orgRequest?.org.orgName ?? orgSlug;

  return {
    title: {
      default: "Home",
      template: `%s | ${orgName} | OrgFrame`
    },
    icons: {
      icon: "/icon"
    }
  };
}

export default async function OrgLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const orgRequest = await getOrgRequestContext(orgSlug);
  const canEditPages = orgRequest.capabilities?.pages.canWrite ?? false;
  const orgLogoUrl = getOrgAssetPublicUrl(orgRequest.org.branding.logoPath);

  const brandingVars = applyBrandingVars({ accent: orgRequest.org.branding.accent });
  const capabilities = orgRequest.capabilities;
  const canManageOrg = capabilities?.manage.canAccessArea ?? false;
  const showHeaders = shouldShowBranchHeaders();

  const navItems = await listOrgNavItemsForHeader({
    orgId: orgRequest.org.orgId,
    includeUnpublished: canEditPages
  }).catch(() => []);

  const memberships = showHeaders ? await listUserOrgs().catch(() => []) : [];
  const orgOptions = memberships.map((membership) => ({
    orgSlug: membership.orgSlug,
    orgName: membership.orgName,
    orgIconUrl: getOrgAssetPublicUrl(membership.iconPath),
    orgLogoUrl: getOrgAssetPublicUrl(membership.logoPath)
  }));

  const headerStore = await headers();
  const hostHeader = headerStore.get("host") || headerStore.get("x-forwarded-host");
  const parsedHost = parseHostWithPort(hostHeader);
  const orgSubdomain = resolveOrgSubdomain(parsedHost.host, getTenantBaseHosts());
  const forwardedProto = headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const protocol = forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : process.env.NODE_ENV === "production" ? "https" : "http";
  const tenantBaseOrigin = orgSubdomain
    ? `${protocol}://${parsedHost.port ? `${orgSubdomain.baseHost}:${parsedHost.port}` : orgSubdomain.baseHost}`
    : null;

  const manageNavItems = canManageOrg
    ? prefixAdminNavHrefs(
        getOrgAdminNavTree(orgRequest.org.orgSlug, {
          capabilities,
          toolAvailability: orgRequest.org.toolAvailability
        }),
        orgRequest.org.orgSlug
      )
    : [];

  return (
    <div className="org-layout-root" style={brandingVars}>
      <BrandingCssVarsBridge vars={brandingVars as Record<string, string>} />
      {showHeaders ? (
        <OrgHeader
          canEditPages={canEditPages}
          canManageOrg={canManageOrg}
          manageNavItems={manageNavItems}
          navItems={navItems}
          orgLogoUrl={orgLogoUrl}
          orgName={orgRequest.org.orgName}
          orgOptions={orgOptions}
          orgSlug={orgRequest.org.orgSlug}
          tenantBaseOrigin={tenantBaseOrigin}
        />
      ) : null}
      <OrgShareProvider orgSlug={orgRequest.org.orgSlug}>
        <div className="org-layout-content">
          <OrgScopedWorkspaceShell orgSlug={orgRequest.org.orgSlug}>{children}</OrgScopedWorkspaceShell>
        </div>
      </OrgShareProvider>
    </div>
  );
}
