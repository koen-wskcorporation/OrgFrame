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
  updateFacilitySpaceRecord
} from "@/src/features/facilities/db/queries";
import type { CanvasPoint } from "@/src/features/canvas/core/types";
import type { Facility, FacilitySpace, FacilitySpaceKind } from "@/src/features/facilities/types";
import {
  deleteFacilityMapNodes,
  deleteOrphanTopLevelFacilityMapNodes,
  listFacilityMapNodes,
  normalizeFacilityMapNodesForPersistence,
  seedFacilityMapNodesForMissingSpaces,
  upsertFacilityMapNodes
} from "@/src/features/facilities/map/db/queries";
import type { FacilityMapNode } from "@/src/features/facilities/map/types";

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
    "floor",
    "room",
    "field",
    "court",
    "lobby",
    "office",
    "kitchen",
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
  /** Lat/lng anchor for the satellite layer (canvas origin). */
  geoAnchorLat: z.number().nullable().optional(),
  geoAnchorLng: z.number().nullable().optional(),
  geoAddress: z.string().nullable().optional(),
  /** Indoor facilities render on the design grid; outdoor enables satellite. */
  environment: z.enum(["indoor", "outdoor"]).optional(),
  statusLabels: z
    .object({
      open: z.string().optional(),
      closed: z.string().optional(),
      archived: z.string().optional()
    })
    .optional()
});

/**
 * Build the `metadata_json` payload that carries lost-session-only fields
 * (`statusId`, `geoAnchorLat/Lng`, `geoAddress`, `geoShowMap`, `environment`)
 * until their dedicated columns are recovered. Pass the previous metadata so
 * unrelated keys aren't wiped on every update.
 */
