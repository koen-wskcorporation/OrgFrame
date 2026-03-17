import { createSupabaseServer } from "@/lib/supabase/server";
import { createOptionalSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { PlayerPickerItem } from "@/modules/players/types";
import type {
  ProgramTeam,
  ProgramTeamDirectoryItem,
  ProgramTeamMember,
  ProgramTeamStaff,
  ProgramTeamSummary
} from "@/modules/programs/types";
import type {
  ProgramTeamDetail,
  ProgramTeamFacilityOption,
  ProgramTeamMemberDetail,
  ProgramTeamRosterCandidate,
  ProgramTeamStaffCandidate,
  ProgramTeamStaffDetail
} from "@/modules/programs/teams/types";

const teamSelect =
  "id, org_id, program_id, program_node_id, status, team_code, level_label, age_group, gender, color_primary, color_secondary, home_facility_id, notes, settings_json, created_at, updated_at";
const memberSelect =
  "id, team_id, org_id, program_id, player_id, registration_id, status, role, jersey_number, position, notes, assigned_by_user_id, created_at, updated_at";
const staffSelect = "id, team_id, org_id, program_id, user_id, role, is_primary, notes, created_at, updated_at";

const playerSelect = "id, first_name, last_name, preferred_name, date_of_birth";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asRelationObject(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    const [first] = value;
    return asObject(first);
  }

  return asObject(value);
}

function getRequiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function getOptionalString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function mapTeam(row: any): ProgramTeam {
  return {
    id: row.id,
    orgId: row.org_id,
    programId: row.program_id,
    programNodeId: row.program_node_id,
    status: row.status,
    teamCode: row.team_code ?? null,
    levelLabel: row.level_label ?? null,
    ageGroup: row.age_group ?? null,
    gender: row.gender ?? null,
    colorPrimary: row.color_primary ?? null,
    colorSecondary: row.color_secondary ?? null,
    homeFacilityId: row.home_facility_id ?? null,
    notes: row.notes ?? null,
    settingsJson: asObject(row.settings_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapMember(row: any): ProgramTeamMember {
  return {
    id: row.id,
    teamId: row.team_id,
    orgId: row.org_id,
    programId: row.program_id,
    playerId: row.player_id,
    registrationId: row.registration_id ?? null,
    status: row.status,
    role: row.role,
    jerseyNumber: row.jersey_number ?? null,
    position: row.position ?? null,
    notes: row.notes ?? null,
    assignedByUserId: row.assigned_by_user_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapStaff(row: any): ProgramTeamStaff {
  return {
    id: row.id,
    teamId: row.team_id,
    orgId: row.org_id,
    programId: row.program_id,
    userId: row.user_id,
    role: row.role,
    isPrimary: Boolean(row.is_primary),
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPlayerLabel(player: any): PlayerPickerItem & { dateOfBirth: string | null } {
  const firstName = player.first_name ?? "";
  const lastName = player.last_name ?? "";
  const preferred = player.preferred_name;
  const label = `${firstName} ${lastName}`.trim() || preferred || "Player";

  return {
    id: player.id,
    label,
    subtitle: player.date_of_birth ? `DOB: ${player.date_of_birth}` : null,
    dateOfBirth: player.date_of_birth ?? null
  };
}

async function listAuthUsersByIds(userIds: string[]): Promise<Map<string, { email: string | null }>> {
  const pendingIds = new Set(userIds);
  const usersById = new Map<string, { email: string | null }>();
  const supabase = createOptionalSupabaseServiceRoleClient();

  if (!supabase || pendingIds.size === 0) {
    return usersById;
  }

  const perPage = 200;
  for (let page = 1; page <= 20 && pendingIds.size > 0; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage
    });

    if (error) {
      break;
    }

    for (const user of data.users) {
      if (pendingIds.has(user.id)) {
        usersById.set(user.id, { email: user.email ?? null });
        pendingIds.delete(user.id);
      }
    }

    if (data.users.length < perPage) {
      break;
    }
  }

  return usersById;
}

export async function listProgramTeamsSummary(programId: string): Promise<ProgramTeamSummary[]> {
  const supabase = await createSupabaseServer();
  const { data: teamRows, error } = await supabase
    .from("program_teams")
    .select(`${teamSelect}, program_nodes(id, name, slug, parent_id)`)
    .eq("program_id", programId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list teams: ${error.message}`);
  }

  const { data: memberRows, error: memberError } = await supabase
    .from("program_team_members")
    .select("team_id, status")
    .eq("program_id", programId);

  if (memberError) {
    throw new Error(`Failed to load team roster counts: ${memberError.message}`);
  }

  const { data: staffRows, error: staffError } = await supabase
    .from("program_team_staff")
    .select("team_id")
    .eq("program_id", programId);

  if (staffError) {
    throw new Error(`Failed to load team staff counts: ${staffError.message}`);
  }

  const memberCounts = new Map<string, number>();
  for (const row of memberRows ?? []) {
    if (!row.team_id) {
      continue;
    }
    if (row.status === "removed") {
      continue;
    }
    memberCounts.set(row.team_id, (memberCounts.get(row.team_id) ?? 0) + 1);
  }

  const staffCounts = new Map<string, number>();
  for (const row of staffRows ?? []) {
    if (!row.team_id) {
      continue;
    }
    staffCounts.set(row.team_id, (staffCounts.get(row.team_id) ?? 0) + 1);
  }

  return (teamRows ?? []).map((row: any) => {
    const team = mapTeam(row);
    const node = asRelationObject(row.program_nodes);
    return {
      team,
      node: {
        id: getRequiredString(node, "id"),
        name: getRequiredString(node, "name"),
        slug: getRequiredString(node, "slug"),
        parentId: getOptionalString(node, "parent_id")
      },
      memberCount: memberCounts.get(team.id) ?? 0,
      staffCount: staffCounts.get(team.id) ?? 0
    } satisfies ProgramTeamSummary;
  });
}

export async function listPublishedProgramTeamsForDirectory(
  orgId: string,
  options?: {
    limit?: number;
  }
): Promise<ProgramTeamDirectoryItem[]> {
  const supabase = await createSupabaseServer();
  const service = createOptionalSupabaseServiceRoleClient();
  const limit = typeof options?.limit === "number" && options.limit > 0 ? Math.min(options.limit, 200) : 200;
  const { data: rows, error } = await supabase
    .from("program_nodes")
    .select("id, program_id, parent_id, name, slug, node_kind, settings_json, programs!inner(id, org_id, slug, name, status)")
    .eq("programs.org_id", orgId)
    .eq("programs.status", "published")
    .eq("node_kind", "team")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list published teams: ${error.message}`);
  }

  const sourceNodes = (rows ?? []).map((row: any) => {
    const program = asRelationObject(row.programs);
    const teamSettings = asObject(row.settings_json);

    return {
      nodeId: String(row.id),
      programId: getRequiredString(program, "id"),
      programName: getRequiredString(program, "name"),
      programSlug: getRequiredString(program, "slug"),
      divisionId: typeof row.parent_id === "string" ? row.parent_id : null,
      teamName: typeof row.name === "string" ? row.name : "Team",
      teamSlug: typeof row.slug === "string" ? row.slug : "",
      teamPublished: teamSettings.published !== false
    };
  });

  const publishedNodes = sourceNodes.filter((entry) => entry.teamPublished);

  const divisionIds = publishedNodes.map((entry) => entry.divisionId).filter((value): value is string => Boolean(value));
  const divisionById = new Map<string, { name: string; slug: string; isPublished: boolean }>();

  if (divisionIds.length > 0) {
    const { data: divisionRows, error: divisionError } = await supabase
      .from("program_nodes")
      .select("id, name, slug, settings_json")
      .in("id", divisionIds);

    if (divisionError) {
      throw new Error(`Failed to list divisions: ${divisionError.message}`);
    }

    for (const row of divisionRows ?? []) {
      const settings = asObject(row.settings_json);
      divisionById.set(String(row.id), {
        name: typeof row.name === "string" ? row.name : "",
        slug: typeof row.slug === "string" ? row.slug : "",
        isPublished: settings.published !== false
      });
    }
  }

  const visibleNodes = publishedNodes.filter((entry) => {
    if (!entry.divisionId) {
      return true;
    }

    const division = divisionById.get(entry.divisionId);
    return division ? division.isPublished : false;
  });

  const teamByNodeId = new Map<
    string,
    {
      id: string;
      teamCode: string | null;
      levelLabel: string | null;
      ageGroup: string | null;
      gender: string | null;
    }
  >();

  if (service && visibleNodes.length > 0) {
    const programNodeIds = visibleNodes.map((entry) => entry.nodeId);
    const { data: teamRows, error: teamError } = await service
      .from("program_teams")
      .select("id, program_node_id, team_code, level_label, age_group, gender, status")
      .eq("org_id", orgId)
      .eq("status", "active")
      .in("program_node_id", programNodeIds);

    if (teamError) {
      throw new Error(`Failed to list active teams: ${teamError.message}`);
    }

    for (const row of teamRows ?? []) {
      if (!row.program_node_id || !row.id) {
        continue;
      }
      teamByNodeId.set(String(row.program_node_id), {
        id: String(row.id),
        teamCode: typeof row.team_code === "string" ? row.team_code : null,
        levelLabel: typeof row.level_label === "string" ? row.level_label : null,
        ageGroup: typeof row.age_group === "string" ? row.age_group : null,
        gender: typeof row.gender === "string" ? row.gender : null
      });
    }
  }

  const syntheticTeamIdByNodeId = new Map<string, string>();
  for (const node of visibleNodes) {
    if (!teamByNodeId.has(node.nodeId)) {
      syntheticTeamIdByNodeId.set(node.nodeId, `node:${node.nodeId}`);
    }
  }

  const resolvedTeamIds = visibleNodes.map((entry) => teamByNodeId.get(entry.nodeId)?.id ?? syntheticTeamIdByNodeId.get(entry.nodeId) ?? `node:${entry.nodeId}`);
  const memberCounts = new Map<string, number>();
  const staffCounts = new Map<string, number>();

  if (service && resolvedTeamIds.length > 0) {
    const realTeamIds = resolvedTeamIds.filter((id) => !id.startsWith("node:"));
    const { data: memberRows, error: memberError } = await service
      .from("program_team_members")
      .select("team_id, status")
      .in("team_id", realTeamIds);

    if (memberError) {
      throw new Error(`Failed to load team member counts: ${memberError.message}`);
    }

    for (const row of memberRows ?? []) {
      if (!row.team_id || row.status === "removed") {
        continue;
      }
      memberCounts.set(row.team_id, (memberCounts.get(row.team_id) ?? 0) + 1);
    }

    const { data: staffRows, error: staffError } = await service.from("program_team_staff").select("team_id").in("team_id", realTeamIds);

    if (staffError) {
      throw new Error(`Failed to load team staff counts: ${staffError.message}`);
    }

    for (const row of staffRows ?? []) {
      if (!row.team_id) {
        continue;
      }
      staffCounts.set(row.team_id, (staffCounts.get(row.team_id) ?? 0) + 1);
    }
  }

  return visibleNodes
    .map((entry) => {
      const team = teamByNodeId.get(entry.nodeId) ?? null;
      const fallbackId = syntheticTeamIdByNodeId.get(entry.nodeId) ?? `node:${entry.nodeId}`;
      const teamId = team?.id ?? fallbackId;
      const division = entry.divisionId ? divisionById.get(entry.divisionId) ?? null : null;

      return {
        teamId,
        teamName: entry.teamName,
        teamSlug: entry.teamSlug,
        programId: entry.programId,
        programName: entry.programName,
        programSlug: entry.programSlug,
        divisionId: entry.divisionId,
        divisionName: division?.name ?? null,
        divisionSlug: division?.slug ?? null,
        memberCount: memberCounts.get(teamId) ?? 0,
        staffCount: staffCounts.get(teamId) ?? 0,
        teamCode: team?.teamCode ?? null,
        levelLabel: team?.levelLabel ?? null,
        ageGroup: team?.ageGroup ?? null,
        gender: team?.gender ?? null
      } satisfies ProgramTeamDirectoryItem;
    })
    .sort((a, b) => {
      const programSort = a.programName.localeCompare(b.programName);
      if (programSort !== 0) {
        return programSort;
      }

      const divisionSort = (a.divisionName ?? "").localeCompare(b.divisionName ?? "");
      if (divisionSort !== 0) {
        return divisionSort;
      }

      return a.teamName.localeCompare(b.teamName);
    });
}

export async function getProgramTeamDetail(teamId: string): Promise<ProgramTeamDetail | null> {
  const supabase = await createSupabaseServer();
  const { data: teamRow, error } = await supabase
    .from("program_teams")
    .select(`${teamSelect}, program_nodes(id, name, slug, parent_id)`)
    .eq("id", teamId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load team: ${error.message}`);
  }

  if (!teamRow) {
    return null;
  }

  const { data: rosterRows, error: rosterError } = await supabase
    .from("program_team_members")
    .select(`${memberSelect}, players(${playerSelect})`)
    .eq("team_id", teamId)
    .order("created_at", { ascending: true });

  if (rosterError) {
    throw new Error(`Failed to load team roster: ${rosterError.message}`);
  }

  const { data: staffRows, error: staffError } = await supabase
    .from("program_team_staff")
    .select(staffSelect)
    .eq("team_id", teamId)
    .order("created_at", { ascending: true });

  if (staffError) {
    throw new Error(`Failed to load team staff: ${staffError.message}`);
  }

  const staffUserIds = (staffRows ?? []).map((row: any) => row.user_id).filter(Boolean);
  const usersById = await listAuthUsersByIds(staffUserIds);

  const team = mapTeam(teamRow);
  const node = asRelationObject(teamRow.program_nodes);

  const roster: ProgramTeamMemberDetail[] = (rosterRows ?? []).map((row: any) => {
    const member = mapMember(row);
    return {
      ...member,
      player: mapPlayerLabel(row.players ?? { id: member.playerId })
    };
  });

  const staff: ProgramTeamStaffDetail[] = (staffRows ?? []).map((row: any) => {
    const staffMember = mapStaff(row);
    const userMeta = usersById.get(staffMember.userId) ?? { email: null };
    return {
      ...staffMember,
      email: userMeta.email
    };
  });

  return {
    team,
    node: {
      id: getRequiredString(node, "id"),
      name: getRequiredString(node, "name"),
      slug: getRequiredString(node, "slug"),
      parentId: getOptionalString(node, "parent_id")
    },
    roster,
    staff,
    rosterCandidates: [],
    staffCandidates: [],
    facilities: []
  };
}

export async function getProgramTeamDetailByNodeId(teamNodeId: string): Promise<ProgramTeamDetail | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("program_teams")
    .select("id")
    .eq("program_node_id", teamNodeId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load team: ${error.message}`);
  }

  if (!data?.id) {
    return null;
  }

  return getProgramTeamDetail(data.id);
}

export async function listTeamRosterCandidates(programId: string): Promise<ProgramTeamRosterCandidate[]> {
  const supabase = await createSupabaseServer();

  const { data: memberRows, error: memberError } = await supabase
    .from("program_team_members")
    .select("player_id, status")
    .eq("program_id", programId);

  if (memberError) {
    throw new Error(`Failed to load team members: ${memberError.message}`);
  }

  const excludedPlayers = new Set<string>();
  for (const row of memberRows ?? []) {
    if (!row.player_id) {
      continue;
    }
    if (row.status === "removed") {
      continue;
    }
    excludedPlayers.add(row.player_id);
  }

  const { data: registrations, error } = await supabase
    .from("program_registrations")
    .select(`id, status, player_id, players(${playerSelect})`)
    .eq("program_id", programId)
    .in("status", ["submitted", "in_review", "approved", "waitlisted"])
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load registration pool: ${error.message}`);
  }

  const seen = new Set<string>();
  const candidates: ProgramTeamRosterCandidate[] = [];

  for (const row of registrations ?? []) {
    if (!row.player_id || seen.has(row.player_id) || excludedPlayers.has(row.player_id)) {
      continue;
    }

    const player = row.players ?? { id: row.player_id };
    const label = mapPlayerLabel(player);

    candidates.push({
      playerId: row.player_id,
      registrationId: row.id ?? null,
      label: label.label,
      subtitle: label.subtitle,
      registrationStatus: row.status ?? "submitted"
    });

    seen.add(row.player_id);
  }

  return candidates;
}

export async function listTeamStaffCandidates(orgId: string): Promise<ProgramTeamStaffCandidate[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("org_memberships")
    .select("user_id, role")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load org members: ${error.message}`);
  }

  const userIds = (data ?? []).map((row) => row.user_id).filter(Boolean);
  const usersById = await listAuthUsersByIds(userIds);

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    email: usersById.get(row.user_id)?.email ?? null,
    role: row.role
  }));
}

