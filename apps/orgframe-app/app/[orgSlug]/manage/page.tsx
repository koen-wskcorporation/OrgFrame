import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";
import { PageShell } from "@/src/features/core/layout/components/PageShell";
import { Section } from "@orgframe/ui/primitives/section";
import { ManageDashboardCanvas, type WidgetInitialData } from "@/src/features/manage-dashboard/components/ManageDashboardCanvas";
import { loadDashboardLayout } from "@/src/features/manage-dashboard/layout-storage";
import { widgetTypes, type WidgetType } from "@/src/features/manage-dashboard/types";
import { hasAnyPermission, widgetMetadata } from "@/src/features/manage-dashboard/widgets/metadata";
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

  const availableWidgetTypes: WidgetType[] = widgetTypes.filter((type) =>
    hasAnyPermission(orgContext.membershipPermissions, widgetMetadata[type].requiredAnyPermission)
  );

  return (
    <PageShell description="Overview of your organization's activity and quick links to management tools." title="Dashboard">
      <Section title="Dashboard">
        <ManageDashboardCanvas
          availableWidgetTypes={availableWidgetTypes}
          initialData={initialData}
          initialLayout={layout}
          orgSlug={orgContext.orgSlug}
        />
      </Section>
    </PageShell>
  );
}