function mergeMetadataForSpace(
  previous: Record<string, unknown>,
  patch: {
    statusId?: string | null;
    geoAnchorLat?: number | null;
    geoAnchorLng?: number | null;
    geoAddress?: string | null;
    geoShowMap?: boolean;
    environment?: "indoor" | "outdoor";
  }
) {
  const next: Record<string, unknown> = { ...previous };
  if (patch.statusId !== undefined) next.statusId = patch.statusId;
  if (patch.geoAnchorLat !== undefined) next.geoAnchorLat = patch.geoAnchorLat;
  if (patch.geoAnchorLng !== undefined) next.geoAnchorLng = patch.geoAnchorLng;
  if (patch.geoAddress !== undefined) next.geoAddress = patch.geoAddress;
  if (patch.geoShowMap !== undefined) next.geoShowMap = patch.geoShowMap;
  if (patch.environment !== undefined) next.environment = patch.environment;
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

const saveFacilityMapSchema = z.object({
  orgSlug: textSchema.min(1),
  nodes: z.array(
    z.object({
      id: z.string().min(1),
      entityId: uuidSchema,
      parentEntityId: uuidSchema.nullable(),
      label: z.string().min(1),
      points: z.array(
        z.object({
          x: z.number(),
          y: z.number(),
          smooth: z.boolean().optional()
        })
      ),
      bounds: z.object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number()
      }),
      zIndex: z.number().int(),
      cornerRadius: z.number(),
      status: z.enum(["active", "archived"])
    })
  ),
  /** Node ids the user removed locally; we delete the corresponding rows. */
  deletedNodeIds: z.array(z.string().min(1)).optional()
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
    const metadata = mergeMetadataForSpace(
      {},
      {
        statusId: parsed.data.statusId ?? null,
        geoAnchorLat: parsed.data.geoAnchorLat ?? null,
        geoAnchorLng: parsed.data.geoAnchorLng ?? null,
        geoAddress: parsed.data.geoAddress ?? null,
        geoShowMap: parsed.data.environment === "outdoor" && parsed.data.geoAnchorLat != null && parsed.data.geoAnchorLng != null,
        environment: parsed.data.environment
      }
    );

    if (!parsed.data.facilityId) {
      return asError("Spaces must belong to a facility.");
    }
    const created = await createFacilitySpaceRecord({
      orgId: org.orgId,
      facilityId: parsed.data.facilityId,
      parentSpaceId: parsed.data.parentSpaceId ?? null,
      name: parsed.data.name,
      slug: parsed.data.slug,
      spaceKind: parsed.data.spaceKind,
      status,
      isBookable: parsed.data.isBookable,
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
      statusId: parsed.data.statusId ?? existing.statusId ?? null,
      geoAnchorLat: parsed.data.geoAnchorLat !== undefined ? parsed.data.geoAnchorLat : existing.geoAnchorLat ?? null,
      geoAnchorLng: parsed.data.geoAnchorLng !== undefined ? parsed.data.geoAnchorLng : existing.geoAnchorLng ?? null,
      geoAddress: parsed.data.geoAddress !== undefined ? parsed.data.geoAddress : existing.geoAddress ?? null,
      environment: parsed.data.environment
    });

    await updateFacilitySpaceRecord({
      orgId: org.orgId,
      spaceId: parsed.data.spaceId,
      parentSpaceId: parsed.data.parentSpaceId ?? null,
      name: parsed.data.name,
      slug: parsed.data.slug,
      spaceKind: parsed.data.spaceKind,
      status,
      isBookable: parsed.data.isBookable,
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

const setGeoAnchorSchema = z.object({
  orgSlug: textSchema.min(1),
  spaceId: uuidSchema,
  geoAnchorLat: z.number().nullable(),
  geoAnchorLng: z.number().nullable(),
  geoAddress: z.string().nullable().optional(),
  geoShowMap: z.boolean().optional()
});

/**
 * Save / clear the per-space geo anchor + address used for the satellite
 * layer. Stored under `metadata_json` until the dedicated columns are
 * recovered.
 */
export async function setFacilitySpaceGeoAnchorAction(input: z.input<typeof setGeoAnchorSchema>): Promise<FacilitiesActionResult<{ readModel: Awaited<ReturnType<typeof listFacilityReservationReadModel>> }>> {
  const parsed = setGeoAnchorSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid location payload.");
  }
  try {
    const org = await requireFacilitiesWrite(parsed.data.orgSlug);
    const existing = await getFacilitySpaceById(org.orgId, parsed.data.spaceId);
    if (!existing) return asError("Facility space not found.");
    const metadata = mergeMetadataForSpace(existing.metadataJson, {
      geoAnchorLat: parsed.data.geoAnchorLat,
      geoAnchorLng: parsed.data.geoAnchorLng,
      geoAddress: parsed.data.geoAddress ?? null,
      geoShowMap: parsed.data.geoShowMap ?? Boolean(parsed.data.geoAnchorLat && parsed.data.geoAnchorLng)
    });
    await updateFacilitySpaceRecord({
      orgId: org.orgId,
      spaceId: existing.id,
      parentSpaceId: existing.parentSpaceId,
      name: existing.name,
      slug: existing.slug,
      spaceKind: existing.spaceKind,
      status: existing.status,
      isBookable: existing.isBookable,
      timezone: existing.timezone,
      capacity: existing.capacity,
      sortIndex: existing.sortIndex,
      statusLabelsJson: existing.statusLabelsJson,
      metadataJson: metadata
    });
    const readModel = await listFacilityReservationReadModel(org.orgId);
    revalidatePath(`/${org.orgSlug}/manage/facilities`);
    return { ok: true, data: { readModel } };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to save location.");
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
  points: CanvasPoint[];
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
      isBookable: parsed.data.isBookable,
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

// Booking-step shape consumed by FacilityBookingFullscreen. Wraps
// getFacilityMapManageDetail so the wizard's facility step can render the
// availability map. The full lost-session implementation surfaced
// org-customizable space-status definitions; until that work is recovered,
// `spaceStatuses` is empty and `geoAnchor` is unset.
export async function getFacilityBookingMapAction(input: { orgSlug: string; spaceId: string }): Promise<
  | { ok: true; data: { orgId: string; nodes: FacilityMapNode[]; spaces: Awaited<ReturnType<typeof listFacilitySpacesForManage>>; spaceStatuses: never[]; geoAnchor: { lat: number; lng: number } | null } }
  | { ok: false; error: string }
> {
  try {
    const detail = await getFacilityMapManageDetail(input.orgSlug, input.spaceId);
    if (!detail) {
      return { ok: false, error: "Facility not found." };
    }
    return {
      ok: true,
      data: {
        orgId: detail.org.orgId,
        nodes: detail.nodes,
        spaces: detail.spaces,
        spaceStatuses: [],
        geoAnchor: null
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return { ok: false, error: "Unable to load facility map." };
  }
}

export async function getFacilityMapManageDetail(orgSlug: string, facilityId: string) {
  const org = await requireFacilitiesReadOrWrite(orgSlug);
  const [facility, spaces] = await Promise.all([
    getFacilityById(org.orgId, facilityId),
    // Scope spaces to this facility — no more cross-facility bleed at the
    // query layer.
    listFacilitySpacesForManage(org.orgId, { facilityId })
  ]);

  if (!facility) {
    return null;
  }

  // Belt-and-suspenders cleanup of stale node rows. After the facility/spaces
  // table split this is mostly a no-op, but it keeps existing orgs' canvases
  // clean if they had legacy rows from the pre-split era.
  await deleteOrphanTopLevelFacilityMapNodes(org.orgId, spaces);
  await seedFacilityMapNodesForMissingSpaces(org.orgId, spaces);
  const nodes = await listFacilityMapNodes(org.orgId, spaces);

  return {
    org,
    facility,
    spaces,
    nodes,
    canWrite: can(org.membershipPermissions, "facilities.write")
  };
}

export async function saveFacilityMapAction(input: z.input<typeof saveFacilityMapSchema>): Promise<FacilitiesActionResult<{ nodes: FacilityMapNode[] }>> {
  const parsed = saveFacilityMapSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid map payload.");
  }

  try {
    const org = await requireFacilitiesWrite(parsed.data.orgSlug);

    // Use the gentle persistence path (recomputes bounds, no grid snap) so
    // satellite-positioned vertices survive a save.
    const cleaned = normalizeFacilityMapNodesForPersistence(parsed.data.nodes as FacilityMapNode[]);

    if (parsed.data.deletedNodeIds && parsed.data.deletedNodeIds.length > 0) {
      await deleteFacilityMapNodes({ orgId: org.orgId, nodeIds: parsed.data.deletedNodeIds });
    }

    const saved = await upsertFacilityMapNodes({
      orgId: org.orgId,
      nodes: cleaned
    });

    revalidatePath(`/${org.orgSlug}/manage/facilities`);
    return {
      ok: true,
      data: {
        nodes: saved
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to save facility map.");
  }
}
