import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";
import { PageShell } from "@/src/features/core/layout/components/PageShell";
import { Section } from "@orgframe/ui/primitives/section";
import { AiDashboard } from "@/src/features/manage-dashboard/components/AiDashboard";

export const metadata: Metadata = {
  title: "Dashboard"
};

export default async function OrgManageDashboardPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const [orgContext, sessionUser] = await Promise.all([getOrgAuthContext(orgSlug), getSessionUser()]);
  if (!sessionUser) {
    return (
      <PageShell title="Dashboard">
        <Alert variant="info">Sign in to view your dashboard.</Alert>
      </PageShell>
    );
  }

  return (
    <PageShell description="Overview of your organization's activity and quick links to management tools." title="Dashboard">
      <Section title="Dashboard">
        <AiDashboard orgName={orgContext.orgName} orgSlug={orgContext.orgSlug} />
      </Section>
    </PageShell>
  );
}
