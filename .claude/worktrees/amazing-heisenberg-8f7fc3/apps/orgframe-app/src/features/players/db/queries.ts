import { createSupabaseServer } from "@/src/shared/data-api/server";
import type { PlayerGuardian, PlayerPickerItem, PlayerProfile } from "@/src/features/players/types";

type ProfileRow = {
  id: string;
  person_user_id: string | null;
  org_id: string;
  profile_type: "player" | "staff";
  status: "draft" | "pending_claim" | "active" | "archived";
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  dob: string | null;
  metadata_json: unknown;
  created_at: string;
  updated_at: string;
};

type LinkRow = {
  id: string;
  org_id: string;
  account_user_id: string | null;
  profile_id: string;
  relationship_type: "self" | "guardian" | "delegated_manager";
  can_manage: boolean;
  pending_invite_email: string | null;
  invite_status: "none" | "pending" | "accepted" | "expired" | "cancelled";
  created_at: string;
};

const profileSelect =
  "id, person_user_id, org_id, profile_type, status, display_name, first_name, last_name, dob, metadata_json, created_at, updated_at";
const linkSelect = "id, org_id, account_user_id, profile_id, relationship_type, can_manage, pending_invite_email, invite_status, created_at";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function readString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function mapPlayer(row: ProfileRow): PlayerProfile {
  const metadata = asObject(row.metadata_json);
  return {
    id: row.id,
    ownerUserId: row.person_user_id ?? "",
    firstName: row.first_name ?? row.display_name.split(" ")[0] ?? "",
    lastName: row.last_name ?? row.display_name.split(" ").slice(1).join(" ") ?? "",
    preferredName: readString(metadata, "preferredName"),
    dateOfBirth: row.dob,
    gender: readString(metadata, "gender"),
    jerseySize: readString(metadata, "jerseySize"),
    medicalNotes: readString(metadata, "medicalNotes"),
    metadataJson: metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapGuardian(row: LinkRow): PlayerGuardian {
  return {
    id: row.id,
    playerId: row.profile_id,
    guardianUserId: row.account_user_id ?? "",
    relationship: row.relationship_type,
    canManage: row.can_manage,
    createdAt: row.created_at
  };
}

export async function listPlayersForGuardian(userId: string): Promise<PlayerProfile[]> {
  const supabase = await createSupabaseServer();
  const { data: links, error: linksError } = await supabase
    .schema("people")
    .from("profile_links")
    .select(linkSelect)
    .eq("account_user_id", userId)
    .in("relationship_type", ["self", "guardian", "delegated_manager"])
    .order("created_at", { ascending: true });

  if (linksError) {
    throw new Error(`Failed to list player links: ${linksError.message}`);
  }

  const profileIds = Array.from(new Set((links ?? []).map((row) => (row as LinkRow).profile_id)));
  if (profileIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .schema("people")
    .from("profiles")
    .select(profileSelect)
    .in("id", profileIds)
    .eq("profile_type", "player")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) {
    throw new Error(`Failed to list players: ${error.message}`);
  }

  return (data ?? []).map((row) => mapPlayer(row as ProfileRow));
}

export async function listPlayersForPicker(userId: string): Promise<PlayerPickerItem[]> {
  const players = await listPlayersForGuardian(userId);

  return players.map((player) => ({
    id: player.id,
    label: `${player.firstName} ${player.lastName}`.trim(),
    subtitle: player.dateOfBirth ? `DOB: ${player.dateOfBirth}` : null
  }));
}

export async function getPlayerById(playerId: string): Promise<PlayerProfile | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.schema("people").from("profiles").select(profileSelect).eq("id", playerId).maybeSingle();

  if (error) {
    throw new Error(`Failed to load player: ${error.message}`);
  }

  if (!data || (data as ProfileRow).profile_type !== "player") {
    return null;
  }

  return mapPlayer(data as ProfileRow);
}

async function resolveDefaultOrgIdForUser(userId: string): Promise<string> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("orgs")
    .from("memberships")
    .select("org_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve organization context: ${error.message}`);
  }

  if (!data?.org_id) {
    throw new Error("No organization membership found for this account.");
  }

  return data.org_id;
}

