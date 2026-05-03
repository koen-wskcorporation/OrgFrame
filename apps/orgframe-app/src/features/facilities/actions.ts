"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { can } from "@/src/shared/permissions/can";
import { rethrowIfNavigationError } from "@/src/shared/navigation/rethrowIfNavigationError";
import {
  BUILT_IN_FACILITY_SPACE_STATUSES,
  createFacilityRecord,
  createFacilitySpaceRecord,
  deleteFacilityRecord,
  deleteFacilitySpaceRecord,
  getFacilityById,
  getFacilitySpaceById,
  listFacilitiesForManage,
  listFacilityReservationReadModel,
  listFacilitySpacesForManage,
  updateFacilityRecord,
  updateFacilitySpaceMapRecord,
  updateFacilitySpaceRecord
} from "@/src/features/facilities/db/queries";
import type { Facility, FacilitySpace, FacilitySpaceKind } from "@/src/features/facilities/types";
import { isKindBookable } from "@/src/features/facilities/lib/spaceKindIcon";

const textSchema = z.string().trim();
const uuidSchema = z.string().uuid();

const facilitySpaceSchema = z.object({
  orgSlug: textSchema.min(1),
  spaceId: uuidSchema.optional(),
  /** Required for create; for update we look it up from the existing row. */
  facilityId: uuidSchema.optional(),
  parentSpaceId: uuidSchema.nullable().optional(),
  name: textSchema.min(2).max(120),
  slug: textSchema.min(2).max(120),
  spaceKind: z.enum([
    "building",
    "field",
    "court",
    "pavilion",
    "concessions",
    "lobby",
    "bathroom",
    "storage",
    "parking_lot",
    "custom"
  ]),
  /**
   * Optional `status` mapped to one of the built-in values. Callers that
   * use the new statusId picker can omit this; we then derive the row's
   * `status` column from the chosen status definition's `behavesAs`.
   */
  status: z.enum(["open", "closed", "archived"]).optional(),
  /** Org-customizable status definition id (built-ins: open/closed/archived). */
  statusId: textSchema.min(1).nullable().optional(),
  isBookable: z.boolean(),
  timezone: textSchema.min(1).max(80),
  capacity: z.number().int().min(0).nullable().optional(),
  sortIndex: z.number().int().min(0).optional(),
  statusLabels: z
    .object({
      open: z.string().optional(),
      closed: z.string().optional(),
      archived: z.string().optional()
    })
    .optional()
});

/**
 * Build the `metadata_json` payload for a space. Currently only carries
 * the org-customizable `statusId` until its dedicated column lands.
 * Geo and environment now live on the parent `Facility`.
 */
function mergeMetadataForSpace(
  previous: Record<string, unknown>,
  patch: { statusId?: string | null }
) {
  const next: Record<string, unknown> = { ...previous };
  if (patch.statusId !== undefined) next.statusId = patch.statusId;
  return next;
}

/** Resolve a chosen `statusId` to the underlying `status` column value. */
function resolveStatusFromStatusId(statusId: string | null | undefined, fallback: "open" | "closed" | "archived"): "open" | "closed" | "archived" {
  if (!statusId) return fallback;
  const def = BUILT_IN_FACILITY_SPACE_STATUSES.find((s) => s.id === statusId);
  if (def) return def.behavesAs;
  return fallback;
}

const toggleSchema = z.object({
  orgSlug: textSchema.min(1),
  spaceId: uuidSchema
});

const setStatusSchema = z.object({
  orgSlug: textSchema.min(1),
  spaceId: uuidSchema,
  status: z.enum(["open", "closed", "archived"])
});

const mapPointSchema = z.object({
  x: z.number(),
  y: z.number(),
  smooth: z.boolean().optional()
});

