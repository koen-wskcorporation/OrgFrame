"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { can } from "@/src/shared/permissions/can";
import { requireOrgPermission } from "@/src/shared/permissions/requireOrgPermission";
import { rethrowIfNavigationError } from "@/src/shared/navigation/rethrowIfNavigationError";
import { createSupabaseServer } from "@/src/shared/data-api/server";
import {
  getProgramTeamDetail,
  getTeamAssociationCountsByNode,
  insertTeamMember,
  listProgramTeamsSummary,
  listTeamFacilityOptions,
  listTeamRosterCandidates,
  listTeamStaffCandidates,
  removeTeamMember,
  removeTeamStaff,
  upsertTeamProfile,
  upsertTeamStaff,
  updateTeamMember
} from "@/src/features/programs/teams/db/queries";
import type { ProgramTeamMember, ProgramTeamStaff, ProgramTeamSummary } from "@/src/features/programs/types";
import type { ProgramTeamDetail } from "@/src/features/programs/teams/types";

const textSchema = z.string().trim();

export type TeamsActionResult<TData = undefined> =
  | {
      ok: true;
      data: TData;
    }
  | {
      ok: false;
      error: string;
    };

function asError(error: string): TeamsActionResult<never> {
  return {
    ok: false,
    error
  };
}

async function requireProgramsReadOrWrite(orgSlug: string) {
  const orgContext = await getOrgAuthContext(orgSlug);
  const hasAccess = can(orgContext.membershipPermissions, "programs.read") || can(orgContext.membershipPermissions, "programs.write");

  if (!hasAccess) {
    throw new Error("FORBIDDEN");
  }

  return orgContext;
}

async function getTeamCore(teamId: string): Promise<{ id: string; orgId: string; programId: string; programNodeId: string } | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("programs").from("program_teams")
    .select("id, org_id, program_id, program_node_id")
    .eq("id", teamId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    orgId: data.org_id,
    programId: data.program_id,
    programNodeId: data.program_node_id
  };
}

