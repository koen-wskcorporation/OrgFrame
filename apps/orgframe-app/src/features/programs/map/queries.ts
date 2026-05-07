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