const saveFacilityMapSchema = z.object({
  orgSlug: textSchema.min(1),
  facilityId: uuidSchema,
  /**
   * Spaces created locally in this editor session that need a server row.
   * The client supplies the UUID so the round-trip stays simple — no
   * tempId-to-realId remap. The server accepts it verbatim (postgres takes
   * client-supplied UUIDs).
   */
  creates: z
    .array(
      z.object({
        id: uuidSchema,
        name: textSchema.min(1).max(120),
        spaceKind: z.enum([
          "building", "field", "court", "pavilion", "concessions",
          "lobby", "bathroom", "storage", "parking_lot", "custom"
        ]),
        statusId: textSchema.min(1).nullable().optional(),
        isBookable: z.boolean(),
        timezone: textSchema.min(1).max(80),
        capacity: z.number().int().min(0).nullable().optional(),
        sortIndex: z.number().int().min(0).optional(),
        points: z.array(mapPointSchema).min(3),
        zIndex: z.number().int()
      })
    )
    .default([]),
  /** Geometry-only updates to existing spaces. */
  updates: z
    .array(
      z.object({
        id: uuidSchema,
        points: z.array(mapPointSchema).min(3),
        zIndex: z.number().int()
      })
    )
    .default([]),
  /** Space ids to hard-delete (cascades to all child data via FK). */
  deletes: z.array(uuidSchema).default([])
});

export type FacilitiesActionResult<TData = undefined> =
  | {
      ok: true;
      data: TData;
    }
  | {
      ok: false;
      error: string;
    };

function asError(error: string): FacilitiesActionResult<never> {
  return { ok: false, error };
}

async function requireFacilitiesReadOrWrite(orgSlug: string) {
  const org = await getOrgAuthContext(orgSlug);
  const hasAccess = can(org.membershipPermissions, "facilities.read") || can(org.membershipPermissions, "facilities.write");
  if (!hasAccess) {
    throw new Error("FORBIDDEN");
  }
  return org;
}

async function requireFacilitiesWrite(orgSlug: string) {
  const org = await getOrgAuthContext(orgSlug);
  const hasAccess = can(org.membershipPermissions, "facilities.write");
  if (!hasAccess) {
    throw new Error("FORBIDDEN");
  }
  return org;
}

type SpaceMutationResult = FacilitiesActionResult<{
  readModel: Awaited<ReturnType<typeof listFacilityReservationReadModel>>;
  space: FacilitySpace;
}> & { fieldErrors?: Record<string, string> };

// ---- Facility (top-level container) CRUD --------------------------------
//
// A Facility is the real-world venue. It used to be a top-level row in the
// `spaces` table — see migration 202605030001 for the split.

const facilitySchema = z.object({
  orgSlug: textSchema.min(1),
  facilityId: uuidSchema.optional(),
  name: textSchema.min(2).max(120),
  slug: textSchema.min(2).max(120),
  status: z.enum(["active", "archived"]).optional(),
  timezone: textSchema.min(1).max(80).optional(),
  environment: z.enum(["indoor", "outdoor"]).optional(),
  geoAnchorLat: z.number().nullable().optional(),
  geoAnchorLng: z.number().nullable().optional(),
  geoAddress: z.string().nullable().optional(),
  geoShowMap: z.boolean().optional(),
  sortIndex: z.number().int().min(0).optional()
});

type FacilityMutationResult = FacilitiesActionResult<{
  readModel: Awaited<ReturnType<typeof listFacilityReservationReadModel>>;
  facility: Facility;
}> & { fieldErrors?: Record<string, string> };

