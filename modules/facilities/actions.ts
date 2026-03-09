"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { rethrowIfNavigationError } from "@/lib/actions/rethrowIfNavigationError";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { can } from "@/lib/permissions/can";
import { requireOrgPermission } from "@/lib/permissions/requireOrgPermission";
import {
  createFacilityNodeRecord,
  createFacilityRecord,
  deleteFacilityNodeRecord,
  deleteFacilityRecord,
  getFacilityBookingMapSnapshotForOccurrence,
  getFacilityById,
  getFacilityNodeById,
  listFacilityMapReadModel,
  listFacilityNodes,
  updateFacilityNodeRecord,
  updateFacilityRecord
} from "@/modules/facilities/db/queries";
import type { Facility, FacilityMapReadModel, FacilityNode } from "@/modules/facilities/types";
import { normalizeFacilityNodeLayout, toSlug } from "@/modules/facilities/utils";

type FacilitiesActionResult<TData = undefined> =
  | {
      ok: true;
      data: TData;
    }
  | {
      ok: false;
      error: string;
    };

function asError(error: string): FacilitiesActionResult<never> {
  return {
    ok: false,
    error
  };
}

const textSchema = z.string().trim();

const facilitySchema = z.object({
  orgSlug: textSchema.min(1),
  facilityId: z.string().uuid().optional(),
  name: textSchema.min(2).max(120),
  slug: textSchema.max(120).optional(),
  facilityType: z.enum(["park", "complex", "building", "campus", "field_cluster", "gym", "indoor", "custom"]),
  status: z.enum(["open", "closed", "archived"]).optional(),
  timezone: textSchema.max(120).optional(),
  sortIndex: z.number().int().min(0).optional(),
  metadataJson: z.record(z.string(), z.unknown()).optional()
});

const deleteFacilitySchema = z.object({
  orgSlug: textSchema.min(1),
  facilityId: z.string().uuid()
});

const facilityNodeSchema = z.object({
  orgSlug: textSchema.min(1),
  nodeId: z.string().uuid().optional(),
  facilityId: z.string().uuid(),
  parentNodeId: z.string().uuid().nullable().optional(),
  name: textSchema.min(2).max(120),
  slug: textSchema.max(120).optional(),
  nodeKind: z.enum([
    "facility",
    "zone",
    "building",
    "section",
    "field",
    "court",
    "diamond",
    "rink",
    "room",
    "amenity",
    "parking",
    "support_area",
    "custom"
  ]),
  status: z.enum(["open", "closed", "archived"]).optional(),
  isBookable: z.boolean().optional(),
  capacity: z.number().int().min(0).nullable().optional(),
  layout: z
    .object({
      x: z.number().int().optional(),
      y: z.number().int().optional(),
      w: z.number().int().optional(),
      h: z.number().int().optional(),
      z: z.number().int().optional(),
      shape: z.enum(["rect", "pill"]).optional(),
      containerMode: z.enum(["free", "stack"]).optional()
    })
    .optional(),
  sortIndex: z.number().int().min(0).optional(),
  metadataJson: z.record(z.string(), z.unknown()).optional()
});

const deleteFacilityNodeSchema = z.object({
  orgSlug: textSchema.min(1),
  nodeId: z.string().uuid()
});

const bookingSnapshotSchema = z.object({
  orgSlug: textSchema.min(1),
  occurrenceId: z.string().uuid()
});

