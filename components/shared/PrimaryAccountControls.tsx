"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/auth/actions";
import { AccountMenu } from "@/components/shared/AccountMenu";
import { Button } from "@/components/ui/button";

type HeaderAccountState =
  | {
      authenticated: false;
    }
  | {
      authenticated: true;
      user: {
        userId: string;
        email: string | null;
        firstName: string | null;
        lastName: string | null;
        avatarUrl: string | null;
      };
      organizations: {
        orgId: string;
        orgName: string;
        orgSlug: string;
        iconUrl: string | null;
      }[];
    };

export function PrimaryAccountControls() {
  const pathname = usePathname();
  const [state, setState] = useState<HeaderAccountState | null>(null);
  const nextPath = pathname && pathname !== "/website" && !pathname.startsWith("/auth") ? pathname : "/";
  const signInHref = nextPath === "/" ? "/auth/login" : `/auth/login?next=${encodeURIComponent(nextPath)}`;
  const signUpHref = nextPath === "/" ? "/auth/login?mode=signup" : `/auth/login?mode=signup&next=${encodeURIComponent(nextPath)}`;

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
          setState({
            authenticated: false
          });
          return;
        }

        const payload = (await response.json()) as HeaderAccountState;
        setState(payload);
      } catch {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          authenticated: false
        });
      }
    })();

    return () => {
      controller.abort();
    };
  }, []);

  if (state?.authenticated) {
    return (
      <AccountMenu
        avatarUrl={state.user.avatarUrl}
        email={state.user.email}
        firstName={state.user.firstName}
        lastName={state.user.lastName}
        organizations={state.organizations}
        signOutAction={signOutAction}
      />
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button href={signInHref} size="sm" variant="secondary">
        Sign in
      </Button>
      <Button className="hidden sm:inline-flex" href={signUpHref} size="sm" variant="ghost">
        Create account
      </Button>
    </div>
  );
}