export async function getProgramTeamsOverviewAction(input: { orgSlug: string; programId: string }): Promise<TeamsActionResult<{ teamSummaries: ProgramTeamSummary[] }>> {
  try {
    await requireProgramsReadOrWrite(input.orgSlug);
    const teamSummaries = await listProgramTeamsSummary(input.programId);

    return {
      ok: true,
      data: {
        teamSummaries
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to load teams right now.");
  }
}

export async function getTeamDetailAction(input: { orgSlug: string; teamId: string }): Promise<TeamsActionResult<ProgramTeamDetail>> {
  try {
    const org = await requireProgramsReadOrWrite(input.orgSlug);
    const detail = await getProgramTeamDetail(input.teamId);

    if (!detail || detail.team.orgId !== org.orgId) {
      return asError("Team not found.");
    }

    const canWrite = can(org.membershipPermissions, "programs.write");
    const canReadFacilities = can(org.membershipPermissions, "facilities.read") || can(org.membershipPermissions, "facilities.write");

    if (canWrite) {
      const [rosterCandidates, staffCandidates, facilities] = await Promise.all([
        listTeamRosterCandidates(detail.team.programId).catch(() => []),
        listTeamStaffCandidates(detail.team.orgId).catch(() => []),
        canReadFacilities ? listTeamFacilityOptions(detail.team.orgId).catch(() => []) : Promise.resolve([])
      ]);

      return {
        ok: true,
        data: {
          ...detail,
          rosterCandidates,
          staffCandidates,
          facilities
        }
      };
    }

    return {
      ok: true,
      data: {
        ...detail,
        rosterCandidates: [],
        staffCandidates: [],
        facilities: []
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to load this team right now.");
  }
}

export async function updateTeamProfileAction(input: {
  orgSlug: string;
  teamId: string;
  status: string;
  teamCode?: string | null;
  levelLabel?: string | null;
  ageGroup?: string | null;
  gender?: string | null;
  colorPrimary?: string | null;
  colorSecondary?: string | null;
  homeFacilityId?: string | null;
  notes?: string | null;
  calendarTeamVisibility?: "team_members" | "program_members" | "org_members" | null;
}): Promise<TeamsActionResult<{ team: ProgramTeamDetail["team"] }>> {
  const parsed = z
    .object({
      orgSlug: textSchema.min(1),
      teamId: z.string().uuid(),
      status: z.enum(["active", "archived"]),
      teamCode: textSchema.max(80).optional().nullable(),
      levelLabel: textSchema.max(120).optional().nullable(),
      ageGroup: textSchema.max(80).optional().nullable(),
      gender: textSchema.max(60).optional().nullable(),
      colorPrimary: textSchema.max(40).optional().nullable(),
      colorSecondary: textSchema.max(40).optional().nullable(),
      homeFacilityId: z.string().uuid().optional().nullable(),
      notes: textSchema.max(2000).optional().nullable(),
      calendarTeamVisibility: z.enum(["team_members", "program_members", "org_members"]).optional().nullable()
    })
    .safeParse(input);

  if (!parsed.success) {
    return asError("Please review the team settings.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "programs.write");
    const team = await upsertTeamProfile({
      teamId: payload.teamId,
      status: payload.status,
      teamCode: payload.teamCode ?? null,
      levelLabel: payload.levelLabel ?? null,
      ageGroup: payload.ageGroup ?? null,
      gender: payload.gender ?? null,
      colorPrimary: payload.colorPrimary ?? null,
      colorSecondary: payload.colorSecondary ?? null,
      homeFacilityId: payload.homeFacilityId ?? null,
      notes: payload.notes ?? null,
      calendarTeamVisibility: payload.calendarTeamVisibility ?? null
    });

    revalidatePath(`/${org.orgSlug}/tools/programs/${team.programId}/structure`);
    revalidatePath(`/${org.orgSlug}/tools/programs/${team.programId}/teams`);

    return {
      ok: true,
      data: {
        team
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to save team settings right now.");
  }
}

export async function addTeamMemberAction(input: {
  orgSlug: string;
  teamId: string;
  playerId: string;
  registrationId?: string | null;
  status: ProgramTeamMember["status"];
  role: ProgramTeamMember["role"];
  jerseyNumber?: string | null;
  position?: string | null;
  notes?: string | null;
}): Promise<TeamsActionResult<{ member: ProgramTeamMember }>> {
  const parsed = z
    .object({
      orgSlug: textSchema.min(1),
      teamId: z.string().uuid(),
      playerId: z.string().uuid(),
      registrationId: z.string().uuid().optional().nullable(),
      status: z.enum(["active", "pending", "waitlisted", "removed"]),
      role: z.enum(["player", "alternate", "guest"]),
      jerseyNumber: textSchema.max(20).optional().nullable(),
      position: textSchema.max(60).optional().nullable(),
      notes: textSchema.max(800).optional().nullable()
    })
    .safeParse(input);

  if (!parsed.success) {
    return asError("Please review the roster entry.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "programs.write");
    const team = await getTeamCore(payload.teamId);

    if (!team || team.orgId !== org.orgId) {
      return asError("Team not found.");
    }

    const member = await insertTeamMember({
      teamId: payload.teamId,
      orgId: org.orgId,
      programId: team.programId,
      playerId: payload.playerId,
      registrationId: payload.registrationId ?? null,
      status: payload.status,
      role: payload.role,
      jerseyNumber: payload.jerseyNumber ?? null,
      position: payload.position ?? null,
      notes: payload.notes ?? null,
      assignedByUserId: org.userId
    });

    revalidatePath(`/${org.orgSlug}/tools/programs/${team.programId}/structure`);
    revalidatePath(`/${org.orgSlug}/tools/programs/${team.programId}/teams`);

    return {
      ok: true,
      data: {
        member
      }
    };
  } catch (error: any) {
    rethrowIfNavigationError(error);
    if (error?.code === "23505") {
      return asError("This player is already assigned to a team in this program.");
    }
    return asError("Unable to add this player right now.");
  }
}

export async function updateTeamMemberAction(input: {
  orgSlug: string;
  memberId: string;
  status: ProgramTeamMember["status"];
  role: ProgramTeamMember["role"];
  jerseyNumber?: string | null;
  position?: string | null;
  notes?: string | null;
}): Promise<TeamsActionResult<{ member: ProgramTeamMember }>> {
  const parsed = z
    .object({
      orgSlug: textSchema.min(1),
      memberId: z.string().uuid(),
      status: z.enum(["active", "pending", "waitlisted", "removed"]),
      role: z.enum(["player", "alternate", "guest"]),
      jerseyNumber: textSchema.max(20).optional().nullable(),
      position: textSchema.max(60).optional().nullable(),
      notes: textSchema.max(800).optional().nullable()
    })
    .safeParse(input);

  if (!parsed.success) {
    return asError("Please review the roster changes.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "programs.write");
    const member = await updateTeamMember({
      memberId: payload.memberId,
      status: payload.status,
      role: payload.role,
      jerseyNumber: payload.jerseyNumber ?? null,
      position: payload.position ?? null,
      notes: payload.notes ?? null
    });

    revalidatePath(`/${org.orgSlug}/tools/programs/${member.programId}/structure`);
    revalidatePath(`/${org.orgSlug}/tools/programs/${member.programId}/teams`);

    return {
      ok: true,
      data: {
        member
      }
    };
  } catch (error: any) {
    rethrowIfNavigationError(error);
    if (error?.code === "23505") {
      return asError("This player is already assigned to a team in this program.");
    }
    return asError("Unable to update this roster entry right now.");
  }
}

export async function removeTeamMemberAction(input: {
  orgSlug: string;
  memberId: string;
}): Promise<TeamsActionResult<{ memberId: string }>> {
  const parsed = z
    .object({
      orgSlug: textSchema.min(1),
      memberId: z.string().uuid()
    })
    .safeParse(input);

  if (!parsed.success) {
    return asError("Invalid roster removal.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "programs.write");
    const supabase = await createSupabaseServer();
    const { data } = await supabase.schema("programs").from("program_team_members").select("program_id").eq("id", payload.memberId).maybeSingle();
    await removeTeamMember(payload.memberId);

    if (data?.program_id) {
      revalidatePath(`/${org.orgSlug}/tools/programs/${data.program_id}/structure`);
      revalidatePath(`/${org.orgSlug}/tools/programs/${data.program_id}/teams`);
    } else {
      revalidatePath(`/${org.orgSlug}/tools/programs`);
    }

    return {
      ok: true,
      data: {
        memberId: payload.memberId
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to remove this roster entry right now.");
  }
}

export async function addTeamStaffAction(input: {
  orgSlug: string;
  teamId: string;
  userId: string;
  role: ProgramTeamStaff["role"];
  isPrimary?: boolean;
  notes?: string | null;
}): Promise<TeamsActionResult<{ staff: ProgramTeamStaff }>> {
  const parsed = z
    .object({
      orgSlug: textSchema.min(1),
      teamId: z.string().uuid(),
      userId: z.string().uuid(),
      role: z.enum(["head_coach", "assistant_coach", "manager", "trainer", "volunteer"]),
      isPrimary: z.boolean().optional(),
      notes: textSchema.max(800).optional().nullable()
    })
    .safeParse(input);

  if (!parsed.success) {
    return asError("Please review the staff assignment.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "programs.write");
    const team = await getTeamCore(payload.teamId);

    if (!team || team.orgId !== org.orgId) {
      return asError("Team not found.");
    }

    const staff = await upsertTeamStaff({
      teamId: payload.teamId,
      orgId: org.orgId,
      programId: team.programId,
      userId: payload.userId,
      role: payload.role,
      isPrimary: payload.isPrimary ?? false,
      notes: payload.notes ?? null
    });

    revalidatePath(`/${org.orgSlug}/tools/programs/${team.programId}/structure`);
    revalidatePath(`/${org.orgSlug}/tools/programs/${team.programId}/teams`);

    return {
      ok: true,
      data: {
        staff
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to assign this staff member right now.");
  }
}

export async function removeTeamStaffAction(input: {
  orgSlug: string;
  staffId: string;
}): Promise<TeamsActionResult<{ staffId: string }>> {
  const parsed = z
    .object({
      orgSlug: textSchema.min(1),
      staffId: z.string().uuid()
    })
    .safeParse(input);

  if (!parsed.success) {
    return asError("Invalid staff removal.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "programs.write");
    const supabase = await createSupabaseServer();
    const { data } = await supabase.schema("programs").from("program_team_staff").select("program_id").eq("id", payload.staffId).maybeSingle();
    await removeTeamStaff(payload.staffId);

    if (data?.program_id) {
      revalidatePath(`/${org.orgSlug}/tools/programs/${data.program_id}/structure`);
      revalidatePath(`/${org.orgSlug}/tools/programs/${data.program_id}/teams`);
    } else {
      revalidatePath(`/${org.orgSlug}/tools/programs`);
    }

    return {
      ok: true,
      data: {
        staffId: payload.staffId
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to remove this staff member right now.");
  }
}

export async function checkTeamNodeAssociationsAction(input: { orgSlug: string; programNodeId: string }): Promise<TeamsActionResult<{ memberCount: number; staffCount: number }>> {
  const parsed = z
    .object({
      orgSlug: textSchema.min(1),
      programNodeId: z.string().uuid()
    })
    .safeParse(input);

  if (!parsed.success) {
    return asError("Invalid team lookup.");
  }

  try {
    await requireOrgPermission(parsed.data.orgSlug, "programs.write");
    const counts = await getTeamAssociationCountsByNode(parsed.data.programNodeId);

    return {
      ok: true,
      data: counts
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to validate the team right now.");
  }
}
