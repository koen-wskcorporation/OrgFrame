import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageStack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { isOrgFeatureEnabled } from "@/lib/org/features";
import { orgWorkspaceSettingsSectionPath } from "@/lib/org/routes";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { can } from "@/lib/permissions/can";
import { OrgCalendarWorkspace } from "@/modules/calendar/components/OrgCalendarWorkspace";
import { listCalendarReadModel, listOrgActiveTeams } from "@/modules/calendar/db/queries";

export const metadata: Metadata = {
  title: "Calendar"
};

export default async function OrgToolsCalendarPage({
  params
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const orgContext = await getOrgAuthContext(orgSlug);
  const canRead =
    can(orgContext.membershipPermissions, "calendar.read") ||
    can(orgContext.membershipPermissions, "calendar.write") ||
    can(orgContext.membershipPermissions, "programs.read") ||
    can(orgContext.membershipPermissions, "programs.write");
  const canWrite =
    can(orgContext.membershipPermissions, "calendar.write") ||
    can(orgContext.membershipPermissions, "programs.write") ||
    can(orgContext.membershipPermissions, "org.manage.read");

  if (!canRead) {
    redirect("/forbidden");
  }

  if (!isOrgFeatureEnabled(orgContext.features, "calendar")) {
    return (
      <PageStack>
        <PageHeader description="Unified organization calendar for events, practices, games, and shared facility scheduling." showBorder={false} title="Calendar" />
        <Alert variant="warning">Events and calendar is currently disabled for this org.</Alert>
        <div>
          <Button href={orgWorkspaceSettingsSectionPath(orgSlug, "features")} variant="secondary">
            Open feature settings
          </Button>
        </div>
      </PageStack>
    );
  }

  const [readModel, activeTeams] = await Promise.all([listCalendarReadModel(orgContext.orgId), listOrgActiveTeams(orgContext.orgId)]);

  return (
    <PageStack>
      <PageHeader description="Unified organization calendar for events, practices, games, and shared facility scheduling." showBorder={false} title="Calendar" />
      {!canWrite ? <Alert variant="info">You have read-only access to calendar data.</Alert> : null}
      <OrgCalendarWorkspace activeTeams={activeTeams} canWrite={canWrite} initialReadModel={readModel} orgSlug={orgContext.orgSlug} />
    </PageStack>
  );
}
