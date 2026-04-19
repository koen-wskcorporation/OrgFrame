import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert } from "@orgframe/ui/primitives/alert";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { ManageCalendarSection } from "@/app/[orgSlug]/manage/calendar/ManageCalendarSection";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { can } from "@/src/shared/permissions/can";
import { isOrgToolEnabled } from "@/src/features/core/config/tools";
import { getCalendarWorkspaceDataAction } from "@/src/features/calendar/actions";
import type { CalendarReadModel } from "@/src/features/calendar/types";
import type { FacilityReservationReadModel } from "@/src/features/facilities/types";
import { ToolUnavailablePanel } from "@/app/[orgSlug]/manage/ToolUnavailablePanel";

export const metadata: Metadata = {
  title: "Calendar"
};

export default async function ManageCalendarPage({
  params
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const orgContext = await getOrgAuthContext(orgSlug);
  if (!isOrgToolEnabled(orgContext.toolAvailability, "calendar")) {
    return (
      <PageStack className="app-page-stack--fill min-h-0 h-[calc(100dvh-var(--org-header-height,0px)-var(--layout-gap))]">
        <PageHeader description="Organization calendar for events, practices, games, and shared facility scheduling." showBorder={false} title="Calendar" />
        <ToolUnavailablePanel title="Calendar" />
      </PageStack>
    );
  }
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
    redirect("/forbidden?reason=calendar-read-guard");
  }

  const emptyReadModel: CalendarReadModel = {
    sources: [],
    entries: [],
    rules: [],
    occurrences: [],
    exceptions: [],
    configurations: [],
    allocations: [],
    ruleAllocations: [],
    invites: []
  };
  const emptyFacilityReadModel: FacilityReservationReadModel = {
    spaces: [],
    rules: [],
    reservations: [],
    exceptions: []
  };

  const workspaceData = await getCalendarWorkspaceDataAction({ orgSlug: orgContext.orgSlug });
  const readModel = workspaceData.ok ? workspaceData.data.readModel : emptyReadModel;
  const activeTeams = workspaceData.ok ? workspaceData.data.activeTeams : [];
  const facilityReadModel = workspaceData.ok ? workspaceData.data.facilityReadModel : emptyFacilityReadModel;

  return (
    <PageStack className="app-page-stack--fill min-h-0 h-[calc(100dvh-var(--org-header-height,0px)-var(--layout-gap))]">
      <PageHeader description="Organization calendar for events, practices, games, and shared facility scheduling." showBorder={false} title="Calendar" />
      {!canWrite ? <Alert variant="info">You have read-only access to calendar data.</Alert> : null}
      {!workspaceData.ok ? <Alert variant="warning">Some calendar data could not be loaded. Showing available data only.</Alert> : null}
      <section aria-label="Editable calendar" className="min-h-0 flex-1 overflow-hidden">
        <ManageCalendarSection
          activeTeams={activeTeams}
          canWrite={canWrite}
          initialFacilityReadModel={facilityReadModel}
          initialReadModel={readModel}
          orgSlug={orgContext.orgSlug}
        />
      </section>
    </PageStack>
  );
}