export async function createFacilityAction(input: z.input<typeof facilitySchema>): Promise<FacilityMutationResult> {
  const parsed = facilitySchema.safeParse(input);
  if (!parsed.success) return asError("Please review the facility details.");
  try {
    const org = await requireFacilitiesWrite(parsed.data.orgSlug);
    const created = await createFacilityRecord({
      orgId: org.orgId,
      name: parsed.data.name,
      slug: parsed.data.slug,
      status: parsed.data.status ?? "active",
      timezone: parsed.data.timezone ?? "UTC",
      environment: parsed.data.environment ?? "outdoor",
      geoAnchorLat: parsed.data.geoAnchorLat ?? null,
      geoAnchorLng: parsed.data.geoAnchorLng ?? null,
      geoAddress: parsed.data.geoAddress ?? null,
      geoShowMap: parsed.data.geoShowMap ?? false,
      sortIndex: parsed.data.sortIndex
    });
    const readModel = await listFacilityReservationReadModel(org.orgId);
    revalidatePath(`/${org.orgSlug}/manage/facilities`);
    return { ok: true, data: { readModel, facility: readModel.facilities.find((f) => f.id === created.id) ?? created } };
  } catch (error) {
    rethrowIfNavigationError(error);
    const message = error instanceof Error ? error.message : "Unable to create the facility.";
    if (message.toLowerCase().includes("slug")) {
      return { ok: false, error: message, fieldErrors: { slug: message } };
    }
    return asError("Unable to create the facility.");
  }
}

export async function updateFacilityAction(input: z.input<typeof facilitySchema>): Promise<FacilityMutationResult> {
  const parsed = facilitySchema.safeParse(input);
  if (!parsed.success || !parsed.data.facilityId) return asError("Please review the facility details.");
  try {
    const org = await requireFacilitiesWrite(parsed.data.orgSlug);
    const existing = await getFacilityById(org.orgId, parsed.data.facilityId);
    if (!existing) return asError("Facility not found.");
    const updated = await updateFacilityRecord({
      orgId: org.orgId,
      facilityId: existing.id,
      name: parsed.data.name,
      slug: parsed.data.slug,
      status: parsed.data.status ?? existing.status,
      timezone: parsed.data.timezone ?? existing.timezone,
      environment: parsed.data.environment ?? existing.environment,
      geoAnchorLat: parsed.data.geoAnchorLat !== undefined ? parsed.data.geoAnchorLat : existing.geoAnchorLat,
      geoAnchorLng: parsed.data.geoAnchorLng !== undefined ? parsed.data.geoAnchorLng : existing.geoAnchorLng,
      geoAddress: parsed.data.geoAddress !== undefined ? parsed.data.geoAddress : existing.geoAddress,
      geoShowMap: parsed.data.geoShowMap !== undefined ? parsed.data.geoShowMap : existing.geoShowMap,
      metadataJson: existing.metadataJson,
      sortIndex: parsed.data.sortIndex
    });
    const readModel = await listFacilityReservationReadModel(org.orgId);
    revalidatePath(`/${org.orgSlug}/manage/facilities`);
    return { ok: true, data: { readModel, facility: readModel.facilities.find((f) => f.id === updated.id) ?? updated } };
  } catch (error) {
    rethrowIfNavigationError(error);
    const message = error instanceof Error ? error.message : "Unable to update the facility.";
    if (message.toLowerCase().includes("slug")) {
      return { ok: false, error: message, fieldErrors: { slug: message } };
    }
    return asError("Unable to update the facility.");
  }
}

const deleteFacilityActionSchema = z.object({
  orgSlug: textSchema.min(1),
  facilityId: uuidSchema
});

export async function deleteFacilityAction(input: z.input<typeof deleteFacilityActionSchema>): Promise<FacilitiesActionResult<{ readModel: Awaited<ReturnType<typeof listFacilityReservationReadModel>> }>> {
  const parsed = deleteFacilityActionSchema.safeParse(input);
  if (!parsed.success) return asError("Invalid delete request.");
  try {
    const org = await requireFacilitiesWrite(parsed.data.orgSlug);
    await deleteFacilityRecord({ orgId: org.orgId, facilityId: parsed.data.facilityId });
    const readModel = await listFacilityReservationReadModel(org.orgId);
    revalidatePath(`/${org.orgSlug}/manage/facilities`);
    return { ok: true, data: { readModel } };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to delete the facility.");
  }
}

const archiveFacilityActionSchema = z.object({
  orgSlug: textSchema.min(1),
  facilityId: uuidSchema
});

