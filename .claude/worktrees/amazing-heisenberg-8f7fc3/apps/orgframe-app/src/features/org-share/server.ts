import { createOptionalSupabaseServiceRoleClient, createSupabaseServer } from "@/src/shared/data-api/server";
import { getRoleLabel, isAdminLikeRole } from "@/src/features/core/access";
import type {
  DynamicOrgGroup,
  DynamicOrgGroupKey,
  DynamicOrgGroupPreview,
  ShareTarget,
  ShareTargetType
} from "@/src/features/org-share/types";

type MembershipRow = {
  user_id: string;
  role: string;
};

type TeamStaffRow = {
  user_id: string;
  role: string;
};

type TeamStaffAssignmentRow = {
  team_id: string;
  user_id: string;
};

export type DynamicGroupMembershipRow = MembershipRow;
export type DynamicGroupTeamStaffRow = TeamStaffRow;

type PeopleUserRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
};

type ProgramNodeRow = {
  id: string;
  name: string;
  parent_id: string | null;
  program_id: string;
  programs: {
    id: string;
    name: string;
    org_id: string;
  } | Array<{
    id: string;
    name: string;
    org_id: string;
  }> | null;
};

type ProgramDivisionRow = {
  id: string;
  name: string;
};

type PeopleSystemGroupKind = "all_members" | "program" | "division" | "team";

type PeopleSystemGroup = {
  key: string;
  kind: PeopleSystemGroupKind;
  label: string;
  description: string;
  memberUserIds: string[];
  entityId: string | null;
  programId: string | null;
  divisionId: string | null;
};

function asRelationObject<T extends Record<string, unknown>>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    const [first] = value;
    return first ?? null;
  }

  return value;
}

function createShareTargetKey(target: { type: ShareTargetType; id: string }) {
  return `${target.type}:${target.id}`;
}

function dedupeTargets(targets: ShareTarget[]): ShareTarget[] {
  const dedup = new Map<string, ShareTarget>();
  for (const target of targets) {
    dedup.set(createShareTargetKey(target), target);
  }

  return Array.from(dedup.values());
}

function toDisplayName(input: { email: string | null; firstName: string | null; lastName: string | null; userId: string }) {
  const fullName = [input.firstName, input.lastName].filter(Boolean).join(" ").trim();
  if (fullName.length > 0) {
    return fullName;
  }

  if (input.email) {
    return input.email;
  }

  return input.userId;
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
        usersById.set(user.id, {
          email: user.email ?? null
        });
        pendingIds.delete(user.id);
      }
    }

    if (data.users.length < perPage) {
      break;
    }
  }

  return usersById;
}

async function listMembershipRows(orgId: string): Promise<MembershipRow[]> {
  const supabase = createOptionalSupabaseServiceRoleClient() ?? (await createSupabaseServer());
  const { data, error } = await supabase
    .schema("orgs").from("memberships")
    .select("user_id, role")
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to load org memberships: ${error.message}`);
  }

  return (data ?? []) as MembershipRow[];
}

async function listPeopleUsersByIds(userIds: string[]): Promise<Map<string, PeopleUserRow>> {
  if (userIds.length === 0) {
    return new Map();
  }

  const supabase = createOptionalSupabaseServiceRoleClient() ?? (await createSupabaseServer());
  const { data, error } = await supabase
    .schema("people").from("users")
    .select("user_id, first_name, last_name")
    .in("user_id", userIds);

  if (error) {
    throw new Error(`Failed to load people users: ${error.message}`);
  }

  return new Map(((data ?? []) as PeopleUserRow[]).map((row) => [row.user_id, row]));
}

async function listProgramStaffRows(orgId: string): Promise<TeamStaffRow[]> {
  const supabase = createOptionalSupabaseServiceRoleClient() ?? (await createSupabaseServer());
  const { data, error } = await supabase
    .schema("programs").from("program_team_staff")
    .select("user_id, role")
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to load team staff: ${error.message}`);
  }

  return (data ?? []) as TeamStaffRow[];
}

