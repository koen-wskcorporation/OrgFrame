import { createSupabaseServer } from "@/src/shared/data-api/server";
import type { AssignmentCandidate } from "@/src/features/programs/map/types";

/**
 * Map a team-kind division (`programs.divisions.id` where node_kind='team') to
 * its `program_teams.id`. The map editor stores positions on the division
 * row, but team-roster operations target the team row.
 */
export async function getTeamIdByNodeIdMap(programId: string): Promise<Map<string, string>> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("programs").from("program_teams")
    .select("id, program_node_id")
    .eq("program_id", programId);

  if (error) {
    throw new Error(`Failed to load program teams: ${error.message}`);
  }

  const result = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.program_node_id && row.id) {
      result.set(row.program_node_id, row.id);
    }
  }
  return result;
}

type PlayerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  date_of_birth: string | null;
};

function buildLabel(player: PlayerRow | undefined, fallbackPlayerId: string): {
  label: string;
  subtitle: string | null;
} {
  if (!player) {
    return { label: `Player ${fallbackPlayerId.slice(0, 6)}`, subtitle: null };
  }
  const first = player.first_name ?? "";
  const last = player.last_name ?? "";
  const preferred = player.preferred_name ?? "";
  const label = `${first} ${last}`.trim() || preferred || `Player ${player.id.slice(0, 6)}`;
  return {
    label,
    subtitle: player.date_of_birth ? `DOB: ${player.date_of_birth}` : null
  };
}

/**
 * Players registered for the program who aren't yet on a team. Done as two
 * separate fetches rather than the implicit `players(...)` join used by the
 * teams feature, because the FK relationship between `programs.program_registrations`
 * and `public.players` isn't always present in the PostgREST schema cache
 * (different schemas) — the implicit join 500s with a "could not find a
 * relationship" error in some environments.
 */
export async function listUnassignedPlayerDockItems(programId: string): Promise<AssignmentCandidate[]> {
  const supabase = await createSupabaseServer();

  const { data: members, error: membersError } = await supabase
    .schema("programs").from("program_team_members")
    .select("player_id, status")
    .eq("program_id", programId);

  if (membersError) {
    throw new Error(`Failed to load team members: ${membersError.message}`);
  }

  const excluded = new Set<string>();
  for (const row of members ?? []) {
    if (row.player_id && row.status !== "removed") {
      excluded.add(row.player_id);
    }
  }

  const { data: registrations, error: regError } = await supabase
    .schema("programs").from("program_registrations")
    .select("id, status, player_id")
    .eq("program_id", programId)
    .in("status", ["submitted", "in_review", "approved", "waitlisted"])
    .order("created_at", { ascending: false });

  if (regError) {
    throw new Error(`Failed to load registrations: ${regError.message}`);
  }

  const candidates: { playerId: string; registrationId: string | null }[] = [];
  const seen = new Set<string>();
  for (const row of registrations ?? []) {
    if (!row.player_id) continue;
    if (excluded.has(row.player_id)) continue;
    if (seen.has(row.player_id)) continue;
    seen.add(row.player_id);
    candidates.push({ playerId: row.player_id, registrationId: row.id ?? null });
  }

  if (candidates.length === 0) return [];

  const playerIds = candidates.map((c) => c.playerId);
  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, first_name, last_name, preferred_name, date_of_birth")
    .in("id", playerIds);

  if (playersError) {
    throw new Error(`Failed to load player profiles: ${playersError.message}`);
  }

  const playersById = new Map<string, PlayerRow>();
  for (const player of (players as PlayerRow[] | null) ?? []) {
    playersById.set(player.id, player);
  }

  return candidates.map((candidate) => {
    const meta = buildLabel(playersById.get(candidate.playerId), candidate.playerId);
    return {
      kind: "player" as const,
      id: `player:${candidate.playerId}`,
      label: meta.label,
      subtitle: meta.subtitle,
      playerId: candidate.playerId,
      registrationId: candidate.registrationId
    };
  });
}

/**
 * Coach registrations don't exist in the schema yet — this stub returns []
 * so the dock renders an empty Coaches tab. When the
 * `program_coach_registrations` table lands, swap the body with a query
 * mirroring `listUnassignedPlayerDockItems` and items will surface automatically.
 */
export async function listUnassignedCoachDockItems(_programId: string): Promise<AssignmentCandidate[]> {
  return [];
}

export type ProgramMapNodeCounts = {
  /** Team-level counts: players on the team, staff on the team. */
  teams: Record<string, { memberCount: number; staffCount: number }>;
  /** Division-level counts derived from registrations + team rosters. */
  divisions: Record<string, { assignedCount: number; unassignedCount: number }>;
};

/**
 * Per-node player/staff counts shown on the program map.
 *
 * Team: count of active members + count of staff.
 *
 * Division: `assigned` = number of distinct players currently on a team
 * inside this division; `unassigned` = number of distinct players with an
 * active registration targeting this division (or one of its teams) who
 * aren't yet on any team in the program.
 */