export async function createPlayerRecord(input: {
  ownerUserId: string;
  orgId?: string | null;
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
  const orgId = input.orgId ?? (await resolveDefaultOrgIdForUser(input.ownerUserId));

  const metadata = {
    ...(input.metadataJson ?? {}),
    ...(input.preferredName ? { preferredName: input.preferredName } : {}),
    ...(input.gender ? { gender: input.gender } : {}),
    ...(input.jerseySize ? { jerseySize: input.jerseySize } : {}),
    ...(input.medicalNotes ? { medicalNotes: input.medicalNotes } : {})
  };

  const displayName = `${input.firstName} ${input.lastName}`.trim();

  const { data, error } = await supabase
    .schema("people")
    .from("profiles")
    .insert({
      person_user_id: input.ownerUserId,
      org_id: orgId,
      profile_type: "player",
      status: "active",
      display_name: displayName,
      first_name: input.firstName,
      last_name: input.lastName,
      dob: input.dateOfBirth,
      metadata_json: metadata
    })
    .select(profileSelect)
    .single();

  if (error) {
    throw new Error(`Failed to create player: ${error.message}`);
  }

  const player = mapPlayer(data as ProfileRow);

  await supabase.schema("people").from("profile_links").upsert(
    {
      org_id: orgId,
      account_user_id: input.ownerUserId,
      profile_id: player.id,
      relationship_type: "self",
      can_manage: true,
      invite_status: "accepted"
    },
    {
      onConflict: "org_id,account_user_id,profile_id,relationship_type"
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
  const current = await getPlayerById(input.playerId);
  if (!current) {
    throw new Error("Player not found.");
  }

  const metadata = {
    ...current.metadataJson,
    ...(input.metadataJson ?? {}),
    preferredName: input.preferredName,
    gender: input.gender,
    jerseySize: input.jerseySize,
    medicalNotes: input.medicalNotes
  };

  const { data, error } = await supabase
    .schema("people")
    .from("profiles")
    .update({
      display_name: `${input.firstName} ${input.lastName}`.trim(),
      first_name: input.firstName,
      last_name: input.lastName,
      dob: input.dateOfBirth,
      metadata_json: metadata
    })
    .eq("id", input.playerId)
    .eq("profile_type", "player")
    .select(profileSelect)
    .single();

  if (error) {
    throw new Error(`Failed to update player: ${error.message}`);
  }

  return mapPlayer(data as ProfileRow);
}

export async function listPlayerGuardians(playerId: string): Promise<PlayerGuardian[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("people")
    .from("profile_links")
    .select(linkSelect)
    .eq("profile_id", playerId)
    .in("relationship_type", ["self", "guardian", "delegated_manager"])
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list player guardians: ${error.message}`);
  }

  return (data ?? []).map((row) => mapGuardian(row as LinkRow));
}

export async function linkPlayerGuardianRecord(input: {
  playerId: string;
  guardianUserId: string;
  relationship: string | null;
}): Promise<PlayerGuardian> {
  const supabase = await createSupabaseServer();

  const { data: playerRow, error: playerError } = await supabase
    .schema("people")
    .from("profiles")
    .select("id, org_id")
    .eq("id", input.playerId)
    .single();

  if (playerError) {
    throw new Error(`Failed to load player profile context: ${playerError.message}`);
  }

  const relationship = input.relationship === "self" ? "self" : "guardian";

  const { data, error } = await supabase
    .schema("people")
    .from("profile_links")
    .upsert(
      {
        org_id: playerRow.org_id,
        account_user_id: input.guardianUserId,
        profile_id: input.playerId,
        relationship_type: relationship,
        can_manage: true,
        invite_status: "accepted"
      },
      {
        onConflict: "org_id,account_user_id,profile_id,relationship_type"
      }
    )
    .select(linkSelect)
    .single();

  if (error) {
    throw new Error(`Failed to link guardian: ${error.message}`);
  }

  return mapGuardian(data as LinkRow);
}
