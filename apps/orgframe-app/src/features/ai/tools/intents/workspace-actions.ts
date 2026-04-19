import { createSupabaseServer } from "@/src/shared/data-api/server";
import { getSupabasePublicConfig } from "@/src/shared/supabase/config";
import type { Permission } from "@/src/features/core/access";
import type { AiChangesetV1, AiExecutionResult, AiProposal, AiResolvedContext } from "@/src/features/ai/types";

const requiredPermissions: Permission[] = ["programs.write"];
const peopleWritePermissions: Permission[] = ["people.write", "programs.write"];

type OrgRow = {
  id: string;
  slug: string;
  name: string;
};

type PlayerRow = {
  id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
};

type TeamRow = {
  id: string;
  name: string | null;
  team_code: string | null;
};

type ProgramRow = {
  id: string;
  name: string;
  slug: string;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function hasAnyPermission(context: AiResolvedContext, permissions: Permission[]) {
  return permissions.some((permission) => context.permissionEnvelope.permissions.includes(permission));
}

function confidenceLabel(score: number) {
  if (score >= 0.9) {
    return "high";
  }
  if (score >= 0.75) {
    return "medium";
  }
  return "low";
}

async function getOrgBySlug(orgSlug: string): Promise<OrgRow | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.schema("orgs").from("orgs").select("id, slug, name").eq("slug", orgSlug).maybeSingle();
  if (error) {
    throw new Error(`Failed to load org: ${error.message}`);
  }
  return (data as OrgRow | null) ?? null;
}

async function listPlayers(orgId: string): Promise<PlayerRow[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("people")
    .from("profiles")
    .select("id, display_name, first_name, last_name")
    .eq("org_id", orgId)
    .eq("profile_type", "player")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`Failed to list players: ${error.message}`);
  }

  return (data ?? []) as PlayerRow[];
}

async function listTeams(orgId: string): Promise<TeamRow[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("programs")
    .from("program_teams")
    .select("id, name, team_code")
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`Failed to list teams: ${error.message}`);
  }

  return (data ?? []) as TeamRow[];
}

async function listPrograms(orgId: string): Promise<ProgramRow[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("programs")
    .from("programs")
    .select("id, name, slug")
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`Failed to list programs: ${error.message}`);
  }

  return (data ?? []) as ProgramRow[];
}