export async function archiveFacilityAction(input: z.input<typeof archiveFacilityActionSchema>): Promise<FacilityMutationResult> {
  const parsed = archiveFacilityActionSchema.safeParse(input);
  if (!parsed.success) return asError("Invalid archive request.");
  try {
    const org = await requireFacilitiesWrite(parsed.data.orgSlug);
    const existing = await getFacilityById(org.orgId, parsed.data.facilityId);
    if (!existing) return asError("Facility not found.");
    const updated = await updateFacilityRecord({
      orgId: org.orgId,
      facilityId: existing.id,
      name: existing.name,
      slug: existing.slug,
      status: "archived",
      timezone: existing.timezone,
      environment: existing.environment,
      geoAnchorLat: existing.geoAnchorLat,
      geoAnchorLng: existing.geoAnchorLng,
      geoAddress: existing.geoAddress,
      geoShowMap: existing.geoShowMap,
      metadataJson: existing.metadataJson
    });
    const readModel = await listFacilityReservationReadModel(org.orgId);
    revalidatePath(`/${org.orgSlug}/manage/facilities`);
    return { ok: true, data: { readModel, facility: readModel.facilities.find((f) => f.id === updated.id) ?? updated } };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to archive the facility.");
  }
}

// ---- Facility-space (shape on a facility's map) CRUD --------------------

export async function createFacilitySpaceAction(input: z.input<typeof facilitySpaceSchema>): Promise<SpaceMutationResult> {
  const parsed = facilitySpaceSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Please review the facility details.");
  }

  try {
    const org = await requireFacilitiesWrite(parsed.data.orgSlug);
    const fallbackStatus = parsed.data.status ?? "open";
    const status = resolveStatusFromStatusId(parsed.data.statusId, fallbackStatus);
    const metadata = mergeMetadataForSpace({}, { statusId: parsed.data.statusId ?? null });

    if (!parsed.data.facilityId) {
      return asError("Spaces must belong to a facility.");
    }
    // Auto-resolve slug collisions server-side. The user-provided slug
    // is the preferred candidate; if it's taken we suffix `-2`, `-3`,
    // ... so retries-after-partial-failure stop bombing on the same row.
    const siblings = await listFacilitySpacesForManage(org.orgId, { facilityId: parsed.data.facilityId });
    const usedSlugs = new Set(siblings.map((s) => s.slug));
    const slug = uniqueSlug(parsed.data.slug, usedSlugs);
    const created = await createFacilitySpaceRecord({
      orgId: org.orgId,
      facilityId: parsed.data.facilityId,
      parentSpaceId: parsed.data.parentSpaceId ?? null,
      name: parsed.data.name,
      slug,
      spaceKind: parsed.data.spaceKind,
      status,
      // Server-side enforcement of the kind's intrinsic bookability.
      // A bathroom can never be marked bookable, regardless of what
      // the client claims — gives us one canonical source of truth.
      isBookable: isKindBookable(parsed.data.spaceKind) ? parsed.data.isBookable : false,
      timezone: parsed.data.timezone,
      capacity: parsed.data.capacity ?? null,
      sortIndex: parsed.data.sortIndex ?? 0,
      statusLabelsJson: parsed.data.statusLabels ?? {},
      metadataJson: metadata
    });

    const readModel = await listFacilityReservationReadModel(org.orgId);
    const space = readModel.spaces.find((s) => s.id === created.id) ?? created;
    revalidatePath(`/${org.orgSlug}/manage/facilities`);

    return { ok: true, data: { readModel, space } };
  } catch (error) {
    rethrowIfNavigationError(error);
    const message = error instanceof Error ? error.message : "Unable to create the facility space.";
    if (message.toLowerCase().includes("slug")) {
      return { ok: false, error: message, fieldErrors: { slug: message } };
    }
    return asError("Unable to create the facility space.");
  }
}

