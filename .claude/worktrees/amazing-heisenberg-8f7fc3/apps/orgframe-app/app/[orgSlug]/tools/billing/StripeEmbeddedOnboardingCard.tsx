"use client";

import { useEffect, useRef, useState } from "react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { createOrgStripeEmbeddedAccountSessionAction } from "./actions";

type StripeConnectElement = HTMLElement & {
  setCollectionOptions?: (options: { fields: "currently_due" | "eventually_due"; futureRequirements?: "omit" | "include" }) => void;
  setOnExit?: (listener: (() => void) | undefined) => void;
  setOnStepChange?: (listener: ((input: { step: string }) => void) | undefined) => void;
};

export function StripeEmbeddedOnboardingCard({
  orgSlug,
  canManage
}: {
  orgSlug: string;
  canManage: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastStep, setLastStep] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let mountedElement: StripeConnectElement | null = null;

    async function mountEmbeddedOnboarding() {
      if (!canManage) {
        setStatus("error");
        setErrorMessage("You need management access to run onboarding.");
        return;
      }

      const publishableKey = (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "").trim();
      if (!publishableKey) {
        setStatus("error");
        setErrorMessage("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not configured.");
        return;
      }

      try {
        const { loadConnectAndInitialize } = await import("@stripe/connect-js/pure");

        const instance = loadConnectAndInitialize({
          publishableKey,
          fetchClientSecret: async () => {
            const result = await createOrgStripeEmbeddedAccountSessionAction({ orgSlug });
            if (!result.ok) {
              throw new Error(result.error);
            }
            return result.data.clientSecret;
          },
          appearance: {
            variables: {
              colorPrimary: "#0a0a0a",
              colorBackground: "#ffffff",
              colorText: "#111111",
              colorDanger: "#b91c1c",
              borderRadius: "10px"
            }
          }
        });

        if (!active || !containerRef.current) {
          return;
        }

        const onboarding = instance.create("account-onboarding") as StripeConnectElement;
        onboarding.setCollectionOptions?.({
          fields: "currently_due",
          futureRequirements: "include"
        });
        onboarding.setOnStepChange?.(({ step }) => {
          if (!active) {
            return;
          }
          setLastStep(step);
        });
        onboarding.setOnExit?.(() => {
          if (!active) {
            return;
          }
          setLastStep("exited");
        });

        containerRef.current.innerHTML = "";
        containerRef.current.appendChild(onboarding);
        mountedElement = onboarding;
        setStatus("ready");
        setErrorMessage(null);
      } catch (error) {
        if (!active) {
          return;
        }

        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "Unable to load embedded onboarding.");
      }
    }

    void mountEmbeddedOnboarding();

    return () => {
      active = false;
      if (mountedElement?.parentNode) {
        mountedElement.parentNode.removeChild(mountedElement);
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [canManage, orgSlug]);

  return (
    <div className="space-y-3">
      {status === "loading" ? <Alert variant="info">Loading embedded onboarding...</Alert> : null}
      {status === "error" ? <Alert variant="destructive">{errorMessage ?? "Unable to initialize embedded onboarding."}</Alert> : null}
      {lastStep ? <p className="text-xs text-text-muted">Latest onboarding step: {lastStep}</p> : null}

      <div className="min-h-24" ref={containerRef} />
    </div>
  );
}