export async function listTeamFacilityOptions(orgId: string): Promise<ProgramTeamFacilityOption[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("facility_spaces")
    .select("id, name, status")
    .eq("org_id", orgId)
    .order("sort_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load facilities: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status
  }));
}

export async function upsertTeamProfile(input: {
  teamId: string;
  status: ProgramTeam["status"];
  teamCode: string | null;
  levelLabel: string | null;
  ageGroup: string | null;
  gender: string | null;
  colorPrimary: string | null;
  colorSecondary: string | null;
  homeFacilityId: string | null;
  notes: string | null;
}): Promise<ProgramTeam> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("program_teams")
    .update({
      status: input.status,
      team_code: input.teamCode,
      level_label: input.levelLabel,
      age_group: input.ageGroup,
      gender: input.gender,
      color_primary: input.colorPrimary,
      color_secondary: input.colorSecondary,
      home_facility_id: input.homeFacilityId,
      notes: input.notes
    })
    .eq("id", input.teamId)
    .select(teamSelect)
    .single();

  if (error) {
    throw new Error(`Failed to update team: ${error.message}`);
  }

  return mapTeam(data as any);
}

export async function insertTeamMember(input: {
  teamId: string;
  orgId: string;
  programId: string;
  playerId: string;
  registrationId: string | null;
  status: ProgramTeamMember["status"];
  role: ProgramTeamMember["role"];
  jerseyNumber: string | null;
  position: string | null;
  notes: string | null;
  assignedByUserId: string | null;
}): Promise<ProgramTeamMember> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("program_team_members")
    .insert({
      team_id: input.teamId,
      org_id: input.orgId,
      program_id: input.programId,
      player_id: input.playerId,
      registration_id: input.registrationId,
      status: input.status,
      role: input.role,
      jersey_number: input.jerseyNumber,
      position: input.position,
      notes: input.notes,
      assigned_by_user_id: input.assignedByUserId
    })
    .select(memberSelect)
    .single();

  if (error) {
    throw error;
  }

  return mapMember(data as any);
}

