import type { Metadata } from "next";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";
import { AiDashboard } from "@/src/features/manage-dashboard/components/AiDashboard";

export const metadata: Metadata = {
  title: "Dashboard"
};

export default async function OrgManageDashboardPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const [orgContext, sessionUser] = await Promise.all([getOrgAuthContext(orgSlug), getSessionUser()]);
  if (!sessionUser) {
    return (
      <PageStack>
        <p className="text-sm text-text-muted">Sign in to view your dashboard.</p>
      </PageStack>
    );
  }

  return (
    <PageStack>
      <AiDashboard orgName={orgContext.orgName} orgSlug={orgContext.orgSlug} />
    </PageStack>
  );
}
