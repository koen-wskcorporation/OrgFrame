import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert } from "@orgframe/ui/ui/alert";
import { PageStack } from "@orgframe/ui/ui/layout";
import { PageHeader } from "@orgframe/ui/ui/page-header";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { can } from "@/lib/permissions/can";
import { OrgCalendarWorkspace } from "@orgframe/ui/modules/calendar/components/OrgCalendarWorkspace";
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

  const [readModel, activeTeams] = await Promise.all([listCalendarReadModel(orgContext.orgId), listOrgActiveTeams(orgContext.orgId)]);

  return (
    <PageStack className="app-page-stack--fill">
      <PageHeader description="Unified organization calendar for events, practices, games, and shared facility scheduling." showBorder={false} title="Calendar" />
      {!canWrite ? <Alert variant="info">You have read-only access to calendar data.</Alert> : null}
      <div className="min-h-0 flex-1">
        <OrgCalendarWorkspace activeTeams={activeTeams} canWrite={canWrite} initialReadModel={readModel} orgSlug={orgContext.orgSlug} />
      </div>
    </PageStack>
  );
}