export async function updateTeamMember(input: {
  memberId: string;
  status: ProgramTeamMember["status"];
  role: ProgramTeamMember["role"];
  jerseyNumber: string | null;
  position: string | null;
  notes: string | null;
}): Promise<ProgramTeamMember> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("program_team_members")
    .update({
      status: input.status,
      role: input.role,
      jersey_number: input.jerseyNumber,
      position: input.position,
      notes: input.notes
    })
    .eq("id", input.memberId)
    .select(memberSelect)
    .single();

  if (error) {
    throw new Error(`Failed to update team member: ${error.message}`);
  }

  return mapMember(data as any);
}

export async function removeTeamMember(memberId: string): Promise<void> {
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from("program_team_members")
    .update({ status: "removed" })
    .eq("id", memberId);

  if (error) {
    throw new Error(`Failed to remove team member: ${error.message}`);
  }
}

export async function upsertTeamStaff(input: {
  teamId: string;
  orgId: string;
  programId: string;
  userId: string;
  role: ProgramTeamStaff["role"];
  isPrimary: boolean;
  notes: string | null;
}): Promise<ProgramTeamStaff> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("program_team_staff")
    .upsert(
      {
        team_id: input.teamId,
        org_id: input.orgId,
        program_id: input.programId,
        user_id: input.userId,
        role: input.role,
        is_primary: input.isPrimary,
        notes: input.notes
      },
      { onConflict: "team_id,user_id" }
    )
    .select(staffSelect)
    .single();

  if (error) {
    throw new Error(`Failed to update team staff: ${error.message}`);
  }

  return mapStaff(data as any);
}

