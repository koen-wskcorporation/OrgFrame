"use client";

import { FacilityCalendarWorkspace } from "@orgframe/ui/modules/calendar/components/FacilityCalendarWorkspace";
import { OrgCalendarWorkspace } from "@orgframe/ui/modules/calendar/components/OrgCalendarWorkspace";
import { PublicCalendarWorkspace } from "@orgframe/ui/modules/calendar/components/PublicCalendarWorkspace";
import { TeamCalendarWorkspace } from "@orgframe/ui/modules/calendar/components/TeamCalendarWorkspace";
import type { CalendarPublicCatalogItem, CalendarReadModel } from "@/modules/calendar/types";
import type { FacilityReservationReadModel } from "@/modules/facilities/types";

type OrgCalendarWorkspaceModeProps = {
  mode: "org";
  orgSlug: string;
  canWrite: boolean;
  initialReadModel: CalendarReadModel;
  initialFacilityReadModel?: FacilityReservationReadModel;
  activeTeams: Array<{ id: string; label: string }>;
};

type TeamCalendarWorkspaceModeProps = {
  mode: "team";
  orgSlug: string;
  teamId: string;
  teamLabel?: string;
  activeTeams?: Array<{ id: string; label: string }>;
  canWrite: boolean;
  initialReadModel: CalendarReadModel;
  initialFacilityReadModel?: FacilityReservationReadModel;
};

type FacilityCalendarWorkspaceModeProps = {
  mode: "facility";
  orgSlug: string;
  spaceId: string;
  spaceName: string;
  canWrite: boolean;
  initialReadModel: CalendarReadModel;
  initialFacilityReadModel?: FacilityReservationReadModel;
  activeTeams: Array<{ id: string; label: string }>;
};

type PublicCalendarWorkspaceModeProps = {
  mode: "public";
  orgSlug: string;
  items: CalendarPublicCatalogItem[];
  title?: string;
};

export type CalendarWorkspaceProps =
  | OrgCalendarWorkspaceModeProps
  | TeamCalendarWorkspaceModeProps
  | FacilityCalendarWorkspaceModeProps
  | PublicCalendarWorkspaceModeProps;

export function CalendarWorkspace(props: CalendarWorkspaceProps) {
  if (props.mode === "org") {
    return (
      <OrgCalendarWorkspace
        activeTeams={props.activeTeams}
        canWrite={props.canWrite}
        initialFacilityReadModel={props.initialFacilityReadModel}
        initialReadModel={props.initialReadModel}
        orgSlug={props.orgSlug}
      />
    );
  }

  if (props.mode === "team") {
    return (
      <TeamCalendarWorkspace
        activeTeams={props.activeTeams}
        canWrite={props.canWrite}
        initialFacilityReadModel={props.initialFacilityReadModel}
        initialReadModel={props.initialReadModel}
        orgSlug={props.orgSlug}
        teamId={props.teamId}
        teamLabel={props.teamLabel}
      />
    );
  }

  if (props.mode === "facility") {
    return (
      <FacilityCalendarWorkspace
        activeTeams={props.activeTeams}
        canWrite={props.canWrite}
        initialFacilityReadModel={props.initialFacilityReadModel}
        initialReadModel={props.initialReadModel}
        orgSlug={props.orgSlug}
        spaceId={props.spaceId}
        spaceName={props.spaceName}
      />
    );
  }

  return <PublicCalendarWorkspace items={props.items} orgSlug={props.orgSlug} title={props.title} />;
}
