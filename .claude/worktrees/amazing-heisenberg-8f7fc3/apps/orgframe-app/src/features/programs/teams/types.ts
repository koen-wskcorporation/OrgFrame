import type { PlayerPickerItem } from "@/src/features/players/types";
import type { ProgramTeam, ProgramTeamMember, ProgramTeamStaff } from "@/src/features/programs/types";

export type ProgramTeamMemberDetail = ProgramTeamMember & {
  player: PlayerPickerItem & {
    dateOfBirth: string | null;
  };
};

export type ProgramTeamStaffDetail = ProgramTeamStaff & {
  email: string | null;
};

export type ProgramTeamRosterCandidate = {
  playerId: string;
  registrationId: string | null;
  label: string;
  subtitle: string | null;
  registrationStatus: string;
};

export type ProgramTeamStaffCandidate = {
  userId: string;
  email: string | null;
  role: string;
};

export type ProgramTeamFacilityOption = {
  id: string;
  name: string;
  status: string;
};

export type ProgramTeamDetail = {
  team: ProgramTeam;
  node: {
    id: string;
    name: string;
    slug: string;
    parentId: string | null;
  };
  roster: ProgramTeamMemberDetail[];
  staff: ProgramTeamStaffDetail[];
  rosterCandidates: ProgramTeamRosterCandidate[];
  staffCandidates: ProgramTeamStaffCandidate[];
  facilities: ProgramTeamFacilityOption[];
  calendarVisibility: {
    effective: "team_members" | "program_members" | "org_members";
    teamSetting: "team_members" | "program_members" | "org_members" | null;
    divisionDefault: "team_members" | "program_members" | "org_members" | null;
    programDefault: "team_members" | "program_members" | "org_members" | null;
    forcedValue: "team_members" | "program_members" | "org_members" | null;
    forcedBy: "division" | "program" | null;
    teamSettingLocked: boolean;
  };
};
