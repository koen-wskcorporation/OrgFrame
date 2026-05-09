import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";
import { PageShell } from "@/src/features/core/layout/components/PageShell";
import { ManageDashboardClient, type WidgetInitialData } from "@/src/features/manage-dashboard/components/ManageDashboardClient";
import { loadDashboardLayout } from "@/src/features/manage-dashboard/layout-storage";
import { loadWidgetData } from "@/src/features/manage-dashboard/widgets/server-loaders";

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

  const layout = await loadDashboardLayout({ userId: sessionUser.id, orgId: orgContext.orgId });

  const initialDataEntries = await Promise.all(
    layout.widgets.map(async (widget) => {
      const data = await loadWidgetData(widget.type, {
        orgId: orgContext.orgId,
        orgSlug: orgContext.orgSlug,
        permissions: orgContext.membershipPermissions,
        settings: widget.settings
      });
      return [widget.id, data] as const;
    })
  );
  const initialData: Record<string, WidgetInitialData> = Object.fromEntries(initialDataEntries);

  return (
    <ManageDashboardClient
      initialData={initialData}
      initialLayout={layout}
      orgSlug={orgContext.orgSlug}
    />
  );
}
