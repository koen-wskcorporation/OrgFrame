"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { rethrowIfNavigationError } from "@/lib/actions/rethrowIfNavigationError";
import { requireOrgPermission } from "@/lib/permissions/requireOrgPermission";
import {
  createFacilityReservationRecord,
  createFacilitySpaceRecord,
  deleteFacilitySpaceRecord,
  deleteFacilityReservationRule,
  deleteFacilityReservationException,
  getFacilityReservationById,
  getFacilityReservationRuleById,
  getFacilitySpaceById,
  listFacilityReservationExceptions,
  listFacilityReservationReadModel,
  listFacilitySpacesForManage,
  setFacilityReservationStatus,
  updateFacilityReservationRecord,
  updateFacilitySpaceHierarchyRecord,
  updateFacilitySpaceRecord,
  upsertFacilityReservationException,
  upsertFacilityReservationRule,
  upsertRuleGeneratedReservations
} from "@/modules/facilities/db/queries";
import { normalizeFacilitySpaceStatusLabels } from "@/modules/facilities/status";
import { generateReservationsForRule, zonedLocalToUtc } from "@/modules/facilities/schedule/rule-engine";
import type {
  FacilityReservation,
  FacilityReservationExceptionKind,
  FacilityReservationRule,
  FacilityReservationRuleEndMode,
  FacilityReservationRuleIntervalUnit,
  FacilityReservationRuleMode,
  FacilityReservationStatus,
  FacilitySpaceKind
} from "@/modules/facilities/types";

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
const localDateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);

