"use server";

import type { FacilityReservationReadModel } from "@/src/features/facilities/types";

type ActionError = { ok: false; error: string };
type ActionSuccess<T> = { ok: true; data: T };

type SpaceMutationResult = ActionSuccess<{ readModel: FacilityReservationReadModel }> | ActionError;

type CreateSpaceInput = {
  orgSlug: string;
  parentSpaceId: string | null;
  name: string;
  slug: string;
  spaceKind: "building" | "floor" | "room" | "field" | "court" | "custom";
  status: "open" | "closed" | "archived";
  isBookable: boolean;
  timezone: string;
  capacity: number | null;
  sortIndex: number;
  metadataJson?: Record<string, unknown>;
};

type UpdateSpaceInput = CreateSpaceInput & { spaceId: string };

function notImplemented(): ActionError {
  return {
    ok: false,
    error: "Facilities actions are temporarily disabled while canvas is being rebuilt."
  };
}

export async function createFacilitySpaceAction(_input: CreateSpaceInput): Promise<SpaceMutationResult> {
  return notImplemented();
}

export async function updateFacilitySpaceAction(_input: UpdateSpaceInput): Promise<SpaceMutationResult> {
  return notImplemented();
}

export async function archiveFacilitySpaceAction(_input: { orgSlug: string; spaceId: string }): Promise<SpaceMutationResult> {
  return notImplemented();
}

export async function toggleFacilitySpaceBookableAction(_input: {
  orgSlug: string;
  spaceId: string;
  isBookable: boolean;
}): Promise<SpaceMutationResult> {
  return notImplemented();
}

export async function toggleFacilitySpaceOpenClosedAction(_input: {
  orgSlug: string;
  spaceId: string;
  status: "open" | "closed" | "archived";
}): Promise<SpaceMutationResult> {
  return notImplemented();
}
