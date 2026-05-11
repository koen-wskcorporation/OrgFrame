import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { AppFooter } from "@/src/features/core/layout/components/AppFooter";
import { AppHeader } from "@/src/features/core/layout/components/AppHeader";
import { ConfirmDialogProvider } from "@orgframe/ui/primitives/confirm-dialog";
import { PanelContainer } from "@orgframe/ui/primitives/panel";
import { ThemeModeProvider } from "@orgframe/ui/primitives/theme-mode";
import { ToastProvider } from "@orgframe/ui/primitives/toast";
import { shouldShowBranchHeaders } from "@/src/shared/env/branchVisibility";
import { getTenantBaseHosts, resolveOrgSubdomain } from "@/src/shared/domains/customDomains";
import { getOrgAssetPublicUrl } from "@/src/shared/branding/getOrgAssetPublicUrl";
import { listUserOrgs } from "@/src/shared/org/listUserOrgs";
import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";
import { getCurrentUser } from "@/src/features/core/account/server/getCurrentUser";
import { listProfilesForAccount } from "@/src/features/people/db/queries";
import { FileManagerProvider } from "@/src/features/files/manager";
import { UploadProvider } from "@/src/features/files/uploads";
import { OrderPanelProvider } from "@/src/features/orders";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { parseHostWithPort } from "@/src/shared/domains/hostHeaders";
import type { HeaderAccountState } from "@/src/features/core/layout/types";

export const metadata: Metadata = {
  title: {
    default: "OrgFrame",
    template: "%s | OrgFrame"
  },
  description: "Multi-tenant sports operations suite"
};

async function getHeaderRoutingContext() {
  const headerStore = await headers();
  const hostHeader = headerStore.get("host") || headerStore.get("x-forwarded-host");
  const parsedHost = parseHostWithPort(hostHeader);
  const host = parsedHost.host;
  const hostWithPort = parsedHost.hostWithPort || host;
  const tenantBaseHosts = getTenantBaseHosts();
  const orgSubdomain = resolveOrgSubdomain(host, tenantBaseHosts);

  const forwardedProto = headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const protocol =
    forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : process.env.NODE_ENV === "production" ? "https" : "http";

  if (orgSubdomain) {
    const baseHostWithPort = parsedHost.port ? `${orgSubdomain.baseHost}:${parsedHost.port}` : orgSubdomain.baseHost;
    const tenantBaseOrigin = `${protocol}://${baseHostWithPort}`;
    return {
      currentOrgSlug: orgSubdomain.orgSlug,
      homeHref: `${tenantBaseOrigin}/`,
      tenantBaseOrigin
    };
  }

  if (tenantBaseHosts.has(host)) {
    return {
      currentOrgSlug: null,
      homeHref: "/",
      tenantBaseOrigin: `${protocol}://${hostWithPort}`
    };
  }

  return {
    currentOrgSlug: null,
    homeHref: "/",
    tenantBaseOrigin: null
  };
}

async function isAuthRouteRequest() {
  const headerStore = await headers();
  const pathname = headerStore.get("x-pathname") ?? "";
  return pathname === "/auth" || pathname.startsWith("/auth/");
}

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const onAuthRoute = await isAuthRouteRequest();
  const showHeaders = shouldShowBranchHeaders() && !onAuthRoute;
  const headerRouting = showHeaders ? await getHeaderRoutingContext() : { currentOrgSlug: null, homeHref: "/", tenantBaseOrigin: null };
  const memberships = showHeaders ? await listUserOrgs().catch(() => []) : [];
  const sessionUser = showHeaders ? await getSessionUser().catch(() => null) : null;
  const currentUser = showHeaders && sessionUser ? await getCurrentUser({ sessionUser }).catch(() => null) : null;
  const profileRecords = showHeaders && sessionUser ? await listProfilesForAccount(sessionUser.id).catch(() => []) : [];
  const accountProfiles = profileRecords
    .map(({ profile, links }) => {
      const primaryLink = links[0];
      if (!primaryLink) return null;
      return {
        id: profile.id,
        displayName: profile.displayName,
        relationshipType: primaryLink.relationshipType
      };
    })
    .filter((profile): profile is { id: string; displayName: string; relationshipType: "self" | "guardian" | "delegated_manager" } => Boolean(profile));
  const orgOptions = memberships.map((membership) => ({
    orgSlug: membership.orgSlug,
    orgName: membership.orgName,
    orgLogoUrl: getOrgAssetPublicUrl(membership.logoPath),
    orgIconUrl: getOrgAssetPublicUrl(membership.iconPath)
  }));
  const initialAccountState: HeaderAccountState | null = showHeaders
    ? sessionUser
      ? {
          authenticated: true,
          user: {
            userId: sessionUser.id,
            email: currentUser?.email ?? sessionUser.email,
            firstName: currentUser?.firstName ?? null,
            lastName: currentUser?.lastName ?? null,
            avatarUrl: currentUser?.avatarUrl ?? null
          },
          organizations: memberships.map((membership) => ({
            orgId: membership.orgId,
            orgName: membership.orgName,
            orgSlug: membership.orgSlug,
            iconUrl: getOrgAssetPublicUrl(membership.iconPath ?? membership.logoPath)
          })),
          profiles: accountProfiles
        }
      : {
          authenticated: false
        }
    : null;
  return (
    <html lang="en">
      <body className="bg-canvas text-text antialiased">
        <ThemeModeProvider>
          <ToastProvider>
            <ConfirmDialogProvider>
              <OrderPanelProvider>
                <FileManagerProvider prefetchOrgSlug={headerRouting.currentOrgSlug}>
                  <UploadProvider>
                    {showHeaders ? (
                      <AppHeader
                        currentOrgSlug={headerRouting.currentOrgSlug}
                        homeHref={headerRouting.homeHref}
                        initialAccountState={initialAccountState}
                        orgOptions={orgOptions}
                        tenantBaseOrigin={headerRouting.tenantBaseOrigin}
                      />
                    ) : null}
                    {children}
                    <PanelContainer />
                  </UploadProvider>
                </FileManagerProvider>
              </OrderPanelProvider>
            </ConfirmDialogProvider>
          </ToastProvider>
        </ThemeModeProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
