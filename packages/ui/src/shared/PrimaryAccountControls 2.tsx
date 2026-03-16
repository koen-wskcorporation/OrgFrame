"use client";

import { useEffect, useState } from "react";
import { signOutAction } from "@/app/auth/actions";
import { AuthDialogTrigger } from "@orgframe/ui/auth/AuthDialogTrigger";
import { AccountMenu } from "@orgframe/ui/shared/AccountMenu";

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
  const [state, setState] = useState<HeaderAccountState | null>(null);

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

  return <AuthDialogTrigger />;
}