export async function updateFacilitySpaceAction(input: z.input<typeof facilitySpaceSchema>): Promise<SpaceMutationResult> {
  const parsed = facilitySpaceSchema.safeParse(input);
  if (!parsed.success || !parsed.data.spaceId) {
    return asError("Please review the facility details.");
  }

  try {
    const org = await requireFacilitiesWrite(parsed.data.orgSlug);
    const existing = await getFacilitySpaceById(org.orgId, parsed.data.spaceId);
    if (!existing) {
      return asError("Facility space not found.");
    }
    const fallbackStatus = parsed.data.status ?? existing.status;
    const status = resolveStatusFromStatusId(parsed.data.statusId, fallbackStatus);
    const metadata = mergeMetadataForSpace(existing.metadataJson, {
      statusId: parsed.data.statusId ?? existing.statusId ?? null
    });

    await updateFacilitySpaceRecord({
      orgId: org.orgId,
      spaceId: parsed.data.spaceId,
      parentSpaceId: parsed.data.parentSpaceId ?? null,
      name: parsed.data.name,
      slug: parsed.data.slug,
      spaceKind: parsed.data.spaceKind,
      status,
      // Server-side enforcement of the kind's intrinsic bookability.
      // A bathroom can never be marked bookable, regardless of what
      // the client claims — gives us one canonical source of truth.
      isBookable: isKindBookable(parsed.data.spaceKind) ? parsed.data.isBookable : false,
      timezone: parsed.data.timezone,
      capacity: parsed.data.capacity ?? null,
      sortIndex: parsed.data.sortIndex ?? 0,
      statusLabelsJson: parsed.data.statusLabels ?? {},
      metadataJson: metadata
    });

    const readModel = await listFacilityReservationReadModel(org.orgId);
    const space = readModel.spaces.find((s) => s.id === parsed.data.spaceId) ?? existing;
    revalidatePath(`/${org.orgSlug}/manage/facilities`);

    return { ok: true, data: { readModel, space } };
  } catch (error) {
    rethrowIfNavigationError(error);
    const message = error instanceof Error ? error.message : "Unable to update the facility space.";
    if (message.toLowerCase().includes("slug")) {
      return { ok: false, error: message, fieldErrors: { slug: message } };
    }
    return asError("Unable to update the facility space.");
  }
}

const deleteSpaceSchema = z.object({
  orgSlug: textSchema.min(1),
  spaceId: uuidSchema
});

export async function deleteFacilitySpaceAction(input: z.input<typeof deleteSpaceSchema>): Promise<FacilitiesActionResult<{ readModel: Awaited<ReturnType<typeof listFacilityReservationReadModel>> }>> {
  const parsed = deleteSpaceSchema.safeParse(input);
  if (!parsed.success) return asError("Invalid delete request.");
  try {
    const org = await requireFacilitiesWrite(parsed.data.orgSlug);
    await deleteFacilitySpaceRecord({ orgId: org.orgId, spaceId: parsed.data.spaceId });
    const readModel = await listFacilityReservationReadModel(org.orgId);
    revalidatePath(`/${org.orgSlug}/manage/facilities`);
    return { ok: true, data: { readModel } };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to delete the facility space.");
  }
}

// Org-customizable space-status CRUD. Until the migration is recovered the
// status set is fixed to the built-ins (open / closed / archived) — these
// stub actions surface a clear error so the SpaceStatusManager UI can render
// without crashing while the underlying feature is still being rebuilt.
const statusActionSchema = z.object({
  orgSlug: textSchema.min(1),
  statusId: textSchema.min(1).optional(),
  label: textSchema.min(1).optional(),
  color: textSchema.min(1).optional(),
  behavesAs: z.enum(["open", "closed", "archived"]).optional()
});

export async function createFacilitySpaceStatusAction(_input: z.input<typeof statusActionSchema>): Promise<FacilitiesActionResult<{ readModel: Awaited<ReturnType<typeof listFacilityReservationReadModel>> }>> {
  return asError("Custom space statuses aren't available yet — the migration is part of recovery still in progress.");
}

export async function updateFacilitySpaceStatusAction(_input: z.input<typeof statusActionSchema>): Promise<FacilitiesActionResult<{ readModel: Awaited<ReturnType<typeof listFacilityReservationReadModel>> }>> {
  return asError("Custom space statuses aren't available yet — the migration is part of recovery still in progress.");
}

