import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { DashboardSection, DashboardShell } from "@orgframe/ui/dashboard/DashboardShell";
import { EmptyState } from "@orgframe/ui/dashboard/EmptyState";
import { OrgCard } from "@orgframe/ui/dashboard/OrgCard";
import { Button } from "@orgframe/ui/ui/button";
import { CardGrid } from "@orgframe/ui/ui/layout";
import { SubmitButton } from "@orgframe/ui/ui/submit-button";
import { signOutAction } from "@/app/auth/actions";
import { getDashboardContext } from "@/lib/dashboard/getDashboardContext";
import { getSessionUser } from "@/lib/auth/getSessionUser";
import { getTenantBaseHosts, normalizeHost, resolveOrgSubdomain } from "@/lib/domains/customDomains";
import { AiAssistantLauncher } from "@orgframe/ui/modules/ai/components/AiAssistantLauncher";

export const metadata: Metadata = {
  title: "Dashboard"
};

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/x/web");
  }

  const { organizations } = await getDashboardContext();
  const headerStore = await headers();
  const forwardedHost = headerStore.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = normalizeHost(forwardedHost || headerStore.get("host"));
  const tenantBaseHosts = getTenantBaseHosts();
  const orgSubdomain = resolveOrgSubdomain(host, tenantBaseHosts);
  const tenantBaseHost = orgSubdomain?.baseHost ?? (tenantBaseHosts.has(host) ? host : null);
  const forwardedProto = headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const protocol =
    forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : process.env.NODE_ENV === "production" ? "https" : "http";

  return (
    <DashboardShell
      actions={
        <>
          <Button href="/account" size="sm" variant="secondary">
            Account
          </Button>
          <form action={signOutAction}>
            <SubmitButton size="sm" variant="ghost">
              Sign out
            </SubmitButton>
          </form>
        </>
      }
      subtitle="Your sports in one place."
      title="Dashboard"
    >
      <DashboardSection description="Open an organization to view its public site and manage core settings." title="Organizations">
        {organizations.length === 0 ? (
          <EmptyState />
        ) : (
          <CardGrid className="sm:grid-cols-2 xl:grid-cols-3">
            {organizations.map((organization) => (
              <OrgCard
                href={tenantBaseHost ? `${protocol}://${organization.orgSlug}.${tenantBaseHost}/` : `/${organization.orgSlug}`}
                iconUrl={organization.iconUrl}
                key={organization.orgId}
                orgName={organization.orgName}
                orgSlug={organization.orgSlug}
              />
            ))}
          </CardGrid>
        )}
      </DashboardSection>
    </DashboardShell>
  );
}