function normalizeOptional(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

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

function normalizeDate(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed.slice(0, 10) : null;
}

function buildRuleHash(payload: Record<string, unknown>) {
  return createHash("sha1").update(JSON.stringify(payload)).digest("hex");
}

function normalizeLocalWindow(input: {
  localDate: string;
  localStartTime?: string | null;
  localEndTime?: string | null;
  timezone: string;
}) {
  const localStartTime = normalizeOptional(input.localStartTime) ?? "00:00";
  const localEndTime = normalizeOptional(input.localEndTime) ?? "23:59";
  const startsAtUtc = zonedLocalToUtc(input.localDate, localStartTime, input.timezone).toISOString();
  let endsAtUtc = zonedLocalToUtc(input.localDate, localEndTime, input.timezone).toISOString();
  if (new Date(endsAtUtc).getTime() <= new Date(startsAtUtc).getTime()) {
    endsAtUtc = new Date(new Date(startsAtUtc).getTime() + 60 * 60 * 1000).toISOString();
  }

  return {
    localStartTime,
    localEndTime,
    startsAtUtc,
    endsAtUtc
  };
}

function asReservationConflictError(error: unknown) {
  if (!(error instanceof Error)) {
    return null;
  }

  if (error.message.includes("facility_reservations_no_overlap")) {
    return "This time overlaps another pending or approved reservation for that space.";
  }

  if (error.message.toLowerCase().includes("conflict")) {
    return "This reservation conflicts with another reservation.";
  }

  return null;
}

function revalidateFacilitiesRoutes(orgSlug: string) {
  revalidatePath(`/${orgSlug}/tools/facilities`);
  revalidatePath(`/${orgSlug}/manage/facilities`);
}

const facilityLeafKinds = new Set<FacilitySpaceKind>(["room", "field", "court", "custom"]);

function canParentContainKind(parentKind: FacilitySpaceKind, childKind: FacilitySpaceKind) {
  if (parentKind === "building") {
    return childKind === "floor" || childKind === "room" || childKind === "field" || childKind === "court" || childKind === "custom";
  }

  if (parentKind === "floor") {
    return childKind === "room" || childKind === "field" || childKind === "court" || childKind === "custom";
  }

  return false;
}

function validateFacilityParenting(
  childKind: FacilitySpaceKind,
  parentSpaceId: string | null,
  spaceById: Map<string, { id: string; name: string; spaceKind: FacilitySpaceKind }>
) {
  if (!parentSpaceId) {
    if (childKind === "floor") {
      return "Floors must be created inside a building.";
    }

    return null;
  }

  const parent = spaceById.get(parentSpaceId);
  if (!parent) {
    return "Parent space not found.";
  }

  if (!canParentContainKind(parent.spaceKind, childKind)) {
    return `${parent.name} (${parent.spaceKind}) cannot contain a ${childKind}.`;
  }

  return null;
}

function hasParentCycle(spaceId: string, parentById: Map<string, string | null>) {
  const seen = new Set<string>([spaceId]);
  let cursor = parentById.get(spaceId) ?? null;

  while (cursor) {
    if (seen.has(cursor)) {
      return true;
    }

    seen.add(cursor);
    cursor = parentById.get(cursor) ?? null;
  }

  return false;
}

function collectSpaceDescendantIds(parentById: Map<string, string | null>, rootId: string) {
  const descendants = new Set<string>();
  const stack = [...[...parentById.entries()].filter(([, parentId]) => parentId === rootId).map(([spaceId]) => spaceId)];

  while (stack.length > 0) {
    const next = stack.pop();
    if (!next || descendants.has(next)) {
      continue;
    }

    descendants.add(next);

    for (const [spaceId, parentId] of parentById.entries()) {
      if (parentId === next) {
        stack.push(spaceId);
      }
    }
  }

  return descendants;
}

function validateBuildingFloorMinimum(
  spaces: Array<{ id: string; name: string; parentSpaceId: string | null; spaceKind: FacilitySpaceKind; status: "open" | "closed" | "archived" }>,
  affectedBuildingIds?: Set<string>
) {
  const floorCountByBuildingId = new Map<string, number>();

  for (const space of spaces) {
    if (space.spaceKind === "floor" && space.parentSpaceId && space.status !== "archived") {
      floorCountByBuildingId.set(space.parentSpaceId, (floorCountByBuildingId.get(space.parentSpaceId) ?? 0) + 1);
    }
  }

  for (const space of spaces) {
    if (space.spaceKind !== "building" || space.status === "archived") {
      continue;
    }

    if (affectedBuildingIds && !affectedBuildingIds.has(space.id)) {
      continue;
    }

    if ((floorCountByBuildingId.get(space.id) ?? 0) === 0) {
      return `Building \"${space.name}\" must have at least one floor.`;
    }
  }

  return null;
}

const createSpaceSchema = z.object({
  orgSlug: textSchema.min(1),
  parentSpaceId: z.string().uuid().nullable().optional(),
  name: textSchema.min(2).max(120),
  slug: textSchema.max(120).optional(),
  spaceKind: z.enum(["building", "floor", "room", "field", "court", "custom"] satisfies FacilitySpaceKind[]).optional(),
  status: z.enum(["open", "closed", "archived"]).optional(),
  statusLabels: z
    .object({
      open: textSchema.max(48).optional(),
      closed: textSchema.max(48).optional(),
      archived: textSchema.max(48).optional()
    })
    .optional(),
  isBookable: z.boolean().optional(),
  timezone: textSchema.max(120).optional(),
  capacity: z.number().int().min(0).nullable().optional(),
  sortIndex: z.number().int().min(0).optional(),
  metadataJson: z.record(z.string(), z.unknown()).optional()
});

const updateSpaceSchema = createSpaceSchema.extend({
  spaceId: z.string().uuid()
});

const moveSpaceSchema = z.object({
  orgSlug: textSchema.min(1),
  spaceId: z.string().uuid(),
  parentSpaceId: z.string().uuid().nullable()
});

const saveStructureSchema = z.object({
  orgSlug: textSchema.min(1),
  rootSpaceId: z.string().uuid(),
  nodes: z.array(
    z.object({
      spaceId: z.string().uuid(),
      parentSpaceId: z.string().uuid().nullable(),
      sortIndex: z.number().int().min(0)
    })
  )
});

const toggleSpaceBookableSchema = z.object({
  orgSlug: textSchema.min(1),
  spaceId: z.string().uuid(),
  isBookable: z.boolean()
});

const toggleSpaceOpenClosedSchema = z.object({
  orgSlug: textSchema.min(1),
  spaceId: z.string().uuid(),
  status: z.enum(["open", "closed", "archived"])
});

const archiveSpaceSchema = z.object({
  orgSlug: textSchema.min(1),
  spaceId: z.string().uuid()
});

const deleteSpaceSchema = z.object({
  orgSlug: textSchema.min(1),
  spaceId: z.string().uuid()
});

const upsertRuleSchema = z.object({
  orgSlug: textSchema.min(1),
  ruleId: z.string().uuid().optional(),
  spaceId: z.string().uuid(),
  mode: z.enum(["single_date", "multiple_specific_dates", "repeating_pattern", "continuous_date_range", "custom_advanced"] satisfies FacilityReservationRuleMode[]),
  reservationKind: z.enum(["booking", "blackout"]).optional(),
  defaultStatus: z.enum(["pending", "approved", "rejected", "cancelled"] satisfies FacilityReservationStatus[]).optional(),
  publicLabel: textSchema.max(160).optional(),
  internalNotes: textSchema.max(4000).optional(),
  timezone: textSchema.max(120).optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  startTime: z.string().trim().optional(),
  endTime: z.string().trim().optional(),
  intervalCount: z.number().int().min(1).optional(),
  intervalUnit: z.enum(["day", "week", "month"] satisfies FacilityReservationRuleIntervalUnit[]).optional(),
  byWeekday: z.array(z.number().int().min(0).max(6)).optional(),
  byMonthday: z.array(z.number().int().min(1).max(31)).optional(),
  endMode: z.enum(["never", "until_date", "after_occurrences"] satisfies FacilityReservationRuleEndMode[]).optional(),
  untilDate: z.string().trim().optional(),
  maxOccurrences: z.number().int().min(1).nullable().optional(),
  eventId: z.string().uuid().nullable().optional(),
  programId: z.string().uuid().nullable().optional(),
  conflictOverride: z.boolean().optional(),
  sortIndex: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  configJson: z.record(z.string(), z.unknown()).optional()
});

const deleteRuleSchema = z.object({
  orgSlug: textSchema.min(1),
  ruleId: z.string().uuid()
});

const createReservationSchema = z.object({
  orgSlug: textSchema.min(1),
  spaceId: z.string().uuid(),
  reservationKind: z.enum(["booking", "blackout"]).optional(),
  status: z.enum(["pending", "approved", "rejected", "cancelled"] satisfies FacilityReservationStatus[]).optional(),
  timezone: textSchema.max(120).optional(),
  localDate: localDateSchema,
  localStartTime: z.string().trim().optional(),
  localEndTime: z.string().trim().optional(),
  publicLabel: textSchema.max(160).optional(),
  internalNotes: textSchema.max(4000).optional(),
  eventId: z.string().uuid().nullable().optional(),
  programId: z.string().uuid().nullable().optional(),
  conflictOverride: z.boolean().optional()
});

const updateReservationSchema = createReservationSchema.extend({
  reservationId: z.string().uuid(),
  status: z.enum(["pending", "approved", "rejected", "cancelled"] satisfies FacilityReservationStatus[])
});

const reservationStatusMutationSchema = z.object({
  orgSlug: textSchema.min(1),
  reservationId: z.string().uuid()
});

type ReadModelData = Awaited<ReturnType<typeof listFacilityReservationReadModel>>;

async function refreshFacilitiesData(orgSlug: string, orgId: string): Promise<ReadModelData> {
  const readModel = await listFacilityReservationReadModel(orgId);
  revalidateFacilitiesRoutes(orgSlug);
  return readModel;
}

export async function createFacilitySpaceAction(input: z.input<typeof createSpaceSchema>): Promise<FacilitiesActionResult<{ spaceId: string; readModel: ReadModelData }>> {
  const parsed = createSpaceSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Please review the space details.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "facilities.write");
    const nextSpaceKind = payload.spaceKind ?? "custom";
    const allSpaces = await listFacilitySpacesForManage(org.orgId);
    const spaceById = new Map(allSpaces.map((space) => [space.id, space]));
    const parentValidationError = validateFacilityParenting(nextSpaceKind, payload.parentSpaceId ?? null, spaceById);
    if (parentValidationError) {
      return asError(parentValidationError);
    }

    const created = await createFacilitySpaceRecord({
      orgId: org.orgId,
      parentSpaceId: payload.parentSpaceId ?? null,
      name: payload.name,
      slug: normalizeSlug(payload.slug ?? payload.name),
      spaceKind: nextSpaceKind,
      status: payload.status ?? "open",
      isBookable: payload.isBookable ?? (nextSpaceKind === "floor" ? false : true),
      timezone: resolveTimezone(payload.timezone),
      capacity: payload.capacity ?? null,
      metadataJson: payload.metadataJson ?? {},
      statusLabelsJson: normalizeFacilitySpaceStatusLabels(payload.statusLabels),
      sortIndex: payload.sortIndex ?? 0
    });

    if (nextSpaceKind === "building") {
      await createFacilitySpaceRecord({
        orgId: org.orgId,
        parentSpaceId: created.id,
        name: "Floor 1",
        slug: normalizeSlug(`${created.slug}-floor-1`),
        spaceKind: "floor",
        status: "open",
        isBookable: false,
        timezone: created.timezone,
        capacity: null,
        metadataJson: {
          floorPlan: {
            canvas: {
              width: 1400,
              height: 900
            }
          }
        },
        statusLabelsJson: {},
        sortIndex: 0
      });
    }

    const readModel = await refreshFacilitiesData(org.orgSlug, org.orgId);
    return {
      ok: true,
      data: {
        spaceId: created.id,
        readModel
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to create this space right now.");
  }
}

export async function updateFacilitySpaceAction(input: z.input<typeof updateSpaceSchema>): Promise<FacilitiesActionResult<{ readModel: ReadModelData }>> {
  const parsed = updateSpaceSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Please review the space details.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "facilities.write");
    const allSpaces = await listFacilitySpacesForManage(org.orgId);
    const spaceById = new Map(allSpaces.map((space) => [space.id, space]));
    const existing = spaceById.get(payload.spaceId) ?? null;
    if (!existing) {
      return asError("Space not found.");
    }
    const nextParentSpaceId = payload.parentSpaceId === undefined ? existing.parentSpaceId : payload.parentSpaceId;
    const nextSpaceKind = payload.spaceKind ?? existing.spaceKind;

    if (nextParentSpaceId === payload.spaceId) {
      return asError("A space cannot be its own parent.");
    }

    const parentValidationError = validateFacilityParenting(nextSpaceKind, nextParentSpaceId, spaceById);
    if (parentValidationError) {
      return asError(parentValidationError);
    }

    const parentById = new Map(allSpaces.map((space) => [space.id, space.parentSpaceId]));
    parentById.set(existing.id, nextParentSpaceId);
    if (hasParentCycle(existing.id, parentById)) {
      return asError("Invalid hierarchy: recursive parent assignment detected.");
    }

    const directChildren = allSpaces.filter((space) => space.parentSpaceId === existing.id);
    if (facilityLeafKinds.has(nextSpaceKind) && directChildren.length > 0) {
      return asError("Rooms, courts, fields, and custom spaces cannot contain child spaces.");
    }
    if (!facilityLeafKinds.has(nextSpaceKind)) {
      const incompatibleChild = directChildren.find((child) => !canParentContainKind(nextSpaceKind, child.spaceKind));
      if (incompatibleChild) {
        return asError(`${nextSpaceKind} spaces cannot contain ${incompatibleChild.spaceKind} spaces.`);
      }
    }

    const nextStatus = payload.status ?? existing.status;
    const prospectiveSpaces = allSpaces.map((space) =>
      space.id === existing.id
        ? {
            ...space,
            parentSpaceId: nextParentSpaceId,
            spaceKind: nextSpaceKind,
            status: nextStatus
          }
        : space
    );
    const affectedBuildingIds = new Set<string>();
    if (existing.spaceKind === "building" || nextSpaceKind === "building") {
      affectedBuildingIds.add(existing.id);
    }
    if (existing.parentSpaceId) {
      const parent = spaceById.get(existing.parentSpaceId);
      if (parent?.spaceKind === "building") {
        affectedBuildingIds.add(parent.id);
      }
    }
    if (nextParentSpaceId) {
      const parent = spaceById.get(nextParentSpaceId);
      if (parent?.spaceKind === "building") {
        affectedBuildingIds.add(parent.id);
      }
    }
    const floorCoverageError = validateBuildingFloorMinimum(prospectiveSpaces, affectedBuildingIds);
    if (floorCoverageError) {
      return asError(floorCoverageError);
    }

    await updateFacilitySpaceRecord({
      orgId: org.orgId,
      spaceId: payload.spaceId,
      parentSpaceId: nextParentSpaceId,
      name: payload.name,
      slug: normalizeSlug(payload.slug ?? payload.name),
      spaceKind: nextSpaceKind,
      status: nextStatus,
      isBookable: payload.isBookable ?? (nextSpaceKind === "floor" ? false : existing.isBookable),
      timezone: resolveTimezone(payload.timezone ?? existing.timezone),
      capacity: payload.capacity ?? existing.capacity,
      metadataJson: payload.metadataJson ?? existing.metadataJson,
      statusLabelsJson: payload.statusLabels ? normalizeFacilitySpaceStatusLabels(payload.statusLabels) : existing.statusLabelsJson,
      sortIndex: payload.sortIndex ?? existing.sortIndex
    });

    const readModel = await refreshFacilitiesData(org.orgSlug, org.orgId);
    return {
      ok: true,
      data: {
        readModel
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to update this space right now.");
  }
}

export async function moveFacilitySpaceAction(input: z.input<typeof moveSpaceSchema>): Promise<FacilitiesActionResult<{ readModel: ReadModelData }>> {
  const parsed = moveSpaceSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid move request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "facilities.write");
    const allSpaces = await listFacilitySpacesForManage(org.orgId);
    const spaceById = new Map(allSpaces.map((space) => [space.id, space]));
    const existing = spaceById.get(payload.spaceId) ?? null;
    if (!existing) {
      return asError("Space not found.");
    }
    if (payload.parentSpaceId === payload.spaceId) {
      return asError("A space cannot be moved under itself.");
    }
    const parentValidationError = validateFacilityParenting(existing.spaceKind, payload.parentSpaceId, spaceById);
    if (parentValidationError) {
      return asError(parentValidationError);
    }
    const parentById = new Map(allSpaces.map((space) => [space.id, space.parentSpaceId]));
    parentById.set(existing.id, payload.parentSpaceId);
    if (hasParentCycle(existing.id, parentById)) {
      return asError("Invalid hierarchy: recursive parent assignment detected.");
    }

    const prospectiveSpaces = allSpaces.map((space) =>
      space.id === existing.id
        ? {
            ...space,
            parentSpaceId: payload.parentSpaceId
          }
        : space
    );
    const affectedBuildingIds = new Set<string>();
    if (existing.parentSpaceId) {
      const currentParent = spaceById.get(existing.parentSpaceId);
      if (currentParent?.spaceKind === "building") {
        affectedBuildingIds.add(currentParent.id);
      }
    }
    if (payload.parentSpaceId) {
      const targetParent = spaceById.get(payload.parentSpaceId);
      if (targetParent?.spaceKind === "building") {
        affectedBuildingIds.add(targetParent.id);
      }
    }
    const floorCoverageError = validateBuildingFloorMinimum(prospectiveSpaces, affectedBuildingIds);
    if (floorCoverageError) {
      return asError(floorCoverageError);
    }

    await updateFacilitySpaceRecord({
      orgId: org.orgId,
      spaceId: existing.id,
      parentSpaceId: payload.parentSpaceId,
      name: existing.name,
      slug: existing.slug,
      spaceKind: existing.spaceKind,
      status: existing.status,
      isBookable: existing.isBookable,
      timezone: existing.timezone,
      capacity: existing.capacity,
      metadataJson: existing.metadataJson,
      statusLabelsJson: existing.statusLabelsJson,
      sortIndex: existing.sortIndex
    });

    const readModel = await refreshFacilitiesData(org.orgSlug, org.orgId);
    return {
      ok: true,
      data: {
        readModel
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to move this space.");
  }
}

export async function saveFacilityStructureAction(input: z.input<typeof saveStructureSchema>): Promise<FacilitiesActionResult<{ readModel: ReadModelData }>> {
  const parsed = saveStructureSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid structure payload.");
  }

  try {
    const payload = parsed.data;
    if (payload.nodes.length === 0) {
      return asError("No structure nodes were provided.");
    }

    const org = await requireOrgPermission(payload.orgSlug, "facilities.write");
    const spaces = await listFacilitySpacesForManage(org.orgId);
    const spaceById = new Map(spaces.map((space) => [space.id, space]));
    const rootSpace = spaceById.get(payload.rootSpaceId);
    if (!rootSpace) {
      return asError("Root space not found.");
    }

    const existingParentById = new Map(spaces.map((space) => [space.id, space.parentSpaceId]));
    const descendantIds = collectSpaceDescendantIds(existingParentById, payload.rootSpaceId);
    if (descendantIds.size === 0) {
      return asError("No descendant spaces found for this structure.");
    }

    const uniqueInputIds = new Set(payload.nodes.map((node) => node.spaceId));
    if (uniqueInputIds.size !== payload.nodes.length) {
      return asError("Invalid structure payload: duplicate space IDs detected.");
    }

    if (uniqueInputIds.size !== descendantIds.size || [...descendantIds].some((spaceId) => !uniqueInputIds.has(spaceId))) {
      return asError("Structure payload is out of date. Refresh and try again.");
    }

    const nextParentById = new Map(existingParentById);
    for (const node of payload.nodes) {
      const target = spaceById.get(node.spaceId);
      if (!target) {
        return asError("One or more spaces no longer exist.");
      }

      if (!descendantIds.has(node.spaceId)) {
        return asError("Structure changes can only target descendants of the selected facility.");
      }

      nextParentById.set(node.spaceId, node.parentSpaceId);
    }

    for (const node of payload.nodes) {
      const child = spaceById.get(node.spaceId);
      if (!child) {
        return asError("Space not found.");
      }

      if (!node.parentSpaceId) {
        return asError("Each mapped structure space must have a parent.");
      }

      if (node.parentSpaceId === node.spaceId) {
        return asError("A space cannot be its own parent.");
      }

      if (node.parentSpaceId !== payload.rootSpaceId && !descendantIds.has(node.parentSpaceId)) {
        return asError("Structure changes cannot move spaces outside of the selected facility subtree.");
      }

      const parent = spaceById.get(node.parentSpaceId);
      if (!parent) {
        return asError("Parent space not found.");
      }

      if (!canParentContainKind(parent.spaceKind, child.spaceKind)) {
        return asError(`${parent.name} (${parent.spaceKind}) cannot contain a ${child.spaceKind}.`);
      }
    }

    const prospectiveSpaces = spaces.map((space) => ({
      ...space,
      parentSpaceId: nextParentById.get(space.id) ?? space.parentSpaceId
    }));
    const affectedBuildingIds = new Set<string>();
    for (const node of payload.nodes) {
      const current = spaceById.get(node.spaceId);
      if (current?.parentSpaceId) {
        const currentParent = spaceById.get(current.parentSpaceId);
        if (currentParent?.spaceKind === "building") {
          affectedBuildingIds.add(currentParent.id);
        }
      }
      if (node.parentSpaceId) {
        const nextParent = spaceById.get(node.parentSpaceId);
        if (nextParent?.spaceKind === "building") {
          affectedBuildingIds.add(nextParent.id);
        }
      }
    }
    const floorCoverageError = validateBuildingFloorMinimum(prospectiveSpaces, affectedBuildingIds);
    if (floorCoverageError) {
      return asError(floorCoverageError);
    }

    for (const spaceId of descendantIds) {
      if (hasParentCycle(spaceId, nextParentById)) {
        return asError("Invalid hierarchy: recursive parent assignment detected.");
      }
    }

    const existingSortBySpaceId = new Map(spaces.map((space) => [space.id, space.sortIndex]));
    const grouped = new Map<string, Array<{ spaceId: string; parentSpaceId: string; sortIndex: number }>>();
    for (const node of payload.nodes) {
      const key = node.parentSpaceId ?? "__missing__";
      const current = grouped.get(key) ?? [];
      current.push({
        spaceId: node.spaceId,
        parentSpaceId: node.parentSpaceId as string,
        sortIndex: node.sortIndex
      });
      grouped.set(key, current);
    }

    for (const group of grouped.values()) {
      group.sort((a, b) => {
        if (a.sortIndex !== b.sortIndex) {
          return a.sortIndex - b.sortIndex;
        }

        return (existingSortBySpaceId.get(a.spaceId) ?? 0) - (existingSortBySpaceId.get(b.spaceId) ?? 0);
      });

      for (let index = 0; index < group.length; index += 1) {
        const item = group[index];
        await updateFacilitySpaceHierarchyRecord({
          orgId: org.orgId,
          spaceId: item.spaceId,
          parentSpaceId: item.parentSpaceId,
          sortIndex: index
        });
      }
    }

    const readModel = await refreshFacilitiesData(org.orgSlug, org.orgId);
    return {
      ok: true,
      data: {
        readModel
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to save facility structure right now.");
  }
}

export async function archiveFacilitySpaceAction(input: z.input<typeof archiveSpaceSchema>): Promise<FacilitiesActionResult<{ readModel: ReadModelData }>> {
  const parsed = archiveSpaceSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid archive request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "facilities.write");
    const allSpaces = await listFacilitySpacesForManage(org.orgId);
    const existing = allSpaces.find((space) => space.id === payload.spaceId) ?? null;
    if (!existing) {
      return asError("Space not found.");
    }

    const prospectiveSpaces = allSpaces.map((space) =>
      space.id === existing.id
        ? {
            ...space,
            status: "archived" as const
          }
        : space
    );
    const spaceById = new Map(allSpaces.map((space) => [space.id, space]));
    const affectedBuildingIds = new Set<string>();
    if (existing.spaceKind === "building") {
      affectedBuildingIds.add(existing.id);
    }
    if (existing.parentSpaceId) {
      const parent = spaceById.get(existing.parentSpaceId);
      if (parent?.spaceKind === "building") {
        affectedBuildingIds.add(parent.id);
      }
    }
    const floorCoverageError = validateBuildingFloorMinimum(prospectiveSpaces, affectedBuildingIds);
    if (floorCoverageError) {
      return asError(floorCoverageError);
    }

    await updateFacilitySpaceRecord({
      orgId: org.orgId,
      spaceId: existing.id,
      parentSpaceId: existing.parentSpaceId,
      name: existing.name,
      slug: existing.slug,
      spaceKind: existing.spaceKind,
      status: "archived",
      isBookable: false,
      timezone: existing.timezone,
      capacity: existing.capacity,
      metadataJson: existing.metadataJson,
      statusLabelsJson: existing.statusLabelsJson,
      sortIndex: existing.sortIndex
    });

    const readModel = await refreshFacilitiesData(org.orgSlug, org.orgId);
    return {
      ok: true,
      data: {
        readModel
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to archive this space.");
  }
}

export async function deleteFacilitySpaceAction(input: z.input<typeof deleteSpaceSchema>): Promise<FacilitiesActionResult<{ readModel: ReadModelData }>> {
  const parsed = deleteSpaceSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid delete request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "facilities.write");
    const allSpaces = await listFacilitySpacesForManage(org.orgId);
    const existing = allSpaces.find((space) => space.id === payload.spaceId) ?? null;
    if (!existing) {
      return asError("Space not found.");
    }

    const childCount = allSpaces.filter((space) => space.parentSpaceId === existing.id).length;
    if (childCount > 0) {
      return asError("Delete child spaces first.");
    }

    const prospectiveSpaces = allSpaces.filter((space) => space.id !== existing.id);
    const spaceById = new Map(allSpaces.map((space) => [space.id, space]));
    const affectedBuildingIds = new Set<string>();
    if (existing.spaceKind === "building") {
      affectedBuildingIds.add(existing.id);
    }
    if (existing.parentSpaceId) {
      const parent = spaceById.get(existing.parentSpaceId);
      if (parent?.spaceKind === "building") {
        affectedBuildingIds.add(parent.id);
      }
    }
    const floorCoverageError = validateBuildingFloorMinimum(prospectiveSpaces, affectedBuildingIds);
    if (floorCoverageError) {
      return asError(floorCoverageError);
    }

    await deleteFacilitySpaceRecord({
      orgId: org.orgId,
      spaceId: existing.id
    });

    const readModel = await refreshFacilitiesData(org.orgSlug, org.orgId);
    return {
      ok: true,
      data: {
        readModel
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to delete this space.");
  }
}

export async function toggleFacilitySpaceBookableAction(
  input: z.input<typeof toggleSpaceBookableSchema>
): Promise<FacilitiesActionResult<{ readModel: ReadModelData }>> {
  const parsed = toggleSpaceBookableSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "facilities.write");
    const allSpaces = await listFacilitySpacesForManage(org.orgId);
    const existing = allSpaces.find((space) => space.id === payload.spaceId) ?? null;
    if (!existing) {
      return asError("Space not found.");
    }

    await updateFacilitySpaceRecord({
      orgId: org.orgId,
      spaceId: existing.id,
      parentSpaceId: existing.parentSpaceId,
      name: existing.name,
      slug: existing.slug,
      spaceKind: existing.spaceKind,
      status: existing.status,
      isBookable: payload.isBookable,
      timezone: existing.timezone,
      capacity: existing.capacity,
      metadataJson: existing.metadataJson,
      statusLabelsJson: existing.statusLabelsJson,
      sortIndex: existing.sortIndex
    });

    const readModel = await refreshFacilitiesData(org.orgSlug, org.orgId);
    return {
      ok: true,
      data: {
        readModel
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to update bookable state.");
  }
}

export async function toggleFacilitySpaceOpenClosedAction(
  input: z.input<typeof toggleSpaceOpenClosedSchema>
): Promise<FacilitiesActionResult<{ readModel: ReadModelData }>> {
  const parsed = toggleSpaceOpenClosedSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "facilities.write");
    const allSpaces = await listFacilitySpacesForManage(org.orgId);
    const existing = allSpaces.find((space) => space.id === payload.spaceId) ?? null;
    if (!existing) {
      return asError("Space not found.");
    }

    if (existing.spaceKind === "building") {
      const prospectiveSpaces = allSpaces.map((space) =>
        space.id === existing.id
          ? {
              ...space,
              status: payload.status
            }
          : space
      );
      const floorCoverageError = validateBuildingFloorMinimum(prospectiveSpaces, new Set<string>([existing.id]));
      if (floorCoverageError) {
        return asError(floorCoverageError);
      }
    }

    await updateFacilitySpaceRecord({
      orgId: org.orgId,
      spaceId: existing.id,
      parentSpaceId: existing.parentSpaceId,
      name: existing.name,
      slug: existing.slug,
      spaceKind: existing.spaceKind,
      status: payload.status,
      isBookable: existing.isBookable,
      timezone: existing.timezone,
      capacity: existing.capacity,
      metadataJson: existing.metadataJson,
      statusLabelsJson: existing.statusLabelsJson,
      sortIndex: existing.sortIndex
    });

    const readModel = await refreshFacilitiesData(org.orgSlug, org.orgId);
    return {
      ok: true,
      data: {
        readModel
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to update open/closed status.");
  }
}

export async function upsertFacilityReservationRuleAction(
  input: z.input<typeof upsertRuleSchema>
): Promise<FacilitiesActionResult<{ ruleId: string; readModel: ReadModelData }>> {
  const parsed = upsertRuleSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Please review the reservation rule details.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "facilities.write");
    const space = await getFacilitySpaceById(org.orgId, payload.spaceId);
    if (!space) {
      return asError("Space not found.");
    }

    const normalizedShape = {
      mode: payload.mode,
      reservationKind: payload.reservationKind ?? "booking",
      defaultStatus: payload.defaultStatus ?? "pending",
      timezone: resolveTimezone(payload.timezone ?? space.timezone),
      startDate: normalizeDate(payload.startDate),
      endDate: normalizeDate(payload.endDate),
      startTime: normalizeOptional(payload.startTime),
      endTime: normalizeOptional(payload.endTime),
      intervalCount: payload.intervalCount ?? 1,
      intervalUnit: payload.intervalUnit ?? "week",
      byWeekday: payload.byWeekday ?? [],
      byMonthday: payload.byMonthday ?? [],
      endMode: payload.endMode ?? "until_date",
      untilDate: normalizeDate(payload.untilDate),
      maxOccurrences: payload.maxOccurrences ?? null,
      eventId: payload.eventId ?? null,
      programId: payload.programId ?? null,
      conflictOverride: payload.conflictOverride ?? false,
      configJson: payload.configJson ?? {}
    };

    const savedRule = await upsertFacilityReservationRule({
      orgId: org.orgId,
      ruleId: payload.ruleId,
      spaceId: payload.spaceId,
      mode: normalizedShape.mode,
      reservationKind: normalizedShape.reservationKind,
      defaultStatus: normalizedShape.defaultStatus,
      publicLabel: normalizeOptional(payload.publicLabel),
      internalNotes: normalizeOptional(payload.internalNotes),
      timezone: normalizedShape.timezone,
      startDate: normalizedShape.startDate,
      endDate: normalizedShape.endDate,
      startTime: normalizedShape.startTime,
      endTime: normalizedShape.endTime,
      intervalCount: normalizedShape.intervalCount,
      intervalUnit: normalizedShape.intervalUnit,
      byWeekday: normalizedShape.byWeekday,
      byMonthday: normalizedShape.byMonthday,
      endMode: normalizedShape.endMode,
      untilDate: normalizedShape.untilDate,
      maxOccurrences: normalizedShape.maxOccurrences,
      eventId: normalizedShape.eventId,
      programId: normalizedShape.programId,
      conflictOverride: normalizedShape.conflictOverride,
      sortIndex: payload.sortIndex ?? 0,
      isActive: payload.isActive ?? true,
      configJson: normalizedShape.configJson,
      ruleHash: buildRuleHash(normalizedShape),
      createdBy: org.userId
    });

    const generated = generateReservationsForRule(savedRule);
    const exceptions = await listFacilityReservationExceptions(org.orgId, { ruleId: savedRule.id });
    const suppressedKeys = new Set(
      exceptions
        .filter((exception) => exception.kind === "skip" || exception.kind === "override")
        .map((exception) => exception.sourceKey)
    );
    const filteredGenerated = generated.filter((reservation) => !suppressedKeys.has(reservation.sourceKey));
    await upsertRuleGeneratedReservations(org.orgId, savedRule.id, filteredGenerated);

    const readModel = await refreshFacilitiesData(org.orgSlug, org.orgId);
    return {
      ok: true,
      data: {
        ruleId: savedRule.id,
        readModel
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    const conflictMessage = asReservationConflictError(error);
    if (conflictMessage) {
      return asError(conflictMessage);
    }
    return asError("Unable to save this reservation rule.");
  }
}

export async function deleteFacilityReservationRuleAction(
  input: z.input<typeof deleteRuleSchema>
): Promise<FacilitiesActionResult<{ readModel: ReadModelData }>> {
  const parsed = deleteRuleSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid reservation rule delete request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "facilities.write");
    const existingRule = await getFacilityReservationRuleById(org.orgId, payload.ruleId);
    if (!existingRule) {
      return asError("Reservation rule not found.");
    }

    await upsertRuleGeneratedReservations(org.orgId, payload.ruleId, []);
    await deleteFacilityReservationRule(org.orgId, payload.ruleId);
    const readModel = await refreshFacilitiesData(org.orgSlug, org.orgId);
    return {
      ok: true,
      data: {
        readModel
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to delete this reservation rule.");
  }
}

export async function createFacilityReservationAction(
  input: z.input<typeof createReservationSchema>
): Promise<FacilitiesActionResult<{ reservationId: string; readModel: ReadModelData }>> {
  const parsed = createReservationSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Please review the reservation details.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "facilities.write");
    const space = await getFacilitySpaceById(org.orgId, payload.spaceId);
    if (!space) {
      return asError("Space not found.");
    }

    if (!space.isBookable || space.status === "archived") {
      return asError("This space cannot be booked.");
    }

    const timezone = resolveTimezone(payload.timezone ?? space.timezone);
    const normalizedWindow = normalizeLocalWindow({
      localDate: payload.localDate,
      localStartTime: payload.localStartTime,
      localEndTime: payload.localEndTime,
      timezone
    });

    const created = await createFacilityReservationRecord({
      orgId: org.orgId,
      spaceId: payload.spaceId,
      sourceRuleId: null,
      sourceKey: `manual:${randomUUID()}`,
      reservationKind: payload.reservationKind ?? "booking",
      status: payload.status ?? "pending",
      timezone,
      localDate: payload.localDate,
      localStartTime: normalizedWindow.localStartTime,
      localEndTime: normalizedWindow.localEndTime,
      startsAtUtc: normalizedWindow.startsAtUtc,
      endsAtUtc: normalizedWindow.endsAtUtc,
      publicLabel: normalizeOptional(payload.publicLabel),
      internalNotes: normalizeOptional(payload.internalNotes),
      eventId: payload.eventId ?? null,
      programId: payload.programId ?? null,
      conflictOverride: payload.conflictOverride ?? false,
      metadataJson: {},
      createdBy: org.userId
    });

    const readModel = await refreshFacilitiesData(org.orgSlug, org.orgId);
    return {
      ok: true,
      data: {
        reservationId: created.id,
        readModel
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    const conflictMessage = asReservationConflictError(error);
    if (conflictMessage) {
      return asError(conflictMessage);
    }
    return asError("Unable to create this reservation.");
  }
}

export async function updateFacilityReservationAction(
  input: z.input<typeof updateReservationSchema>
): Promise<FacilitiesActionResult<{ readModel: ReadModelData }>> {
  const parsed = updateReservationSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Please review the reservation details.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "facilities.write");
    const existing = await getFacilityReservationById(org.orgId, payload.reservationId);
    if (!existing) {
      return asError("Reservation not found.");
    }

    const space = await getFacilitySpaceById(org.orgId, payload.spaceId);
    if (!space) {
      return asError("Space not found.");
    }

    if (!space.isBookable || space.status === "archived") {
      return asError("This space cannot be booked.");
    }

    const timezone = resolveTimezone(payload.timezone ?? space.timezone);
    const normalizedWindow = normalizeLocalWindow({
      localDate: payload.localDate,
      localStartTime: payload.localStartTime,
      localEndTime: payload.localEndTime,
      timezone
    });

    await updateFacilityReservationRecord({
      orgId: org.orgId,
      reservationId: payload.reservationId,
      spaceId: payload.spaceId,
      reservationKind: payload.reservationKind ?? existing.reservationKind,
      status: payload.status,
      timezone,
      localDate: payload.localDate,
      localStartTime: normalizedWindow.localStartTime,
      localEndTime: normalizedWindow.localEndTime,
      startsAtUtc: normalizedWindow.startsAtUtc,
      endsAtUtc: normalizedWindow.endsAtUtc,
      publicLabel: normalizeOptional(payload.publicLabel),
      internalNotes: normalizeOptional(payload.internalNotes),
      eventId: payload.eventId ?? null,
      programId: payload.programId ?? null,
      conflictOverride: payload.conflictOverride ?? existing.conflictOverride,
      metadataJson: existing.metadataJson,
      approvedBy: payload.status === "approved" ? org.userId : payload.status === "pending" ? null : existing.approvedBy,
      approvedAt: payload.status === "approved" ? new Date().toISOString() : payload.status === "pending" ? null : existing.approvedAt,
      rejectedBy: payload.status === "rejected" ? org.userId : payload.status === "pending" ? null : existing.rejectedBy,
      rejectedAt: payload.status === "rejected" ? new Date().toISOString() : payload.status === "pending" ? null : existing.rejectedAt
    });

    const readModel = await refreshFacilitiesData(org.orgSlug, org.orgId);
    return {
      ok: true,
      data: {
        readModel
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    const conflictMessage = asReservationConflictError(error);
    if (conflictMessage) {
      return asError(conflictMessage);
    }
    return asError("Unable to update this reservation.");
  }
}

export async function approveFacilityReservationAction(
  input: z.input<typeof reservationStatusMutationSchema>
): Promise<FacilitiesActionResult<{ readModel: ReadModelData }>> {
  return mutateReservationStatus(input, "approved");
}

export async function rejectFacilityReservationAction(
  input: z.input<typeof reservationStatusMutationSchema>
): Promise<FacilitiesActionResult<{ readModel: ReadModelData }>> {
  return mutateReservationStatus(input, "rejected");
}

export async function cancelFacilityReservationAction(
  input: z.input<typeof reservationStatusMutationSchema>
): Promise<FacilitiesActionResult<{ readModel: ReadModelData }>> {
  return mutateReservationStatus(input, "cancelled");
}

export async function restoreFacilityReservationAction(
  input: z.input<typeof reservationStatusMutationSchema>
): Promise<FacilitiesActionResult<{ readModel: ReadModelData }>> {
  return mutateReservationStatus(input, "pending");
}

async function mutateReservationStatus(
  input: z.input<typeof reservationStatusMutationSchema>,
  status: FacilityReservationStatus
): Promise<FacilitiesActionResult<{ readModel: ReadModelData }>> {
  const parsed = reservationStatusMutationSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid status update request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "facilities.write");
    const existing = await getFacilityReservationById(org.orgId, payload.reservationId);
    if (!existing) {
      return asError("Reservation not found.");
    }

    await setFacilityReservationStatus({
      orgId: org.orgId,
      reservationId: payload.reservationId,
      status,
      actorUserId: org.userId
    });

    const readModel = await refreshFacilitiesData(org.orgSlug, org.orgId);
    return {
      ok: true,
      data: {
        readModel
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    const conflictMessage = asReservationConflictError(error);
    if (conflictMessage) {
      return asError(conflictMessage);
    }
    return asError("Unable to update reservation status.");
  }
}

const createBlackoutSchema = createReservationSchema.extend({
  reservationKind: z.literal("blackout").optional()
});

const updateBlackoutSchema = updateReservationSchema.extend({
  reservationKind: z.literal("blackout").optional()
});

export async function createBlackoutAction(
  input: z.input<typeof createBlackoutSchema>
): Promise<FacilitiesActionResult<{ reservationId: string; readModel: ReadModelData }>> {
  return createFacilityReservationAction({
    ...input,
    reservationKind: "blackout",
    status: input.status ?? "approved"
  });
}

export async function updateBlackoutAction(
  input: z.input<typeof updateBlackoutSchema>
): Promise<FacilitiesActionResult<{ readModel: ReadModelData }>> {
  return updateFacilityReservationAction({
    ...input,
    reservationKind: "blackout"
  });
}

export async function cancelBlackoutAction(
  input: z.input<typeof reservationStatusMutationSchema>
): Promise<FacilitiesActionResult<{ readModel: ReadModelData }>> {
  return cancelFacilityReservationAction(input);
}

const upsertExceptionSchema = z.object({
  orgSlug: textSchema.min(1),
  ruleId: z.string().uuid(),
  sourceKey: textSchema.min(1),
  kind: z.enum(["skip", "override"] satisfies FacilityReservationExceptionKind[]),
  overrideReservationId: z.string().uuid().nullable().optional(),
  payloadJson: z.record(z.string(), z.unknown()).optional()
});

const deleteExceptionSchema = z.object({
  orgSlug: textSchema.min(1),
  ruleId: z.string().uuid(),
  sourceKey: textSchema.min(1),
  kind: z.enum(["skip", "override"] satisfies FacilityReservationExceptionKind[]).optional()
});

export async function upsertFacilityReservationExceptionAction(
  input: z.input<typeof upsertExceptionSchema>
): Promise<FacilitiesActionResult<{ readModel: ReadModelData }>> {
  const parsed = upsertExceptionSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid exception details.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "facilities.write");
    const rule = await getFacilityReservationRuleById(org.orgId, payload.ruleId);
    if (!rule) {
      return asError("Reservation rule not found.");
    }

    await upsertFacilityReservationException({
      orgId: org.orgId,
      ruleId: payload.ruleId,
      sourceKey: payload.sourceKey,
      kind: payload.kind,
      overrideReservationId: payload.overrideReservationId ?? null,
      payloadJson: payload.payloadJson ?? {},
      createdBy: org.userId
    });

    const readModel = await refreshFacilitiesData(org.orgSlug, org.orgId);
    return {
      ok: true,
      data: {
        readModel
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to save this exception.");
  }
}

export async function deleteFacilityReservationExceptionAction(
  input: z.input<typeof deleteExceptionSchema>
): Promise<FacilitiesActionResult<{ readModel: ReadModelData }>> {
  const parsed = deleteExceptionSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid exception delete request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "facilities.write");
    await deleteFacilityReservationException({
      orgId: org.orgId,
      ruleId: payload.ruleId,
      sourceKey: payload.sourceKey,
      kind: payload.kind
    });

    const readModel = await refreshFacilitiesData(org.orgSlug, org.orgId);
    return {
      ok: true,
      data: {
        readModel
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to delete this exception.");
  }
}