export async function removeTeamStaff(staffId: string): Promise<void> {
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("program_team_staff").delete().eq("id", staffId);

  if (error) {
    throw new Error(`Failed to remove team staff: ${error.message}`);
  }
}

export async function getTeamAssociationCountsByNode(programNodeId: string): Promise<{ memberCount: number; staffCount: number }> {
  const supabase = await createSupabaseServer();
  const { data: team, error } = await supabase
    .from("program_teams")
    .select("id")
    .eq("program_node_id", programNodeId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load team: ${error.message}`);
  }

  if (!team?.id) {
    return { memberCount: 0, staffCount: 0 };
  }

  const { count: memberCount, error: memberError } = await supabase
    .from("program_team_members")
    .select("id", { count: "exact", head: true })
    .eq("team_id", team.id)
    .neq("status", "removed");

  if (memberError) {
    throw new Error(`Failed to count team members: ${memberError.message}`);
  }

  const { count: staffCount, error: staffError } = await supabase
    .from("program_team_staff")
    .select("id", { count: "exact", head: true })
    .eq("team_id", team.id);

  if (staffError) {
    throw new Error(`Failed to count team staff: ${staffError.message}`);
  }

  return {
    memberCount: memberCount ?? 0,
    staffCount: staffCount ?? 0
  };
}
