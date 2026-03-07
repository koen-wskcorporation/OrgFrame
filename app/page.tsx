import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { CreateOrganizationDialog } from "@/components/dashboard/CreateOrganizationDialog";
import { DashboardSection, DashboardShell } from "@/components/dashboard/DashboardShell";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { OrgCard } from "@/components/dashboard/OrgCard";
import { Button } from "@/components/ui/button";
import { CardGrid } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { signOutAction } from "@/app/auth/actions";
import { getSessionUser } from "@/lib/auth/getSessionUser";
import { getDashboardContext } from "@/lib/dashboard/getDashboardContext";

export const metadata: Metadata = {
  title: "Dashboard"
};

export default async function HomePage() {
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    redirect("/website");
  }

  const { organizations } = await getDashboardContext();

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
      <DashboardSection
        actions={<CreateOrganizationDialog />}
        description="Open an organization to view its public site and manage core settings."
        title="Organizations"
      >
        {organizations.length === 0 ? (
          <EmptyState />
        ) : (
          <CardGrid className="sm:grid-cols-2 xl:grid-cols-3">
            {organizations.map((organization) => (
              <OrgCard
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
