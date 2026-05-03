"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { can } from "@/src/shared/permissions/can";
import { rethrowIfNavigationError } from "@/src/shared/navigation/rethrowIfNavigationError";
import {
  createFacilitySpaceRecord,
  getFacilitySpaceById,
  listFacilityReservationReadModel,
  listFacilitySpacesForManage,
  updateFacilitySpaceRecord
} from "@/src/features/facilities/db/queries";
import { normalizeLayout } from "@/src/features/canvas/core/layout";
import { normalizeNodeGeometry } from "@/src/features/canvas/core/geometry";
import { listFacilityMapNodes, seedFacilityMapNodesForMissingSpaces, upsertFacilityMapNodes } from "@/src/features/facilities/map/db/queries";
import type { FacilityMapNode } from "@/src/features/facilities/map/types";

const textSchema = z.string().trim();
const uuidSchema = z.string().uuid();

const facilitySpaceSchema = z.object({
  orgSlug: textSchema.min(1),
  spaceId: uuidSchema.optional(),
  parentSpaceId: uuidSchema.nullable().optional(),
  name: textSchema.min(2).max(120),
  slug: textSchema.min(2).max(120),
  spaceKind: z.enum(["building", "floor", "room", "field", "court", "custom"]),
  status: z.enum(["open", "closed", "archived"]),
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
      shapeType: z.enum(["rectangle", "polygon"]),
      points: z.array(
        z.object({
          x: z.number(),
          y: z.number()
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
  )
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

export async function createFacilitySpaceAction(input: z.input<typeof facilitySpaceSchema>): Promise<FacilitiesActionResult<{ readModel: Awaited<ReturnType<typeof listFacilityReservationReadModel>> }>> {
  const parsed = facilitySpaceSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Please review the facility details.");
  }

  try {
    const org = await requireFacilitiesWrite(parsed.data.orgSlug);

    await createFacilitySpaceRecord({
      orgId: org.orgId,
      parentSpaceId: parsed.data.parentSpaceId ?? null,
      name: parsed.data.name,
      slug: parsed.data.slug,
      spaceKind: parsed.data.spaceKind,
      status: parsed.data.status,
      isBookable: parsed.data.isBookable,
      timezone: parsed.data.timezone,
      capacity: parsed.data.capacity ?? null,
      sortIndex: parsed.data.sortIndex ?? 0,
      statusLabelsJson: parsed.data.statusLabels ?? {},
      metadataJson: {}
    });

    const readModel = await listFacilityReservationReadModel(org.orgId);
    revalidatePath(`/${org.orgSlug}/manage/facilities`);

    return { ok: true, data: { readModel } };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to create the facility space.");
  }
}

export async function updateFacilitySpaceAction(input: z.input<typeof facilitySpaceSchema>): Promise<FacilitiesActionResult<{ readModel: Awaited<ReturnType<typeof listFacilityReservationReadModel>> }>> {
  const parsed = facilitySpaceSchema.safeParse(input);
  if (!parsed.success || !parsed.data.spaceId) {
    return asError("Please review the facility details.");
  }

  try {
    const org = await requireFacilitiesWrite(parsed.data.orgSlug);

    await updateFacilitySpaceRecord({
      orgId: org.orgId,
      spaceId: parsed.data.spaceId,
      parentSpaceId: parsed.data.parentSpaceId ?? null,
      name: parsed.data.name,
      slug: parsed.data.slug,
      spaceKind: parsed.data.spaceKind,
      status: parsed.data.status,
      isBookable: parsed.data.isBookable,
      timezone: parsed.data.timezone,
      capacity: parsed.data.capacity ?? null,
      sortIndex: parsed.data.sortIndex ?? 0,
      statusLabelsJson: parsed.data.statusLabels ?? {},
      metadataJson: {}
    });

    const readModel = await listFacilityReservationReadModel(org.orgId);
    revalidatePath(`/${org.orgSlug}/manage/facilities`);

    return { ok: true, data: { readModel } };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to update the facility space.");
  }
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

export async function getFacilityMapManageDetail(orgSlug: string, spaceId: string) {
  const org = await requireFacilitiesReadOrWrite(orgSlug);
  const [space, spaces] = await Promise.all([getFacilitySpaceById(org.orgId, spaceId), listFacilitySpacesForManage(org.orgId)]);

  if (!space) {
    return null;
  }

  await seedFacilityMapNodesForMissingSpaces(org.orgId, spaces);
  const nodes = await listFacilityMapNodes(org.orgId, spaces);

  return {
    org,
    space,
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

    const normalized = normalizeLayout(
      parsed.data.nodes.map((node) =>
        normalizeNodeGeometry({
          ...node
        })
      )
    ) as FacilityMapNode[];

    const saved = await upsertFacilityMapNodes({
      orgId: org.orgId,
      nodes: normalized
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
