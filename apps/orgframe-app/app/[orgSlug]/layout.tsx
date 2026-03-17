import type { Metadata } from "next";
import { BrandingCssVarsBridge } from "@orgframe/ui/shared/BrandingCssVarsBridge";
import { OrgHeader } from "@orgframe/ui/shared/OrgHeader";
import { applyBrandingVars } from "@/lib/branding/applyBrandingVars";
import { getOrgAssetPublicUrl } from "@/lib/branding/getOrgAssetPublicUrl";
import { shouldShowBranchHeaders } from "@/lib/env/branchVisibility";
import { getOrgRequestContext } from "@/lib/org/getOrgRequestContext";
import { listOrgNavItemsForHeader, listOrgPagesForHeader } from "@/modules/site-builder/db/queries";

export async function generateMetadata({ params }: { params: Promise<{ orgSlug: string }> }): Promise<Metadata> {
  const { orgSlug } = await params;
  const orgRequest = await getOrgRequestContext(orgSlug).catch(() => null);
  const orgName = orgRequest?.org.orgName ?? orgSlug;

  return {
    title: {
      default: "Home",
      template: `%s | ${orgName}`
    },
    icons: {
      icon: `/${orgSlug}/icon`
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
  const pages = await listOrgPagesForHeader({
    orgId: orgRequest.org.orgId,
    includeUnpublished: canEditPages
  }).catch(() => []);
  const navItems = await listOrgNavItemsForHeader({
    orgId: orgRequest.org.orgId,
    includeUnpublished: canEditPages
  }).catch(() => []);

  const brandingVars = applyBrandingVars({ accent: orgRequest.org.branding.accent });
  const capabilities = orgRequest.capabilities;
  const canManageOrg = capabilities?.manage.canAccessArea ?? false;
  const showHeaders = shouldShowBranchHeaders();

  return (
    <div className="org-layout-root" style={brandingVars}>
      <BrandingCssVarsBridge vars={brandingVars as Record<string, string>} />
      {showHeaders ? (
        <OrgHeader
          canEditPages={canEditPages}
          canManageOrg={canManageOrg}
          governingBodyLogoUrl={orgRequest.org.governingBody?.logoUrl ?? null}
          governingBodyName={orgRequest.org.governingBody?.name ?? null}
          navItems={navItems}
          pages={pages}
          orgLogoUrl={orgLogoUrl}
          orgName={orgRequest.org.orgName}
          orgSlug={orgRequest.org.orgSlug}
        />
      ) : null}
      <div className="org-layout-content">{children}</div>
    </div>
  );
}