export async function deleteFacilitySpaceStatusAction(_input: z.input<typeof statusActionSchema>): Promise<FacilitiesActionResult<{ readModel: Awaited<ReturnType<typeof listFacilityReservationReadModel>> }>> {
  return asError("Custom space statuses aren't available yet — the migration is part of recovery still in progress.");
}

// AI segmentation (SAM2) suggestion shape consumed by the map workspace.
// Real implementation lives in lost session — these stubs let the UI compile.
export type FacilitySpaceSuggestion = {
  name: string;
  kind: FacilitySpaceKind;
  points: { x: number; y: number; smooth?: boolean }[];
};

const segmentSchema = z.object({
  orgSlug: textSchema.min(1),
  spaceId: uuidSchema,
  centerLat: z.number(),
  centerLng: z.number(),
  mapZoom: z.number(),
  viewCenterX: z.number(),
  viewCenterY: z.number(),
  clickCanvasX: z.number(),
  clickCanvasY: z.number(),
  defaultName: z.string().optional()
});

export async function segmentFacilitySpaceAtPointAction(_input: z.input<typeof segmentSchema>): Promise<FacilitiesActionResult<{ suggestion: FacilitySpaceSuggestion }>> {
  return asError("AI outline isn't available yet — the segmentation pipeline is part of recovery still in progress.");
}

const applySuggestionsSchema = z.object({
  orgSlug: textSchema.min(1),
  parentSpaceId: uuidSchema,
  suggestions: z.array(
    z.object({
      name: z.string().min(1),
      kind: z.string(),
      points: z.array(z.object({ x: z.number(), y: z.number() }))
    })
  )
});

export async function applySuggestedFacilitySpacesAction(_input: z.input<typeof applySuggestionsSchema>): Promise<FacilitiesActionResult<{ readModel: Awaited<ReturnType<typeof listFacilityReservationReadModel>>; nodes: never[] }>> {
  return asError("AI outline isn't available yet — the segmentation pipeline is part of recovery still in progress.");
}

export async function archiveFacilitySpaceAction(input: z.input<typeof toggleSchema>): Promise<FacilitiesActionResult<{ readModel: Awaited<ReturnType<typeof listFacilityReservationReadModel>> }>> {
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid archive request.");
  }

  try {
    const org = await requireFacilitiesWrite(parsed.data.orgSlug);
    const space = await getFacilitySpaceById(org.orgId, parsed.data.spaceId);
    if (!space) {
      return asError("Facility space not found.");
    }

    await updateFacilitySpaceRecord({
      orgId: org.orgId,
      spaceId: space.id,
      parentSpaceId: space.parentSpaceId,
      name: space.name,
      slug: space.slug,
      spaceKind: space.spaceKind,
      status: "archived",
      isBookable: false,
      timezone: space.timezone,
      capacity: space.capacity,
      sortIndex: space.sortIndex,
      statusLabelsJson: space.statusLabelsJson,
      metadataJson: {}
    });

    const readModel = await listFacilityReservationReadModel(org.orgId);
    revalidatePath(`/${org.orgSlug}/manage/facilities`);

    return { ok: true, data: { readModel } };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to archive the facility space.");
  }
}

