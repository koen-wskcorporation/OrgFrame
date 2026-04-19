"use client";

import { useEffect, useState } from "react";
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
  const [state, setState] = useState<HeaderAccountState | null>(initialState);
  const pathname = usePathname();
  const normalizedTenantBaseOrigin = tenantBaseOrigin ? tenantBaseOrigin.replace(/\/+$/, "") : null;
  const authNextPath = buildAuthNextPath(pathname, currentOrgSlug);
  const authHref = normalizedTenantBaseOrigin
    ? `${normalizedTenantBaseOrigin}/auth?next=${encodeURIComponent(authNextPath)}`
    : authNextPath
      ? `/auth?next=${encodeURIComponent(authNextPath)}`
      : "/auth";

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch("/api/account/session", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal
        });

        if (!response.ok) {
          setState((previous) => previous ?? { authenticated: false });
          return;
        }

        const payload = (await response.json()) as HeaderAccountState;
        setState(payload);
      } catch {
        if (controller.signal.aborted) {
          return;
        }

        setState((previous) => previous ?? { authenticated: false });
      }
    })();

    return () => {
      controller.abort();
    };
  }, [pathname]);

  if (state?.authenticated) {
    return (
      <AccountMenu
        avatarUrl={state.user.avatarUrl}
        currentOrgSlug={currentOrgSlug}
        email={state.user.email}
        firstName={state.user.firstName}
        homeHref={homeHref}
        lastName={state.user.lastName}
        organizations={state.organizations}
        signOutAction={signOutAction}
        tenantBaseOrigin={tenantBaseOrigin}
      />
    );
  }

  return <AuthDialogTrigger authHref={authHref} />;
}
