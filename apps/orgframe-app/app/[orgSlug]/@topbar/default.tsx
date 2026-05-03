import { headers } from "next/headers";
import { OrgHeader } from "@/src/features/core/layout/components/OrgHeader";
import { getOrgAssetPublicUrl } from "@/src/shared/branding/getOrgAssetPublicUrl";
import { shouldShowBranchHeaders } from "@/src/shared/env/branchVisibility";
import { getOrgRequestContext } from "@/src/shared/org/getOrgRequestContext";
import { listOrgNavItemsForHeader } from "@/src/features/site/db/queries";
import { getOrgAdminNavTree, prefixAdminNavHrefs } from "@/src/features/core/navigation/config/adminNav";
import { listUserOrgs } from "@/src/shared/org/listUserOrgs";
import { getTenantBaseHosts, resolveOrgSubdomain } from "@/src/shared/domains/customDomains";
import { parseHostWithPort } from "@/src/shared/domains/hostHeaders";

/**
 * Topbar parallel-route slot. Owns its own data fetching for the org
 * header — the layout doesn't need to know what's inside.
 */
export default async function OrgTopbarSlot({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  if (!shouldShowBranchHeaders()) return null;

  const orgRequest = await getOrgRequestContext(orgSlug);
  const canEditPages = orgRequest.capabilities?.pages.canWrite ?? false;
  const orgLogoUrl = getOrgAssetPublicUrl(orgRequest.org.branding.logoPath);
  const capabilities = orgRequest.capabilities;
  const canManageOrg = capabilities?.manage.canAccessArea ?? false;

  const navItems = await listOrgNavItemsForHeader({
    orgId: orgRequest.org.orgId,
    includeUnpublished: canEditPages
  }).catch(() => []);

  const memberships = await listUserOrgs().catch(() => []);
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
  );
}