function resolveTimezone(value: string | null | undefined) {
  const fallback = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const candidate = value?.trim();

  if (!candidate) {
    return fallback;
  }

  try {
    Intl.DateTimeFormat(undefined, { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return fallback;
  }
}

function revalidateFacilitiesRoutes(orgSlug: string, facilityId?: string) {
  revalidatePath(`/${orgSlug}/workspace/facilities`);
  if (facilityId) {
    revalidatePath(`/${orgSlug}/workspace/facilities/${facilityId}`);
    revalidatePath(`/${orgSlug}/workspace/facilities/${facilityId}/edit`);
  }
  revalidatePath(`/${orgSlug}/workspace/events`);
  revalidatePath(`/${orgSlug}`);
}

function hasNodeParentCycle(nodes: FacilityNode[], nodeId: string, parentNodeId: string | null) {
  const parentById = new Map(nodes.map((node) => [node.id, node.parentNodeId]));
  parentById.set(nodeId, parentNodeId);
  const seen = new Set<string>([nodeId]);
  let cursor = parentNodeId;
  while (cursor) {
    if (seen.has(cursor)) {
      return true;
    }
    seen.add(cursor);
    cursor = parentById.get(cursor) ?? null;
  }
  return false;
}

export async function getFacilitiesWorkspaceDataAction(input: {
  orgSlug: string;
}): Promise<FacilitiesActionResult<{ readModel: FacilityMapReadModel }>> {
  try {
    const org = await requireOrgPermission(input.orgSlug, "spaces.read");
    const readModel = await listFacilityMapReadModel(org.orgId);
    return {
      ok: true,
      data: {
        readModel
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to load facilities workspace data.");
  }
}

export async function upsertFacilityAction(
  input: z.input<typeof facilitySchema>
): Promise<FacilitiesActionResult<{ facilityId: string; readModel: FacilityMapReadModel }>> {
  const parsed = facilitySchema.safeParse(input);
  if (!parsed.success) {
    return asError("Please review the facility details.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "spaces.write");

    const saved = payload.facilityId
      ? await updateFacilityRecord({
          orgId: org.orgId,
          facilityId: payload.facilityId,
          name: payload.name,
          slug: toSlug(payload.slug ?? payload.name),
          facilityType: payload.facilityType,
          status: payload.status ?? "open",
          timezone: resolveTimezone(payload.timezone),
          metadataJson: payload.metadataJson ?? {},
          sortIndex: payload.sortIndex ?? 0
        })
      : await createFacilityRecord({
          orgId: org.orgId,
          name: payload.name,
          slug: toSlug(payload.slug ?? payload.name),
          facilityType: payload.facilityType,
          status: payload.status ?? "open",
          timezone: resolveTimezone(payload.timezone),
          metadataJson: payload.metadataJson ?? {},
          sortIndex: payload.sortIndex ?? 0
        });

    const readModel = await listFacilityMapReadModel(org.orgId);
    revalidateFacilitiesRoutes(org.orgSlug, saved.id);

    return {
      ok: true,
      data: {
        facilityId: saved.id,
        readModel
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to save this facility.");
  }
}

export async function deleteFacilityAction(
  input: z.input<typeof deleteFacilitySchema>
): Promise<FacilitiesActionResult<{ readModel: FacilityMapReadModel }>> {
  const parsed = deleteFacilitySchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid facility delete request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "spaces.write");
    await deleteFacilityRecord({
      orgId: org.orgId,
      facilityId: payload.facilityId
    });

    const readModel = await listFacilityMapReadModel(org.orgId);
    revalidateFacilitiesRoutes(org.orgSlug);

    return {
      ok: true,
      data: {
        readModel
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to delete this facility.");
  }
}

export async function upsertFacilityNodeAction(
  input: z.input<typeof facilityNodeSchema>
): Promise<FacilitiesActionResult<{ nodeId: string; facilityId: string; readModel: FacilityMapReadModel }>> {
  const parsed = facilityNodeSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Please review the node details.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "spaces.write");

    const facility = await getFacilityById(org.orgId, payload.facilityId);
    if (!facility) {
      return asError("Facility not found.");
    }

    const allNodes = await listFacilityNodes(org.orgId, { facilityId: payload.facilityId, includeArchived: true });
    const parentNodeId = payload.parentNodeId ?? null;

    if (parentNodeId) {
      const parent = allNodes.find((node) => node.id === parentNodeId);
      if (!parent) {
        return asError("Parent node not found.");
      }
    }

    const saved = payload.nodeId
      ? await (async () => {
          const nodeId = payload.nodeId;
          if (!nodeId) {
            return null;
          }

          const existing = allNodes.find((node) => node.id === nodeId);
          if (!existing) {
            return null;
          }

          const nextParentNodeId = payload.parentNodeId === undefined ? existing.parentNodeId : parentNodeId;
          if (nodeId === nextParentNodeId) {
            return null;
          }

          if (hasNodeParentCycle(allNodes, nodeId, nextParentNodeId)) {
            return null;
          }

          return updateFacilityNodeRecord({
            orgId: org.orgId,
            nodeId,
            parentNodeId: nextParentNodeId,
            name: payload.name,
            slug: toSlug(payload.slug ?? payload.name),
            nodeKind: payload.nodeKind,
            status: payload.status ?? existing.status,
            isBookable: payload.isBookable ?? existing.isBookable,
            capacity: payload.capacity ?? existing.capacity,
            layoutJson: normalizeFacilityNodeLayout({ ...existing.layout, ...payload.layout }),
            metadataJson: payload.metadataJson ?? existing.metadataJson,
            sortIndex: payload.sortIndex ?? existing.sortIndex
          });
        })()
      : await createFacilityNodeRecord({
          orgId: org.orgId,
          facilityId: payload.facilityId,
          parentNodeId,
          name: payload.name,
          slug: toSlug(payload.slug ?? payload.name),
          nodeKind: payload.nodeKind,
          status: payload.status ?? "open",
          isBookable: payload.isBookable ?? true,
          capacity: payload.capacity ?? null,
          layoutJson: normalizeFacilityNodeLayout(payload.layout),
          metadataJson: payload.metadataJson ?? {},
          sortIndex: payload.sortIndex ?? allNodes.length
        });

    if (!saved) {
      return asError("Invalid node update request.");
    }

    const readModel = await listFacilityMapReadModel(org.orgId);
    revalidateFacilitiesRoutes(org.orgSlug, payload.facilityId);

    return {
      ok: true,
      data: {
        nodeId: saved.id,
        facilityId: payload.facilityId,
        readModel
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to save this facility node.");
  }
}

export async function deleteFacilityNodeAction(
  input: z.input<typeof deleteFacilityNodeSchema>
): Promise<FacilitiesActionResult<{ facilityId: string; readModel: FacilityMapReadModel }>> {
  const parsed = deleteFacilityNodeSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid node delete request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "spaces.write");
    const existing = await getFacilityNodeById(org.orgId, payload.nodeId);

    if (!existing) {
      return asError("Facility node not found.");
    }

    const nodes = await listFacilityNodes(org.orgId, { facilityId: existing.facilityId, includeArchived: true });
    const childCount = nodes.filter((node) => node.parentNodeId === existing.id).length;
    if (childCount > 0) {
      return asError("Delete child nodes first.");
    }

    await deleteFacilityNodeRecord({
      orgId: org.orgId,
      nodeId: payload.nodeId
    });

    const readModel = await listFacilityMapReadModel(org.orgId);
    revalidateFacilitiesRoutes(org.orgSlug, existing.facilityId);

    return {
      ok: true,
      data: {
        facilityId: existing.facilityId,
        readModel
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to delete this facility node.");
  }
}

export async function getFacilityBookingMapSnapshotAction(
  input: z.input<typeof bookingSnapshotSchema>
): Promise<FacilitiesActionResult<{ snapshot: NonNullable<Awaited<ReturnType<typeof getFacilityBookingMapSnapshotForOccurrence>>> }>> {
  const parsed = bookingSnapshotSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid booking map request.");
  }

  try {
    const payload = parsed.data;
    const orgContext = await getOrgAuthContext(payload.orgSlug);
    const canReadBookingMap =
      can(orgContext.membershipPermissions, "spaces.read") ||
      can(orgContext.membershipPermissions, "spaces.write") ||
      can(orgContext.membershipPermissions, "calendar.read") ||
      can(orgContext.membershipPermissions, "calendar.write") ||
      can(orgContext.membershipPermissions, "programs.write") ||
      can(orgContext.membershipPermissions, "org.manage.read");

    if (!canReadBookingMap) {
      return asError("You do not have access to facility booking data.");
    }

    const snapshot = await getFacilityBookingMapSnapshotForOccurrence(orgContext.orgId, payload.occurrenceId);
    if (!snapshot) {
      return asError("Occurrence not found.");
    }

    return {
      ok: true,
      data: {
        snapshot
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to load booking map snapshot.");
  }
}

export async function getFacilityMapReadModelAction(input: {
  orgSlug: string;
}): Promise<FacilitiesActionResult<{ readModel: FacilityMapReadModel }>> {
  try {
    const org = await requireOrgPermission(input.orgSlug, "spaces.read");
    const readModel = await listFacilityMapReadModel(org.orgId);
    return {
      ok: true,
      data: {
        readModel
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to load facilities.");
  }
}
