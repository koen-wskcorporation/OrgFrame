import type { Metadata } from "next";
import { BrandingCssVarsBridge } from "@/src/features/core/layout/components/BrandingCssVarsBridge";
import { OrgHeader } from "@/src/features/core/layout/components/OrgHeader";
import { applyBrandingVars } from "@/src/shared/branding/applyBrandingVars";
import { getOrgAssetPublicUrl } from "@/src/shared/branding/getOrgAssetPublicUrl";
import { shouldShowBranchHeaders } from "@/src/shared/env/branchVisibility";
import { getOrgRequestContext } from "@/src/shared/org/getOrgRequestContext";
import { listOrgPagesForHeader, resolveOrgSiteStructureForHeader } from "@/src/features/site/db/queries";

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
  const pages = await listOrgPagesForHeader({
    orgId: orgRequest.org.orgId,
    includeUnpublished: canEditPages
  }).catch(() => []);
  const resolvedSiteStructure = await resolveOrgSiteStructureForHeader({
    orgId: orgRequest.org.orgId,
    orgSlug: orgRequest.org.orgSlug,
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
          capabilities={capabilities}
          governingBodyLogoUrl={orgRequest.org.governingBody?.logoUrl ?? null}
          governingBodyName={orgRequest.org.governingBody?.name ?? null}
          pages={pages}
          resolvedSiteStructure={resolvedSiteStructure}
          orgLogoUrl={orgLogoUrl}
          orgName={orgRequest.org.orgName}
          orgSlug={orgRequest.org.orgSlug}
          toolAvailability={orgRequest.org.toolAvailability}
        />
      ) : null}
      <div className="org-layout-content">{children}</div>
    </div>
  );
}
