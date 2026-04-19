"use client";

import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/auth/actions";
import { AuthDialogTrigger } from "@/src/features/core/auth/components/AuthDialogTrigger";
import { AccountMenu } from "@/src/features/core/layout/components/AccountMenu";
import type { HeaderAccountState } from "@/src/features/core/layout/types";

type PrimaryAccountControlsProps = {
  currentOrgSlug?: string | null;
  homeHref?: string;
  tenantBaseOrigin?: string | null;
  initialState?: HeaderAccountState | null;
};

const PLATFORM_ROOT_SEGMENTS = new Set(["account", "api", "auth", "brand", "forbidden", "x"]);

function buildAuthNextPath(pathname: string | null, currentOrgSlug: string | null) {
  const safePath = pathname && pathname.startsWith("/") ? pathname : "/";

  if (!currentOrgSlug) {
    return safePath;
  }

  if (safePath === "/") {
    return `/${currentOrgSlug}`;
  }

  const [firstSegment] = safePath.replace(/^\/+/, "").split("/");
  if (firstSegment === currentOrgSlug || (firstSegment && PLATFORM_ROOT_SEGMENTS.has(firstSegment))) {
    return safePath;
  }

  return `/${currentOrgSlug}${safePath}`;
}

export function PrimaryAccountControls({ currentOrgSlug = null, homeHref = "/", tenantBaseOrigin = null, initialState = null }: PrimaryAccountControlsProps) {
  const pathname = usePathname();
  const normalizedTenantBaseOrigin = tenantBaseOrigin ? tenantBaseOrigin.replace(/\/+$/, "") : null;
  const authNextPath = buildAuthNextPath(pathname, currentOrgSlug);
  const authHref = normalizedTenantBaseOrigin
    ? `${normalizedTenantBaseOrigin}/auth?next=${encodeURIComponent(authNextPath)}`
    : authNextPath
      ? `/auth?next=${encodeURIComponent(authNextPath)}`
      : "/auth";

  if (initialState?.authenticated) {
    return (
      <AccountMenu
        avatarUrl={initialState.user.avatarUrl}
        email={initialState.user.email}
        firstName={initialState.user.firstName}
        homeHref={homeHref}
        lastName={initialState.user.lastName}
        profiles={initialState.profiles}
        signOutAction={signOutAction}
        tenantBaseOrigin={tenantBaseOrigin}
      />
    );
  }

  return <AuthDialogTrigger authHref={authHref} />;
}
