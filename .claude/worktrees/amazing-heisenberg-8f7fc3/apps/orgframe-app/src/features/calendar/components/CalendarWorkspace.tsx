"use client";

import { FacilityCalendarWorkspace } from "@/src/features/calendar/components/FacilityCalendarWorkspace";
import { PublicCalendarWorkspace } from "@/src/features/calendar/components/PublicCalendarWorkspace";
import { TeamCalendarWorkspace } from "@/src/features/calendar/components/TeamCalendarWorkspace";
import type { CalendarPublicCatalogItem, CalendarReadModel } from "@/src/features/calendar/types";
import type { FacilityReservationReadModel } from "@/src/features/facilities/types";

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
  | TeamCalendarWorkspaceModeProps
  | FacilityCalendarWorkspaceModeProps
  | PublicCalendarWorkspaceModeProps;

export function CalendarWorkspace(props: CalendarWorkspaceProps) {
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
