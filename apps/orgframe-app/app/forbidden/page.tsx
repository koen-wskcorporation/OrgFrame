import Link from "next/link";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { Button } from "@orgframe/ui/primitives/button";
import { AuthDialogTrigger } from "@/src/features/core/auth/components/AuthDialogTrigger";
import { AppPage } from "@orgframe/ui/primitives/layout";
import { CenteredStateCard } from "@orgframe/ui/primitives/state";
import { getTenantBaseHosts, normalizeHost, resolveOrgSubdomain } from "@/src/shared/domains/customDomains";

export const metadata: Metadata = {
  title: "Access Forbidden"
};

export default async function ForbiddenPage() {
  const headerStore = await headers();
  const forwardedHost = headerStore.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = normalizeHost(forwardedHost || headerStore.get("host"));
  const orgSubdomain = resolveOrgSubdomain(host, getTenantBaseHosts());
  const forwardedProto = headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const protocol =
    forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : process.env.NODE_ENV === "production" ? "https" : "http";
  const dashboardHref = orgSubdomain ? `${protocol}://${orgSubdomain.baseHost}/` : "/";

  return (
    <AppPage className="flex min-h-[60vh] items-center py-10">
      <CenteredStateCard
        actions={
          <>
            <Link href={dashboardHref}>
              <Button>Back to Dashboard</Button>
            </Link>
            <AuthDialogTrigger label="Sign in as Different Account" size="md" variant="ghost" />
          </>
        }
        description="You do not have permission to access this page or action."
        title="Access Forbidden"
      />
    </AppPage>
  );
}
