"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { rethrowIfNavigationError } from "@/lib/actions/rethrowIfNavigationError";
import { requireAuth } from "@/lib/auth/requireAuth";
import { createOptionalSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import {
  createPlayerRecord,
  getPlayerById,
  linkPlayerGuardianRecord,
  listPlayerGuardians,
  listPlayersForGuardian,
  listPlayersForPicker,
  updatePlayerRecord
} from "@/modules/players/db/queries";
import type { PlayerGuardian, PlayerProfile } from "@/modules/players/types";

const textSchema = z.string().trim();

const createPlayerSchema = z.object({
  firstName: textSchema.min(1).max(80),
  lastName: textSchema.min(1).max(80),
  preferredName: textSchema.max(80).optional(),
  dateOfBirth: z.string().trim().optional(),
  gender: textSchema.max(40).optional(),
  jerseySize: textSchema.max(40).optional(),
  medicalNotes: textSchema.max(4000).optional(),
  birthCertificatePath: textSchema.max(500).optional()
});

const updatePlayerSchema = createPlayerSchema.extend({
  playerId: z.string().uuid()
});

const linkGuardianSchema = z.object({
  playerId: z.string().uuid(),
  email: z.string().trim().email(),
  relationship: textSchema.max(80).optional()
});

export type PlayersActionResult<TData = undefined> =
  | {
      ok: true;
      data: TData;
    }
  | {
      ok: false;
      error: string;
    };

function normalizeOptional(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function asError(error: string): PlayersActionResult<never> {
  return {
    ok: false,
    error
  };
}

async function listUsersByEmail(email: string): Promise<{ id: string; email: string | null } | null> {
  const serviceClient = createOptionalSupabaseServiceRoleClient();
  if (!serviceClient) {
    throw new Error("SERVICE_ROLE_MISSING");
  }

  const target = email.trim().toLowerCase();
  const perPage = 200;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await serviceClient.auth.admin.listUsers({
      page,
      perPage
    });

    if (error) {
      throw new Error(error.message);
    }

    const match = data.users.find((user) => (user.email ?? "").trim().toLowerCase() === target);
    if (match) {
      return {
        id: match.id,
        email: match.email ?? null
      };
    }

    if (data.users.length < perPage) {
      break;
    }
  }

  return null;
}

export async function listMyPlayersAction(): Promise<PlayersActionResult<{ players: PlayerProfile[] }>> {
  try {
    const user = await requireAuth();
    const players = await listPlayersForGuardian(user.id);

    return {
      ok: true,
      data: {
        players
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to load players right now.");
  }
}

export async function listMyPlayersForPickerAction(): Promise<PlayersActionResult<{ players: Awaited<ReturnType<typeof listPlayersForPicker>> }>> {
  try {
    const user = await requireAuth();
    const players = await listPlayersForPicker(user.id);

    return {
      ok: true,
      data: {
        players
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to load players right now.");
  }
}

export async function createPlayerAction(input: z.input<typeof createPlayerSchema>): Promise<PlayersActionResult<{ player: PlayerProfile }>> {
  const parsed = createPlayerSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Please provide a first and last name.");
  }

  try {
    const user = await requireAuth();
    const payload = parsed.data;
    const player = await createPlayerRecord({
      ownerUserId: user.id,
      firstName: payload.firstName,
      lastName: payload.lastName,
      preferredName: normalizeOptional(payload.preferredName),
      dateOfBirth: normalizeOptional(payload.dateOfBirth),
      gender: normalizeOptional(payload.gender),
      jerseySize: normalizeOptional(payload.jerseySize),
      medicalNotes: normalizeOptional(payload.medicalNotes),
      metadataJson: payload.birthCertificatePath
        ? {
            birthCertificatePath: payload.birthCertificatePath
          }
        : {}
    });

    revalidatePath("/account/players");

    return {
      ok: true,
      data: {
        player
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to create this player right now.");
  }
}

export async function updatePlayerAction(input: z.input<typeof updatePlayerSchema>): Promise<PlayersActionResult<{ player: PlayerProfile }>> {
  const parsed = updatePlayerSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Please review the player details.");
  }

  try {
    const user = await requireAuth();
    const payload = parsed.data;
    const player = await getPlayerById(payload.playerId);

    if (!player) {
      return asError("Player not found.");
    }

    const guardians = await listPlayerGuardians(payload.playerId);
    const canManage = guardians.some((guardian) => guardian.guardianUserId === user.id && guardian.canManage);

    if (!canManage) {
      return asError("You do not have permission to edit this player.");
    }

    const updated = await updatePlayerRecord({
      playerId: payload.playerId,
      firstName: payload.firstName,
      lastName: payload.lastName,
      preferredName: normalizeOptional(payload.preferredName),
      dateOfBirth: normalizeOptional(payload.dateOfBirth),
      gender: normalizeOptional(payload.gender),
      jerseySize: normalizeOptional(payload.jerseySize),
      medicalNotes: normalizeOptional(payload.medicalNotes)
    });

    revalidatePath("/account/players");

    return {
      ok: true,
      data: {
        player: updated
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to update this player right now.");
  }
}

export async function linkGuardianByEmailAction(input: z.input<typeof linkGuardianSchema>): Promise<PlayersActionResult<{ guardian: PlayerGuardian }>> {
  const parsed = linkGuardianSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Please provide a valid email.");
  }

  try {
    const user = await requireAuth();
    const payload = parsed.data;
    const guardians = await listPlayerGuardians(payload.playerId);
    const canManage = guardians.some((guardian) => guardian.guardianUserId === user.id && guardian.canManage);

    if (!canManage) {
      return asError("You do not have permission to manage guardians for this player.");
    }

    const authUser = await listUsersByEmail(payload.email);
    if (!authUser) {
      return asError("No account found with that email.");
    }

    const guardian = await linkPlayerGuardianRecord({
      playerId: payload.playerId,
      guardianUserId: authUser.id,
      relationship: normalizeOptional(payload.relationship)
    });

    revalidatePath("/account/players");

    return {
      ok: true,
      data: {
        guardian
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);

    if (error instanceof Error && error.message.includes("SERVICE_ROLE_MISSING")) {
      return asError("Guardian linking is unavailable because service role configuration is missing.");
    }

    return asError("Unable to link guardian right now.");
  }
}