export async function toggleFacilitySpaceBookableAction(
  input: z.input<typeof toggleSchema> & { isBookable: boolean }
): Promise<FacilitiesActionResult<{ readModel: Awaited<ReturnType<typeof listFacilityReservationReadModel>> }>> {
  const parsed = z.object({ ...toggleSchema.shape, isBookable: z.boolean() }).safeParse(input);
  if (!parsed.success) {
    return asError("Invalid bookable request.");
  }

  try {
    const org = await requireFacilitiesWrite(parsed.data.orgSlug);
    const space = await getFacilitySpaceById(org.orgId, parsed.data.spaceId);
    if (!space) {
      return asError("Facility space not found.");
    }

    await updateFacilitySpaceRecord({
      orgId: org.orgId,
      spaceId: space.id,
      parentSpaceId: space.parentSpaceId,
      name: space.name,
      slug: space.slug,
      spaceKind: space.spaceKind,
      status: space.status,
      // Server-side enforcement of the kind's intrinsic bookability.
      // A bathroom can never be marked bookable, regardless of what
      // the client claims — gives us one canonical source of truth.
      isBookable: isKindBookable(parsed.data.spaceKind) ? parsed.data.isBookable : false,
      timezone: space.timezone,
      capacity: space.capacity,
      sortIndex: space.sortIndex,
      statusLabelsJson: space.statusLabelsJson,
      metadataJson: {}
    });

    const readModel = await listFacilityReservationReadModel(org.orgId);
    revalidatePath(`/${org.orgSlug}/manage/facilities`);

    return { ok: true, data: { readModel } };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to update bookable status.");
  }
}

export async function toggleFacilitySpaceOpenClosedAction(input: z.input<typeof setStatusSchema>): Promise<FacilitiesActionResult<{ readModel: Awaited<ReturnType<typeof listFacilityReservationReadModel>> }>> {
  const parsed = setStatusSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid status request.");
  }

  try {
    const org = await requireFacilitiesWrite(parsed.data.orgSlug);
    const space = await getFacilitySpaceById(org.orgId, parsed.data.spaceId);
    if (!space) {
      return asError("Facility space not found.");
    }

    await updateFacilitySpaceRecord({
      orgId: org.orgId,
      spaceId: space.id,
      parentSpaceId: space.parentSpaceId,
      name: space.name,
      slug: space.slug,
      spaceKind: space.spaceKind,
      status: parsed.data.status,
      isBookable: space.isBookable,
      timezone: space.timezone,
      capacity: space.capacity,
      sortIndex: space.sortIndex,
      statusLabelsJson: space.statusLabelsJson,
      metadataJson: {}
    });

    const readModel = await listFacilityReservationReadModel(org.orgId);
    revalidatePath(`/${org.orgSlug}/manage/facilities`);

    return { ok: true, data: { readModel } };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to update space status.");
  }
}

/**
 * Used by the calendar booking wizard's facility step. Just loads the
 * facility map detail and reshapes it for the booking flow. There is no
 * separate node table anymore — the spaces themselves carry their
 * geometry.
 */
export async function getFacilityBookingMapAction(input: { orgSlug: string; facilityId: string }): Promise<
  | { ok: true; data: { orgId: string; spaces: FacilitySpace[]; geoAnchor: { lat: number; lng: number } | null } }
  | { ok: false; error: string }
> {
  try {
    const detail = await getFacilityMapManageDetail(input.orgSlug, input.facilityId);
    if (!detail) return { ok: false, error: "Facility not found." };
    const geoAnchor = detail.facility.geoAnchorLat != null && detail.facility.geoAnchorLng != null
      ? { lat: detail.facility.geoAnchorLat, lng: detail.facility.geoAnchorLng }
      : null;
    return { ok: true, data: { orgId: detail.org.orgId, spaces: detail.spaces, geoAnchor } };
  } catch (error) {
    rethrowIfNavigationError(error);
    return { ok: false, error: "Unable to load facility map." };
  }
}

/**
 * Loader for the facility-detail page. After the schema collapse there
 * is nothing to seed and no orphan rows to clean up — geometry lives
 * on the spaces themselves.
 */
export async function getFacilityMapManageDetail(orgSlug: string, facilityId: string) {
  const org = await requireFacilitiesReadOrWrite(orgSlug);
  const [facility, spaces] = await Promise.all([
    getFacilityById(org.orgId, facilityId),
    listFacilitySpacesForManage(org.orgId, { facilityId })
  ]);
  if (!facility) return null;
  return {
    org,
    facility,
    spaces,
    canWrite: can(org.membershipPermissions, "facilities.write")
  };
}

