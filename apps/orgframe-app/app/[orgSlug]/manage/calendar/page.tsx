import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";
import { PageShell } from "@/src/features/core/layout/components/PageShell";
import { ManageSection } from "@/src/features/core/layout/components/ManageSection";
import { gateManageSection } from "@/src/features/core/layout/gateManageSection";
import { can } from "@/src/shared/permissions/can";
import { CalendarWorkspace } from "@/src/features/calendar/components/CalendarWorkspace";
import { getCalendarWorkspaceDataAction } from "@/src/features/calendar/actions";
import type { CalendarReadModel } from "@/src/features/calendar/types";
import type { FacilityReservationReadModel } from "@/src/features/facilities/types";
import { ToolUnavailablePanel } from "@/app/[orgSlug]/manage/ToolUnavailablePanel";

export const metadata: Metadata = {
  title: "Calendar"
};

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
  facilities: [],
  spaces: [],
  spaceStatuses: [],
  rules: [],
  reservations: [],
  exceptions: []
};

export default async function ManageCalendarPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { orgContext, unavailable } = await gateManageSection(orgSlug, {
    permission: ["calendar.read", "calendar.write", "programs.read", "programs.write"],
    tool: "calendar"
  });

  if (unavailable) {
    return (
      <PageShell
        description="Organization calendar for events, practices, games, and shared facility scheduling."
        title="Calendar"
      >
        <ToolUnavailablePanel title="Calendar" />
      </PageShell>
    );
  }

  const canWrite =
    can(orgContext.membershipPermissions, "calendar.write") ||
    can(orgContext.membershipPermissions, "programs.write") ||
    can(orgContext.membershipPermissions, "org.manage.read");

  const workspaceData = await getCalendarWorkspaceDataAction({ orgSlug });
  const readModel = workspaceData.ok ? workspaceData.data.readModel : emptyReadModel;
  const activeTeams = workspaceData.ok ? workspaceData.data.activeTeams : [];
  const facilityReadModel = workspaceData.ok ? workspaceData.data.facilityReadModel : emptyFacilityReadModel;

  return (
    <PageShell
      description="Organization calendar for events, practices, games, and shared facility scheduling."
      title="Calendar"
    >
      {!canWrite ? <Alert variant="info">You have read-only access to calendar data.</Alert> : null}
      {!workspaceData.ok ? <Alert variant="warning">Some calendar data could not be loaded. Showing available data only.</Alert> : null}
      <ManageSection contentClassName="min-h-0 overflow-hidden p-0" description="Events, practices, games, and shared facility scheduling." title="Schedule">
        <CalendarWorkspace
          canWrite={canWrite}
          context={{ kind: "manage", activeTeams }}
          initialFacilityReadModel={facilityReadModel}
          initialReadModel={readModel}
          orgSlug={orgSlug}
        />
      </ManageSection>
    </PageShell>
  );
}
