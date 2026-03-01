import type { Metadata } from "next";
import { BrandingCssVarsBridge } from "@/components/shared/BrandingCssVarsBridge";
import { OrgHeader } from "@/components/shared/OrgHeader";
import { applyBrandingVars } from "@/lib/branding/applyBrandingVars";
import { getOrgAssetPublicUrl } from "@/lib/branding/getOrgAssetPublicUrl";
import { getOrgRequestContext } from "@/lib/org/getOrgRequestContext";
import { listOrgPagesForHeader } from "@/modules/site-builder/db/queries";

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
<<<<<<< HEAD
  const gitBranch = process.env.VERCEL_GIT_COMMIT_REF ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF;
  const showChrome = process.env.NODE_ENV !== "production" || gitBranch === "testing";
=======
>>>>>>> 48a50b4d5983e8e931ae7a2e751bc3703734f32b
  const { orgSlug } = await params;
  const orgRequest = await getOrgRequestContext(orgSlug);
  const canEditPages = orgRequest.capabilities?.pages.canWrite ?? false;
  const orgLogoUrl = getOrgAssetPublicUrl(orgRequest.org.branding.logoPath);
  const pages = await listOrgPagesForHeader({
    orgId: orgRequest.org.orgId,
    includeUnpublished: canEditPages
  }).catch(() => []);

  const brandingVars = applyBrandingVars({ accent: orgRequest.org.branding.accent });
  const capabilities = orgRequest.capabilities;
  const canManageOrg = capabilities?.manage.canAccessArea ?? false;

  return (
    <div className="org-layout-root" style={brandingVars}>
      <BrandingCssVarsBridge vars={brandingVars as Record<string, string>} />
<<<<<<< HEAD
      {showChrome ? (
        <OrgHeader
          canEditPages={canEditPages}
          canManageOrg={canManageOrg}
          governingBodyLogoUrl={orgRequest.org.governingBody?.logoUrl ?? null}
          governingBodyName={orgRequest.org.governingBody?.name ?? null}
          pages={pages}
          orgLogoUrl={orgLogoUrl}
          orgName={orgRequest.org.orgName}
          orgSlug={orgRequest.org.orgSlug}
        />
      ) : null}
=======
      <OrgHeader
        canEditPages={canEditPages}
        canManageOrg={canManageOrg}
        governingBodyLogoUrl={orgRequest.org.governingBody?.logoUrl ?? null}
        governingBodyName={orgRequest.org.governingBody?.name ?? null}
        pages={pages}
        orgLogoUrl={orgLogoUrl}
        orgName={orgRequest.org.orgName}
        orgSlug={orgRequest.org.orgSlug}
      />
>>>>>>> 48a50b4d5983e8e931ae7a2e751bc3703734f32b
      {children}
    </div>
  );
}