function bestMatch<T extends { id: string }>(
  source: T[],
  labelFor: (item: T) => string,
  needle: string
): { item: T | null; score: number; candidates: Array<{ key: string; label: string; description: string | null }> } {
  const normalizedNeedle = normalize(needle);
  if (!normalizedNeedle) {
    return {
      item: null,
      score: 0,
      candidates: source.slice(0, 8).map((item) => ({ key: item.id, label: labelFor(item), description: null })),
    };
  }

  const ranked = source
    .map((item) => {
      const label = normalize(labelFor(item));
      let score = 0;
      if (label === normalizedNeedle) {
        score = 1;
      } else if (label.includes(normalizedNeedle) || normalizedNeedle.includes(label)) {
        score = 0.92;
      } else {
        const words = normalizedNeedle.split(" ").filter((word) => word.length >= 3);
        const hits = words.filter((word) => label.includes(word)).length;
        if (hits > 0) {
          score = Math.min(0.88, 0.45 + hits * 0.13);
        }
      }
      return { item, score, label: labelFor(item) };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    return {
      item: null,
      score: 0,
      candidates: source.slice(0, 8).map((item) => ({ key: item.id, label: labelFor(item), description: null })),
    };
  }

  if (ranked.length > 1 && ranked[0].score - ranked[1].score < 0.05) {
    return {
      item: null,
      score: ranked[0].score,
      candidates: ranked.slice(0, 8).map((entry) => ({ key: entry.item.id, label: entry.label, description: `confidence:${confidenceLabel(entry.score)}` })),
    };
  }

  return {
    item: ranked[0].item,
    score: ranked[0].score,
    candidates: ranked.slice(0, 8).map((entry) => ({ key: entry.item.id, label: entry.label, description: `confidence:${confidenceLabel(entry.score)}` })),
  };
}

function parseJerseyNumber(text: string) {
  const match = text.match(/jersey(?:\s+number)?\s+(?:to|=)?\s*([0-9]{1,3})/i);
  return match ? match[1] : "";
}

function parseDateTimeParts(text: string) {
  const startsMatch = text.match(/starts?\s+(?:at|on)\s+([0-9:\-T. Z+]+)/i);
  const endsMatch = text.match(/ends?\s+(?:at|on)\s+([0-9:\-T. Z+]+)/i);
  return {
    startsAt: startsMatch?.[1]?.trim() ?? "",
    endsAt: endsMatch?.[1]?.trim() ?? "",
  };
}

function parseTeamName(text: string) {
  const namedMatch = text.match(/(?:create|new)\s+(?:a\s+)?team\s+(?:called|named)\s+["“]?([^"”]+)["”]?/i);
  if (namedMatch?.[1]) {
    return cleanText(namedMatch[1]);
  }

  const simpleMatch = text.match(/(?:create|new)\s+(?:a\s+)?team\s+([a-z0-9\s\-']{2,60})/i);
  if (simpleMatch?.[1]) {
    return cleanText(simpleMatch[1]);
  }

  return "";
}

function ensureExecutableProposal(input: {
  intentType: string;
  summary: string;
  requiredPermissions: Permission[];
  changeset: AiChangesetV1 | null;
  ambiguity?: AiProposal["ambiguity"];
  warnings?: string[];
}): AiProposal {
  return {
    intentType: input.intentType,
    executable: Boolean(input.changeset) && !input.ambiguity,
    requiredPermissions: input.requiredPermissions,
    summary: input.summary,
    steps: input.changeset
      ? [
          {
            key: "confirm",
            title: "Confirm execution",
            detail: "Review and confirm this proposed action before data changes are applied.",
          },
        ]
      : [
          {
            key: "resolve",
            title: "Resolve ambiguity",
            detail: "Select the correct entities before execution.",
          },
        ],
    changeset: input.changeset,
    warnings: input.warnings ?? [],
    ambiguity: input.ambiguity ?? null,
  };
}

function noPermission(intentType: string, permissions: Permission[]): AiProposal {
  return {
    intentType,
    executable: false,
    requiredPermissions: permissions,
    summary: "This action requires additional permissions.",
    steps: [
      {
        key: "permission",
        title: "Permission required",
        detail: `You need one of: ${permissions.join(", ")}.`,
      },
    ],
    changeset: null,
    warnings: ["Insufficient permissions."],
    ambiguity: null,
  };
}

function asOperationWhereSet(orgId: string, set: Record<string, string | null>): AiChangesetV1["operations"][number] {
  return {
    kind: "update",
    table: "edge.ai_workspace_actions",
    where: {
      org_id: orgId,
    },
    set,
  };
}

export async function proposeUpdatePlayerProfileAction(input: {
  context: AiResolvedContext;
  orgSlug: string;
  parameters: Record<string, unknown>;
  entitySelections: Record<string, string>;
}): Promise<AiProposal> {
  const intentType = "players.update_profile_fields";
  if (!hasAnyPermission(input.context, peopleWritePermissions)) {
    return noPermission(intentType, peopleWritePermissions);
  }

  const org = await getOrgBySlug(input.orgSlug);
  if (!org) {
    throw new Error("Organization not found.");
  }

  const players = await listPlayers(org.id);
  const selectedPlayerId = cleanText(input.entitySelections.player);
  const freeText = `${cleanText(input.parameters.freeText)} ${cleanText(input.parameters.userMessage)} ${cleanText(input.parameters.playerName)}`.trim();
  const jerseyNumber = cleanText(input.parameters.jerseyNumber) || parseJerseyNumber(freeText);

  const playerMatch =
    selectedPlayerId && players.find((player) => player.id === selectedPlayerId)
      ? { item: players.find((player) => player.id === selectedPlayerId) ?? null, score: 1, candidates: [] }
      : bestMatch(players, (player) => player.display_name || `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim(), freeText);

  if (!playerMatch.item || !jerseyNumber) {
    return ensureExecutableProposal({
      intentType,
      summary: "Need player and jersey number before proposing execution.",
      requiredPermissions: peopleWritePermissions,
      changeset: null,
      ambiguity: {
        key: "player",
        title: "Choose player",
        description: jerseyNumber ? "Select which player should be updated." : "Include a jersey number and select a player.",
        candidates: playerMatch.candidates.slice(0, 8),
      },
    });
  }

  const summary = `Update ${playerMatch.item.display_name}'s jersey number to ${jerseyNumber}.`;
  const changeset: AiChangesetV1 = {
    version: "v1",
    intentType,
    orgId: org.id,
    orgSlug: org.slug,
    summary,
    preconditions: [
      {
        table: "people.profiles",
        field: "id",
        expected: playerMatch.item.id,
        reason: "Target player must still exist in this organization.",
      },
    ],
    operations: [
      asOperationWhereSet(org.id, {
        action: "update_player_profile",
        player_id: playerMatch.item.id,
        field: "jerseyNumber",
        value: jerseyNumber,
      }),
    ],
    revalidatePaths: [`/${org.slug}/workspace`, `/${org.slug}/manage/data`, `/${org.slug}/manage/imports`, `/${org.slug}/manage/data`],
  };

  return ensureExecutableProposal({
    intentType,
    summary,
    requiredPermissions: peopleWritePermissions,
    changeset,
  });
}

export async function proposeAssignPlayerTeamAction(input: {
  context: AiResolvedContext;
  orgSlug: string;
  parameters: Record<string, unknown>;
  entitySelections: Record<string, string>;
}): Promise<AiProposal> {
  const intentType = "teams.assign_player";
  if (!hasAnyPermission(input.context, requiredPermissions)) {
    return noPermission(intentType, requiredPermissions);
  }

  const org = await getOrgBySlug(input.orgSlug);
  if (!org) {
    throw new Error("Organization not found.");
  }

  const [players, teams] = await Promise.all([listPlayers(org.id), listTeams(org.id)]);
  const freeText = `${cleanText(input.parameters.freeText)} ${cleanText(input.parameters.userMessage)} ${cleanText(input.parameters.playerName)} ${cleanText(input.parameters.teamName)}`;
  const playerNeedle = cleanText(input.parameters.playerName) || freeText;
  const teamNeedle = cleanText(input.parameters.teamName) || freeText;

  const selectedPlayerId = cleanText(input.entitySelections.player);
  const selectedTeamId = cleanText(input.entitySelections.team);

  const playerMatch =
    selectedPlayerId && players.find((player) => player.id === selectedPlayerId)
      ? { item: players.find((player) => player.id === selectedPlayerId) ?? null, score: 1, candidates: [] }
      : bestMatch(players, (player) => player.display_name || `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim(), playerNeedle);
  const teamMatch =
    selectedTeamId && teams.find((team) => team.id === selectedTeamId)
      ? { item: teams.find((team) => team.id === selectedTeamId) ?? null, score: 1, candidates: [] }
      : bestMatch(teams, (team) => team.name || team.team_code || team.id, teamNeedle);

  if (!playerMatch.item || !teamMatch.item) {
    return ensureExecutableProposal({
      intentType,
      summary: "Need both player and team before proposing execution.",
      requiredPermissions,
      changeset: null,
      ambiguity: {
        key: !playerMatch.item ? "player" : "team",
        title: !playerMatch.item ? "Choose player" : "Choose team",
        description: !playerMatch.item ? "Select the target player." : "Select the destination team.",
        candidates: (!playerMatch.item ? playerMatch.candidates : teamMatch.candidates).slice(0, 8),
      },
    });
  }

  const teamLabel = teamMatch.item.name || teamMatch.item.team_code || teamMatch.item.id;
  const summary = `Assign ${playerMatch.item.display_name} to ${teamLabel}.`;
  const changeset: AiChangesetV1 = {
    version: "v1",
    intentType,
    orgId: org.id,
    orgSlug: org.slug,
    summary,
    preconditions: [
      {
        table: "programs.program_teams",
        field: "id",
        expected: teamMatch.item.id,
        reason: "Team must still exist in this organization.",
      },
      {
        table: "people.profiles",
        field: "id",
        expected: playerMatch.item.id,
        reason: "Player must still exist in this organization.",
      },
    ],
    operations: [
      asOperationWhereSet(org.id, {
        action: "assign_player_team",
        player_id: playerMatch.item.id,
        team_id: teamMatch.item.id,
      }),
    ],
    revalidatePaths: [`/${org.slug}/workspace`, `/${org.slug}/manage/data`, `/${org.slug}/manage/imports`, `/${org.slug}/manage/data`],
  };

  return ensureExecutableProposal({
    intentType,
    summary,
    requiredPermissions,
    changeset,
  });
}

export async function proposeCreatePracticeAction(input: {
  context: AiResolvedContext;
  orgSlug: string;
  parameters: Record<string, unknown>;
  entitySelections: Record<string, string>;
}): Promise<AiProposal> {
  const intentType = "calendar.create_practice";
  if (!hasAnyPermission(input.context, requiredPermissions)) {
    return noPermission(intentType, requiredPermissions);
  }

  const org = await getOrgBySlug(input.orgSlug);
  if (!org) {
    throw new Error("Organization not found.");
  }

  const teams = await listTeams(org.id);
  const freeText = `${cleanText(input.parameters.freeText)} ${cleanText(input.parameters.userMessage)} ${cleanText(input.parameters.teamName)}`.trim();
  const selectedTeamId = cleanText(input.entitySelections.team);
  const teamMatch =
    selectedTeamId && teams.find((team) => team.id === selectedTeamId)
      ? { item: teams.find((team) => team.id === selectedTeamId) ?? null, score: 1, candidates: [] }
      : bestMatch(teams, (team) => team.name || team.team_code || team.id, cleanText(input.parameters.teamName) || freeText);

  const title = cleanText(input.parameters.title) || "Practice";
  const timezone = cleanText(input.parameters.timezone) || "UTC";
  const parsedTimes = parseDateTimeParts(freeText);
  const startsAt = cleanText(input.parameters.startsAt) || parsedTimes.startsAt;
  const endsAt = cleanText(input.parameters.endsAt) || parsedTimes.endsAt;
  const facilityId = cleanText(input.parameters.facilityId) || null;

  if (!teamMatch.item || !startsAt || !endsAt) {
    return ensureExecutableProposal({
      intentType,
      summary: "Need team, start time, and end time before proposing execution.",
      requiredPermissions,
      changeset: null,
      ambiguity: {
        key: !teamMatch.item ? "team" : "schedule",
        title: !teamMatch.item ? "Choose team" : "Missing schedule",
        description: !teamMatch.item ? "Select the host team for this practice." : "Provide startsAt and endsAt in ISO format.",
        candidates: teamMatch.candidates.slice(0, 8),
      },
    });
  }

  const teamLabel = teamMatch.item.name || teamMatch.item.team_code || teamMatch.item.id;
  const summary = `Create practice for ${teamLabel} from ${startsAt} to ${endsAt}.`;
  const changeset: AiChangesetV1 = {
    version: "v1",
    intentType,
    orgId: org.id,
    orgSlug: org.slug,
    summary,
    preconditions: [
      {
        table: "programs.program_teams",
        field: "id",
        expected: teamMatch.item.id,
        reason: "Team must still exist before creating this practice.",
      },
    ],
    operations: [
      asOperationWhereSet(org.id, {
        action: "create_practice",
        team_id: teamMatch.item.id,
        title,
        starts_at: startsAt,
        ends_at: endsAt,
        timezone,
        facility_id: facilityId,
      }),
    ],
    revalidatePaths: [`/${org.slug}/workspace`, `/${org.slug}/manage/data`, `/${org.slug}/manage/imports`, `/${org.slug}/manage/data`],
  };

  return ensureExecutableProposal({
    intentType,
    summary,
    requiredPermissions,
    changeset,
  });
}

export async function proposeCreateTeamAction(input: {
  context: AiResolvedContext;
  orgSlug: string;
  parameters: Record<string, unknown>;
  entitySelections: Record<string, string>;
}): Promise<AiProposal> {
  const intentType = "teams.create_team";
  if (!hasAnyPermission(input.context, requiredPermissions)) {
    return noPermission(intentType, requiredPermissions);
  }

  const org = await getOrgBySlug(input.orgSlug);
  if (!org) {
    throw new Error("Organization not found.");
  }

  const programs = await listPrograms(org.id);
  const selectedProgramId = cleanText(input.entitySelections.program) || cleanText(input.parameters.programId);
  const freeText = `${cleanText(input.parameters.freeText)} ${cleanText(input.parameters.userMessage)} ${cleanText(input.parameters.programName)}`.trim();
  const teamName = cleanText(input.parameters.name) || parseTeamName(freeText);
  const ageGroup = cleanText(input.parameters.ageGroup) || null;

  const programMatch =
    selectedProgramId && programs.find((program) => program.id === selectedProgramId)
      ? { item: programs.find((program) => program.id === selectedProgramId) ?? null, score: 1, candidates: [] }
      : bestMatch(programs, (program) => program.name, cleanText(input.parameters.programName) || freeText);

  if (!teamName || !programMatch.item) {
    return ensureExecutableProposal({
      intentType,
      summary: "Need team name and destination program before proposing execution.",
      requiredPermissions,
      changeset: null,
      ambiguity: {
        key: !programMatch.item ? "program" : "team_name",
        title: !programMatch.item ? "Choose program" : "Missing team name",
        description: !programMatch.item ? "Select the program that will contain this team." : "Provide a team name.",
        candidates: programMatch.candidates.slice(0, 8),
      },
      warnings: teamName ? [] : ["Team name was not detected in the request."],
    });
  }

  const summary = `Create team ${teamName} in program ${programMatch.item.name}.`;
  const changeset: AiChangesetV1 = {
    version: "v1",
    intentType,
    orgId: org.id,
    orgSlug: org.slug,
    summary,
    preconditions: [
      {
        table: "programs.programs",
        field: "id",
        expected: programMatch.item.id,
        reason: "Program must still exist before creating a team.",
      },
    ],
    operations: [
      asOperationWhereSet(org.id, {
        action: "create_team",
        name: teamName,
        slug: slugify(teamName),
        program_id: programMatch.item.id,
        age_group: ageGroup,
      }),
    ],
    revalidatePaths: [`/${org.slug}/workspace`, `/${org.slug}/manage/data`, `/${org.slug}/manage/imports`, `/${org.slug}/manage/data`],
  };

  return ensureExecutableProposal({
    intentType,
    summary,
    requiredPermissions,
    changeset,
  });
}

async function getSessionAccessToken() {
  const supabase = await createSupabaseServer();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error("Missing auth session.");
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (!sessionError && sessionData.session?.access_token) {
    return sessionData.session.access_token;
  }

  const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError || !refreshedData.session?.access_token) {
    throw new Error("Missing auth session.");
  }

  return refreshedData.session.access_token;
}

async function invokeWorkspaceEdgeAction(input: {
  orgId: string;
  action: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
}) {
  const accessToken = await getSessionAccessToken();
  const { supabaseUrl, supabasePublishableKey } = getSupabasePublicConfig();
  const response = await fetch(`${supabaseUrl}/functions/v1/ai-workspace-actions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: supabasePublishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: input.action,
      org_id: input.orgId,
      idempotency_key: input.idempotencyKey,
      ...input.payload,
    }),
    cache: "no-store",
  });

  const rawText = await response.text();
  const parsed = (() => {
    try {
      return JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      return {};
    }
  })();

  if (!response.ok) {
    const message = cleanText(parsed.error) || rawText || `Edge action ${input.action} failed`;
    throw new Error(message);
  }

  return parsed;
}

export async function executeWorkspaceChangeset(input: {
  context: AiResolvedContext;
  changeset: AiChangesetV1;
  execute: boolean;
}): Promise<AiExecutionResult> {
  const operation = input.changeset.operations[0];
  const action = cleanText(operation?.set?.action);
  if (!action) {
    throw new Error("Missing workspace action payload.");
  }

  if (!input.execute) {
    return {
      ok: true,
      summary: `Dry-run ready: ${input.changeset.summary}`,
      warnings: [],
      appliedChanges: 0,
    };
  }

  const payload: Record<string, unknown> = {
    ...operation.set,
  };
  delete payload.action;

  await invokeWorkspaceEdgeAction({
    orgId: input.changeset.orgId,
    action,
    payload,
    idempotencyKey: `${action}:${input.changeset.orgId}:${Date.now()}`,
  });

  return {
    ok: true,
    summary: input.changeset.summary,
    warnings: [],
    appliedChanges: 1,
  };
}