async function listProgramTeamStaffAssignments(orgId: string): Promise<TeamStaffAssignmentRow[]> {
  const supabase = createOptionalSupabaseServiceRoleClient() ?? (await createSupabaseServer());
  const { data, error } = await supabase
    .schema("programs").from("program_team_staff")
    .select("team_id, user_id")
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to load team staff assignments: ${error.message}`);
  }

  return ((data ?? []).filter((row) => Boolean(row.team_id && row.user_id)) as TeamStaffAssignmentRow[]);
}

async function listProgramTeamNodes(orgId: string): Promise<Array<{
  teamId: string;
  teamName: string;
  divisionId: string | null;
  divisionName: string | null;
  programId: string;
  programName: string;
}>> {
  const supabase = createOptionalSupabaseServiceRoleClient() ?? (await createSupabaseServer());
  const { data: teamNodesData, error: teamNodesError } = await supabase
    .schema("programs").from("program_structure_nodes")
    .select("id, name, parent_id, program_id, programs!inner(id, name, org_id)")
    .eq("node_kind", "team")
    .eq("programs.org_id", orgId);

  if (teamNodesError) {
    throw new Error(`Failed to load teams for people groups: ${teamNodesError.message}`);
  }

  const teamNodes = (teamNodesData ?? []) as ProgramNodeRow[];
  const divisionIds = Array.from(new Set(teamNodes.map((node) => node.parent_id).filter((value): value is string => Boolean(value))));
  const divisionById = new Map<string, ProgramDivisionRow>();

  if (divisionIds.length > 0) {
    const { data: divisionsData, error: divisionsError } = await supabase
      .schema("programs").from("program_structure_nodes")
      .select("id, name")
      .in("id", divisionIds);

    if (divisionsError) {
      throw new Error(`Failed to load divisions for people groups: ${divisionsError.message}`);
    }

    for (const division of divisionsData ?? []) {
      if (typeof division.id === "string") {
        divisionById.set(division.id, {
          id: division.id,
          name: typeof division.name === "string" ? division.name : division.id
        });
      }
    }
  }

  return teamNodes.map((teamNode) => {
    const program = asRelationObject(teamNode.programs);
    const division = teamNode.parent_id ? divisionById.get(teamNode.parent_id) ?? null : null;

    return {
      teamId: teamNode.id,
      teamName: teamNode.name,
      divisionId: teamNode.parent_id,
      divisionName: division?.name ?? null,
      programId: program?.id ?? teamNode.program_id,
      programName: program?.name ?? "Program"
    };
  });
}

export async function listDynamicOrgGroups(orgId: string): Promise<DynamicOrgGroup[]> {
  const [memberships, teamStaff] = await Promise.all([listMembershipRows(orgId), listProgramStaffRows(orgId)]);
  return buildDynamicOrgGroupsFromRows(memberships, teamStaff);
}

export function buildDynamicOrgGroupsFromRows(
  memberships: DynamicGroupMembershipRow[],
  teamStaff: DynamicGroupTeamStaffRow[]
): DynamicOrgGroup[] {
  const allMemberIds = Array.from(new Set(memberships.map((row) => row.user_id).filter(Boolean)));
  const adminIds = Array.from(new Set(memberships.filter((row) => isAdminLikeRole(row.role)).map((row) => row.user_id).filter(Boolean)));
  const staffIds = Array.from(new Set(teamStaff.map((row) => row.user_id).filter(Boolean)));
  const coachIds = Array.from(new Set(teamStaff.filter((row) => row.role === "head_coach" || row.role === "assistant_coach").map((row) => row.user_id).filter(Boolean)));
  const managerIds = Array.from(new Set(teamStaff.filter((row) => row.role === "manager").map((row) => row.user_id).filter(Boolean)));

  return [
    {
      key: "org-admins",
      type: "admin",
      label: "Organization Admins",
      description: "Accounts with admin-like organization roles.",
      memberUserIds: adminIds
    },
    {
      key: "org-members",
      type: "group",
      label: "All Members",
      description: "All accounts with organization membership.",
      memberUserIds: allMemberIds
    },
    {
      key: "all-coaches",
      type: "group",
      label: "All Coaches",
      description: "Team staff with head or assistant coach roles.",
      memberUserIds: coachIds
    },
    {
      key: "all-managers",
      type: "group",
      label: "All Managers",
      description: "Team staff with manager role.",
      memberUserIds: managerIds
    },
    {
      key: "all-staff",
      type: "group",
      label: "All Staff",
      description: "All team staff across programs and teams.",
      memberUserIds: staffIds
    }
  ];
}

export async function listDynamicOrgGroupsWorkspace(orgId: string): Promise<Array<{
  key: DynamicOrgGroupKey;
  type: "admin" | "group";
  label: string;
  description: string;
  memberCount: number;
  previewMembers: DynamicOrgGroupPreview[];
}>> {
  const groups = await listDynamicOrgGroups(orgId);
  const allUserIds = Array.from(new Set(groups.flatMap((group) => group.memberUserIds)));
  const [authUsersById, peopleUsersById] = await Promise.all([
    listAuthUsersByIds(allUserIds),
    listPeopleUsersByIds(allUserIds)
  ]);

  return groups.map((group) => {
    const previewMembers = group.memberUserIds.slice(0, 5).map((userId) => {
      const authUser = authUsersById.get(userId) ?? null;
      const peopleUser = peopleUsersById.get(userId) ?? null;
      return {
        userId,
        email: authUser?.email ?? null,
        displayName: toDisplayName({
          email: authUser?.email ?? null,
          firstName: peopleUser?.first_name ?? null,
          lastName: peopleUser?.last_name ?? null,
          userId
        })
      };
    });

    return {
      key: group.key,
      type: group.type,
      label: group.label,
      description: group.description,
      memberCount: group.memberUserIds.length,
      previewMembers
    };
  });
}

function sortPeopleSystemGroups(groups: PeopleSystemGroup[]): PeopleSystemGroup[] {
  const kindOrder: Record<PeopleSystemGroupKind, number> = {
    all_members: 0,
    program: 1,
    division: 2,
    team: 3
  };

  return groups.sort((left, right) => {
    const kindDiff = kindOrder[left.kind] - kindOrder[right.kind];
    if (kindDiff !== 0) {
      return kindDiff;
    }
    return left.label.localeCompare(right.label);
  });
}

export function buildPeopleSystemGroupsFromRows(input: {
  memberships: DynamicGroupMembershipRow[];
  teamHierarchy: Array<{
    teamId: string;
    teamName: string;
    divisionId: string | null;
    divisionName: string | null;
    programId: string;
    programName: string;
  }>;
  teamStaffAssignments: Array<{
    teamId: string;
    userId: string;
  }>;
}): PeopleSystemGroup[] {
  const allMemberIds = Array.from(new Set(input.memberships.map((row) => row.user_id).filter(Boolean)));
  const teamUserIds = new Map<string, Set<string>>();

  for (const assignment of input.teamStaffAssignments) {
    const current = teamUserIds.get(assignment.teamId) ?? new Set<string>();
    current.add(assignment.userId);
    teamUserIds.set(assignment.teamId, current);
  }

  const programUserIds = new Map<string, Set<string>>();
  const divisionUserIds = new Map<string, Set<string>>();

  for (const node of input.teamHierarchy) {
    const teamIds = teamUserIds.get(node.teamId) ?? new Set<string>();
    const programSet = programUserIds.get(node.programId) ?? new Set<string>();
    for (const userId of teamIds) {
      programSet.add(userId);
    }
    programUserIds.set(node.programId, programSet);

    if (node.divisionId) {
      const divisionSet = divisionUserIds.get(node.divisionId) ?? new Set<string>();
      for (const userId of teamIds) {
        divisionSet.add(userId);
      }
      divisionUserIds.set(node.divisionId, divisionSet);
    }
  }

  const seenPrograms = new Set<string>();
  const seenDivisions = new Set<string>();
  const groups: PeopleSystemGroup[] = [
    {
      key: "all-members",
      kind: "all_members",
      label: "All Members",
      description: "All accounts with organization membership.",
      memberUserIds: allMemberIds,
      entityId: null,
      programId: null,
      divisionId: null
    }
  ];

  for (const node of input.teamHierarchy) {
    if (!seenPrograms.has(node.programId)) {
      seenPrograms.add(node.programId);
      groups.push({
        key: `program:${node.programId}`,
        kind: "program",
        label: node.programName,
        description: "Program group (system-generated).",
        memberUserIds: Array.from(programUserIds.get(node.programId) ?? []),
        entityId: node.programId,
        programId: node.programId,
        divisionId: null
      });
    }

    if (node.divisionId && !seenDivisions.has(node.divisionId)) {
      seenDivisions.add(node.divisionId);
      groups.push({
        key: `division:${node.divisionId}`,
        kind: "division",
        label: node.divisionName ?? "Division",
        description: "Division group (system-generated).",
        memberUserIds: Array.from(divisionUserIds.get(node.divisionId) ?? []),
        entityId: node.divisionId,
        programId: node.programId,
        divisionId: node.divisionId
      });
    }

    groups.push({
      key: `team:${node.teamId}`,
      kind: "team",
      label: node.teamName,
      description: "Team group (system-generated).",
      memberUserIds: Array.from(teamUserIds.get(node.teamId) ?? []),
      entityId: node.teamId,
      programId: node.programId,
      divisionId: node.divisionId
    });
  }

  return sortPeopleSystemGroups(groups);
}

export async function listPeopleSystemGroupsWorkspace(orgId: string): Promise<Array<{
  key: string;
  kind: PeopleSystemGroupKind;
  label: string;
  description: string;
  entityId: string | null;
  programId: string | null;
  divisionId: string | null;
  memberCount: number;
  previewMembers: DynamicOrgGroupPreview[];
}>> {
  const [memberships, teamHierarchy, teamStaffAssignments] = await Promise.all([
    listMembershipRows(orgId),
    listProgramTeamNodes(orgId),
    listProgramTeamStaffAssignments(orgId)
  ]);

  const groups = buildPeopleSystemGroupsFromRows({
    memberships,
    teamHierarchy,
    teamStaffAssignments: teamStaffAssignments.map((assignment) => ({
      teamId: assignment.team_id,
      userId: assignment.user_id
    }))
  });

  const allUserIds = Array.from(new Set(groups.flatMap((group) => group.memberUserIds)));
  const [authUsersById, peopleUsersById] = await Promise.all([
    listAuthUsersByIds(allUserIds),
    listPeopleUsersByIds(allUserIds)
  ]);

  return groups.map((group) => {
    const previewMembers = group.memberUserIds.slice(0, 5).map((userId) => {
      const authUser = authUsersById.get(userId) ?? null;
      const peopleUser = peopleUsersById.get(userId) ?? null;
      return {
        userId,
        email: authUser?.email ?? null,
        displayName: toDisplayName({
          email: authUser?.email ?? null,
          firstName: peopleUser?.first_name ?? null,
          lastName: peopleUser?.last_name ?? null,
          userId
        })
      };
    });

    return {
      key: group.key,
      kind: group.kind,
      label: group.label,
      description: group.description,
      entityId: group.entityId,
      programId: group.programId,
      divisionId: group.divisionId,
      memberCount: group.memberUserIds.length,
      previewMembers
    };
  });
}

async function listOrgPeopleTargets(orgId: string): Promise<ShareTarget[]> {
  const memberships = await listMembershipRows(orgId);
  const userIds = Array.from(new Set(memberships.map((row) => row.user_id).filter(Boolean)));
  const [authUsersById, peopleUsersById] = await Promise.all([
    listAuthUsersByIds(userIds),
    listPeopleUsersByIds(userIds)
  ]);
  const roleByUserId = new Map(memberships.map((row) => [row.user_id, row.role]));

  return userIds.map((userId) => {
    const authUser = authUsersById.get(userId) ?? null;
    const peopleUser = peopleUsersById.get(userId) ?? null;
    const label = toDisplayName({
      email: authUser?.email ?? null,
      firstName: peopleUser?.first_name ?? null,
      lastName: peopleUser?.last_name ?? null,
      userId
    });

    const role = roleByUserId.get(userId) ?? "member";
    const subtitleParts: string[] = [];
    if (authUser?.email && authUser.email !== label) {
      subtitleParts.push(authUser.email);
    }
    subtitleParts.push(getRoleLabel(role));

    return {
      id: userId,
      type: "person",
      label,
      subtitle: subtitleParts.join(" - ")
    } satisfies ShareTarget;
  });
}

async function listOrgHierarchyTargets(orgId: string): Promise<ShareTarget[]> {
  const supabase = createOptionalSupabaseServiceRoleClient() ?? (await createSupabaseServer());

  const { data: teamNodesData, error: teamNodesError } = await supabase
    .schema("programs").from("program_structure_nodes")
    .select("id, name, parent_id, program_id, programs!inner(id, name, org_id)")
    .eq("node_kind", "team")
    .eq("programs.org_id", orgId);

  if (teamNodesError) {
    throw new Error(`Failed to load teams for sharing: ${teamNodesError.message}`);
  }

  const teamNodes = (teamNodesData ?? []) as ProgramNodeRow[];
  const divisionIds = Array.from(new Set(teamNodes.map((node) => node.parent_id).filter((value): value is string => Boolean(value))));

  const divisionById = new Map<string, { id: string; name: string }>();
  if (divisionIds.length > 0) {
    const { data: divisionsData, error: divisionsError } = await supabase
      .schema("programs").from("program_structure_nodes")
      .select("id, name")
      .in("id", divisionIds);

    if (divisionsError) {
      throw new Error(`Failed to load divisions for sharing: ${divisionsError.message}`);
    }

    for (const division of divisionsData ?? []) {
      if (typeof division.id === "string") {
        divisionById.set(division.id, {
          id: division.id,
          name: typeof division.name === "string" ? division.name : division.id
        });
      }
    }
  }

  const targets: ShareTarget[] = [];
  const seenDivisionIds = new Set<string>();
  const seenProgramIds = new Set<string>();

  for (const teamNode of teamNodes) {
    const program = asRelationObject(teamNode.programs);
    const programName = program?.name ?? "Program";
    targets.push({
      id: teamNode.id,
      type: "team",
      label: teamNode.name,
      subtitle: `${programName} team`
    });

    if (teamNode.parent_id && !seenDivisionIds.has(teamNode.parent_id)) {
      seenDivisionIds.add(teamNode.parent_id);
      const division = divisionById.get(teamNode.parent_id);
      if (division) {
        targets.push({
          id: division.id,
          type: "division",
          label: division.name,
          subtitle: `${programName} division`
        });
      }
    }

    if (program?.id && !seenProgramIds.has(program.id)) {
      seenProgramIds.add(program.id);
      targets.push({
        id: program.id,
        type: "program",
        label: program.name,
        subtitle: "Program"
      });
    }
  }

  return dedupeTargets(targets);
}

export async function listOrgShareCatalog(input: {
  orgId: string;
  requestedTypes?: ShareTargetType[];
  includePeopleAndGroups?: boolean;
  includeHierarchy?: boolean;
}): Promise<ShareTarget[]> {
  const requestedTypes = input.requestedTypes && input.requestedTypes.length > 0 ? new Set(input.requestedTypes) : null;
  const includePeopleAndGroups = input.includePeopleAndGroups ?? true;
  const includeHierarchy = input.includeHierarchy ?? true;

  const targets: ShareTarget[] = [];

  if (includePeopleAndGroups) {
    const shouldIncludePeople = !requestedTypes || requestedTypes.has("person");
    if (shouldIncludePeople) {
      targets.push(...(await listOrgPeopleTargets(input.orgId)));
    }

    const shouldIncludeGroups =
      !requestedTypes || requestedTypes.has("group") || requestedTypes.has("admin");
    if (shouldIncludeGroups) {
      const groups = await listDynamicOrgGroups(input.orgId);
      targets.push(
        ...groups
          .filter((group) => !requestedTypes || requestedTypes.has(group.type))
          .map((group) => ({
            id: group.key,
            type: group.type,
            label: group.label,
            subtitle: `${group.memberUserIds.length} members`
          }))
      );
    }
  }

  if (includeHierarchy) {
    const wantsHierarchy =
      !requestedTypes || requestedTypes.has("team") || requestedTypes.has("division") || requestedTypes.has("program");
    if (wantsHierarchy) {
      const hierarchyTargets = await listOrgHierarchyTargets(input.orgId);
      targets.push(...hierarchyTargets.filter((target) => !requestedTypes || requestedTypes.has(target.type)));
    }
  }

  return dedupeTargets(targets).sort((left, right) => {
    if (left.type !== right.type) {
      return left.type.localeCompare(right.type);
    }

    return left.label.localeCompare(right.label);
  });
}

export async function expandShareTargetsToUserIds(input: {
  orgId: string;
  targets: ShareTarget[];
}): Promise<string[]> {
  const groups = await listDynamicOrgGroups(input.orgId);
  const groupMap = new Map(groups.map((group) => [group.key, group]));
  const selectedUserIds = new Set<string>();

  for (const target of input.targets) {
    if (target.type === "person") {
      selectedUserIds.add(target.id);
      continue;
    }

    if (target.type === "admin" || target.type === "group") {
      const group = groupMap.get(target.id as DynamicOrgGroupKey);
      if (!group) {
        continue;
      }

      for (const userId of group.memberUserIds) {
        selectedUserIds.add(userId);
      }
    }
  }

  return Array.from(selectedUserIds);
}