export async function getProgramMapNodeCounts(programId: string): Promise<ProgramMapNodeCounts> {
  const supabase = await createSupabaseServer();

  const [{ data: nodeRows, error: nodeError }, { data: memberRows, error: memberError }, { data: staffRows, error: staffError }, { data: regRows, error: regError }] =
    await Promise.all([
      supabase
        .schema("programs").from("divisions")
        .select("id, parent_id, node_kind")
        .eq("program_id", programId),
      supabase
        .schema("programs").from("program_team_members")
        .select("team_id, player_id, status")
        .eq("program_id", programId),
      supabase
        .schema("programs").from("program_team_staff")
        .select("team_id")
        .eq("program_id", programId),
      supabase
        .schema("programs").from("program_registrations")
        .select("player_id, program_node_id, status")
        .eq("program_id", programId)
        .in("status", ["submitted", "in_review", "approved", "waitlisted"])
    ]);

  if (nodeError) throw new Error(`Failed to load nodes: ${nodeError.message}`);
  if (memberError) throw new Error(`Failed to load roster: ${memberError.message}`);
  if (staffError) throw new Error(`Failed to load team staff: ${staffError.message}`);
  if (regError) throw new Error(`Failed to load registrations: ${regError.message}`);

  const teams: ProgramMapNodeCounts["teams"] = {};
  const divisions: ProgramMapNodeCounts["divisions"] = {};

  // Build node-kind / parent maps so we can roll counts up to divisions.
  // The teams table on the map uses `divisions.id` as the team-row id —
  // `program_team_members.team_id` references `program_teams.id`. We need
  // a translation map: nodeId (division row with node_kind='team') →
  // program_teams.id, and vice versa.
  const { data: programTeamRows } = await supabase
    .schema("programs").from("program_teams")
    .select("id, program_node_id")
    .eq("program_id", programId);
  const nodeIdByTeamId = new Map<string, string>();
  for (const row of programTeamRows ?? []) {
    if (row.id && row.program_node_id) {
      nodeIdByTeamId.set(row.id, row.program_node_id);
    }
  }

  const parentByNodeId = new Map<string, string | null>();
  for (const row of nodeRows ?? []) {
    parentByNodeId.set(row.id, row.parent_id ?? null);
    if (row.node_kind === "team") {
      teams[row.id] = { memberCount: 0, staffCount: 0 };
    } else if (row.node_kind === "division") {
      divisions[row.id] = { assignedCount: 0, unassignedCount: 0 };
    }
  }

  // Track which players are currently on a team — used to classify
  // "assigned" vs "unassigned" registrations.
  const playersOnATeam = new Set<string>();

  for (const row of memberRows ?? []) {
    if (!row.team_id || row.status === "removed") continue;
    const nodeId = nodeIdByTeamId.get(row.team_id);
    if (!nodeId) continue;
    if (!teams[nodeId]) teams[nodeId] = { memberCount: 0, staffCount: 0 };
    teams[nodeId].memberCount += 1;
    if (row.player_id) playersOnATeam.add(row.player_id);

    // Roll up to the team's parent division.
    const parent = parentByNodeId.get(nodeId) ?? null;
    if (parent && divisions[parent]) {
      divisions[parent].assignedCount += 1;
    }
  }

  for (const row of staffRows ?? []) {
    if (!row.team_id) continue;
    const nodeId = nodeIdByTeamId.get(row.team_id);
    if (!nodeId) continue;
    if (!teams[nodeId]) teams[nodeId] = { memberCount: 0, staffCount: 0 };
    teams[nodeId].staffCount += 1;
  }

  // Unassigned: a registration targeting a division (or a team within it)
  // whose player isn't yet on any team. We dedupe by player so the count
  // matches "people in the division pool waiting for a team."
  const unassignedPlayersByDivision = new Map<string, Set<string>>();
  for (const row of regRows ?? []) {
    if (!row.player_id) continue;
    if (playersOnATeam.has(row.player_id)) continue;
    const targetNodeId = row.program_node_id ?? null;
    if (!targetNodeId) continue;
    // Resolve the division this registration belongs to.
    let divisionId: string | null = null;
    if (divisions[targetNodeId]) {
      divisionId = targetNodeId;
    } else if (teams[targetNodeId]) {
      divisionId = parentByNodeId.get(targetNodeId) ?? null;
    }
    if (!divisionId || !divisions[divisionId]) continue;
    const set = unassignedPlayersByDivision.get(divisionId) ?? new Set<string>();
    set.add(row.player_id);
    unassignedPlayersByDivision.set(divisionId, set);
  }
  for (const [divisionId, players] of unassignedPlayersByDivision.entries()) {
    divisions[divisionId].unassignedCount = players.size;
  }

  return { teams, divisions };
}