/**
 * Single transactional batch save for the facility map editor.
 *
 * Accepts {creates, updates, deletes} from the client. Resolves slug
 * collisions server-side (auto-suffixes `-2`, `-3`, ... on conflict) so
 * a partial-failure retry never bombs on an already-claimed slug. On
 * any error before all writes complete the partial work that already
 * landed stays — the client's draft model is the source of truth and a
 * subsequent save converges to a clean state.
 */
export async function saveFacilityMapAction(
  input: z.input<typeof saveFacilityMapSchema>
): Promise<FacilitiesActionResult<{ spaces: FacilitySpace[] }>> {
  const parsed = saveFacilityMapSchema.safeParse(input);
  if (!parsed.success) return asError("Invalid map payload.");

  try {
    const org = await requireFacilitiesWrite(parsed.data.orgSlug);

    // 1. Deletions first. FK CASCADE pulls reservations/rules/etc.
    for (const id of parsed.data.deletes) {
      await deleteFacilitySpaceRecord({ orgId: org.orgId, spaceId: id });
    }

    // 2. Creates. Each carries a client-issued UUID and a slug we
    //    auto-resolve on conflict. The `id` and `slug` checks against
    //    `allSpaces` make this idempotent: if a previous save attempt
    //    partially landed (creates wrote, updates threw), retrying
    //    must NOT throw on the already-created rows. We treat an
    //    existing-id row as "already created — fall through to the
    //    geometry update step below" rather than re-inserting.
    const allSpaces = await listFacilitySpacesForManage(org.orgId, { facilityId: parsed.data.facilityId });
    const existingIds = new Set(allSpaces.map((s) => s.id));
    const usedSlugs = new Set(allSpaces.map((s) => s.slug));
    const recoveredCreates: typeof parsed.data.creates = [];
    for (const draft of parsed.data.creates) {
      if (existingIds.has(draft.id)) {
        // Row is already there from a prior partial save. Geometry
        // gets reconciled by the update step (we synthesize an update
        // entry below).
        recoveredCreates.push(draft);
        continue;
      }
      const slug = uniqueSlug(slugifyName(draft.name), usedSlugs);
      usedSlugs.add(slug);
      await createFacilitySpaceRecord({
        id: draft.id,
        orgId: org.orgId,
        facilityId: parsed.data.facilityId,
        parentSpaceId: null,
        name: draft.name,
        slug,
        spaceKind: draft.spaceKind,
        status: "open",
        isBookable: isKindBookable(draft.spaceKind) ? draft.isBookable : false,
        timezone: draft.timezone,
        capacity: draft.capacity ?? null,
        sortIndex: draft.sortIndex ?? 0,
        metadataJson: draft.statusId ? { statusId: draft.statusId } : {},
        mapPoints: draft.points,
        mapZIndex: draft.zIndex
      });
    }

    // 3. Geometry-only updates for spaces that already existed —
    //    plus any "recovered" creates that turned out to already exist
    //    server-side (so the client's latest points/zIndex still win).
    const allUpdates = [
      ...parsed.data.updates,
      ...recoveredCreates.map((draft) => ({ id: draft.id, points: draft.points, zIndex: draft.zIndex }))
    ];
    for (const update of allUpdates) {
      await updateFacilitySpaceMapRecord({
        orgId: org.orgId,
        spaceId: update.id,
        mapPoints: update.points,
        mapZIndex: update.zIndex
      });
    }

    const finalSpaces = await listFacilitySpacesForManage(org.orgId, { facilityId: parsed.data.facilityId });
    revalidatePath(`/${org.orgSlug}/manage/facilities/${parsed.data.facilityId}`);
    return { ok: true, data: { spaces: finalSpaces } };
  } catch (error) {
    rethrowIfNavigationError(error);
    const message = error instanceof Error ? error.message : "Unable to save facility map.";
    console.error("saveFacilityMapAction failed", error);
    return asError(message);
  }
}

function slugifyName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base.length >= 2 ? base : "space";
}

function uniqueSlug(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}
