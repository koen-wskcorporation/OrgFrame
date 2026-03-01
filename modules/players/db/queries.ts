import { createSupabaseServer } from "@/lib/supabase/server";
import type { PlayerGuardian, PlayerPickerItem, PlayerProfile } from "@/modules/players/types";

const playerSelect =
  "id, owner_user_id, first_name, last_name, preferred_name, date_of_birth, gender, jersey_size, medical_notes, metadata_json, created_at, updated_at";
const guardianSelect = "id, player_id, guardian_user_id, relationship, can_manage, created_at";

type PlayerRow = {
  id: string;
  owner_user_id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
  jersey_size: string | null;
  medical_notes: string | null;
  metadata_json: unknown;
  created_at: string;
  updated_at: string;
};

type GuardianRow = {
  id: string;
  player_id: string;
  guardian_user_id: string;
  relationship: string | null;
  can_manage: boolean;
  created_at: string;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function mapPlayer(row: PlayerRow): PlayerProfile {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    preferredName: row.preferred_name,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    jerseySize: row.jersey_size,
    medicalNotes: row.medical_notes,
    metadataJson: asObject(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapGuardian(row: GuardianRow): PlayerGuardian {
  return {
    id: row.id,
    playerId: row.player_id,
    guardianUserId: row.guardian_user_id,
    relationship: row.relationship,
    canManage: row.can_manage,
    createdAt: row.created_at
  };
}

export async function listPlayersForGuardian(userId: string): Promise<PlayerProfile[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("players")
    .select(`${playerSelect}, player_guardians!inner(guardian_user_id)`)
    .eq("player_guardians.guardian_user_id", userId)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) {
    throw new Error(`Failed to list players: ${error.message}`);
  }

  return (data ?? []).map((row) => mapPlayer(row as PlayerRow));
}

export async function listPlayersForPicker(userId: string): Promise<PlayerPickerItem[]> {
  const players = await listPlayersForGuardian(userId);

  return players.map((player) => ({
    id: player.id,
    label: `${player.firstName} ${player.lastName}`,
    subtitle: player.dateOfBirth ? `DOB: ${player.dateOfBirth}` : null
  }));
}

export async function getPlayerById(playerId: string): Promise<PlayerProfile | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("players").select(playerSelect).eq("id", playerId).maybeSingle();

  if (error) {
    throw new Error(`Failed to load player: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return mapPlayer(data as PlayerRow);
}

export async function createPlayerRecord(input: {
  ownerUserId: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  jerseySize: string | null;
  medicalNotes: string | null;
  metadataJson?: Record<string, unknown>;
}): Promise<PlayerProfile> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("players")
    .insert({
      owner_user_id: input.ownerUserId,
      first_name: input.firstName,
      last_name: input.lastName,
      preferred_name: input.preferredName,
      date_of_birth: input.dateOfBirth,
      gender: input.gender,
      jersey_size: input.jerseySize,
      medical_notes: input.medicalNotes,
      metadata_json: input.metadataJson ?? {}
    })
    .select(playerSelect)
    .single();

  if (error) {
    throw new Error(`Failed to create player: ${error.message}`);
  }

  const player = mapPlayer(data as PlayerRow);

  await supabase.from("player_guardians").upsert(
    {
      player_id: player.id,
      guardian_user_id: input.ownerUserId,
      relationship: "owner",
      can_manage: true
    },
    {
      onConflict: "player_id,guardian_user_id"
    }
  );

  return player;
}

export async function updatePlayerRecord(input: {
  playerId: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  jerseySize: string | null;
  medicalNotes: string | null;
  metadataJson?: Record<string, unknown>;
}): Promise<PlayerProfile> {
  const supabase = await createSupabaseServer();
  const updatePayload: Record<string, unknown> = {
    first_name: input.firstName,
    last_name: input.lastName,
    preferred_name: input.preferredName,
    date_of_birth: input.dateOfBirth,
    gender: input.gender,
    jersey_size: input.jerseySize,
    medical_notes: input.medicalNotes
  };

  if (input.metadataJson !== undefined) {
    updatePayload.metadata_json = input.metadataJson;
  }

  const { data, error } = await supabase
    .from("players")
    .update(updatePayload)
    .eq("id", input.playerId)
    .select(playerSelect)
    .single();

  if (error) {
    throw new Error(`Failed to update player: ${error.message}`);
  }

  return mapPlayer(data as PlayerRow);
}

export async function listPlayerGuardians(playerId: string): Promise<PlayerGuardian[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("player_guardians")
    .select(guardianSelect)
    .eq("player_id", playerId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list player guardians: ${error.message}`);
  }

  return (data ?? []).map((row) => mapGuardian(row as GuardianRow));
}

export async function linkPlayerGuardianRecord(input: {
  playerId: string;
  guardianUserId: string;
  relationship: string | null;
}): Promise<PlayerGuardian> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("player_guardians")
    .upsert(
      {
        player_id: input.playerId,
        guardian_user_id: input.guardianUserId,
        relationship: input.relationship,
        can_manage: true
      },
      {
        onConflict: "player_id,guardian_user_id"
      }
    )
    .select(guardianSelect)
    .single();

  if (error) {
    throw new Error(`Failed to link guardian: ${error.message}`);
  }

  return mapGuardian(data as GuardianRow);
}
