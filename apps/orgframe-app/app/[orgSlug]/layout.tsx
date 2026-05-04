import type { Metadata } from "next";
import { AppShell } from "@/src/features/core/layout/components/AppShell";
import { BrandingCssVarsBridge } from "@/src/features/core/layout/components/BrandingCssVarsBridge";
import { OrgTopbar } from "@/src/features/core/layout/components/OrgTopbar";
import { OrgShareProvider } from "@/src/features/org-share/OrgShareProvider";
import { applyBrandingVars } from "@/src/shared/branding/applyBrandingVars";
import { getOrgRequestContext } from "@/src/shared/org/getOrgRequestContext";

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
  const brandingVars = applyBrandingVars({ accent: orgRequest.org.branding.accent });

  return (
    /*
     * `display: contents` on the wrapper omits the box from layout (no
     * padding, no flex/grid effect) while letting the brand `style=`
     * vars still cascade to descendants — prevents a flash of unbranded
     * paint before the BrandingCssVarsBridge runs on the client.
     *
     * The topbar is rendered directly here (not via a parallel-route
     * slot) so it can't suffer from slot-state bleed across navs.
     * Sidebars are owned by the route group that needs one — see
     * manage/layout.tsx + ManageShell.
     */
    <div className="contents" style={brandingVars}>
      <BrandingCssVarsBridge vars={brandingVars as Record<string, string>} />
      <OrgShareProvider orgSlug={orgRequest.org.orgSlug}>
        <AppShell topbar={<OrgTopbar orgSlug={orgSlug} />}>
          {children}
        </AppShell>
      </OrgShareProvider>
    </div>
  );
}
