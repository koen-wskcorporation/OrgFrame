import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";
import { ManagePageShell } from "@/src/features/core/layout/components/ManagePageShell";
import { ManageSection } from "@/src/features/core/layout/components/ManageSection";
import { AiDashboard } from "@/src/features/manage-dashboard/components/AiDashboard";

export const metadata: Metadata = {
  title: "Dashboard"
};

export default async function OrgManageDashboardPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const [orgContext, sessionUser] = await Promise.all([getOrgAuthContext(orgSlug), getSessionUser()]);
  if (!sessionUser) {
    return (
      <ManagePageShell title="Dashboard">
        <Alert variant="info">Sign in to view your dashboard.</Alert>
      </ManagePageShell>
    );
  }

  return (
    <ManagePageShell title="Dashboard" variant="workspace">
      <ManageSection title="Dashboard">
        <AiDashboard orgName={orgContext.orgName} orgSlug={orgContext.orgSlug} />
      </ManageSection>
    </ManagePageShell>
  );
}
