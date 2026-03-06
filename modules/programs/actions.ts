"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { getOrgPublicContext } from "@/lib/org/getOrgPublicContext";
import { can } from "@/lib/permissions/can";
import { requireOrgPermission } from "@/lib/permissions/requireOrgPermission";
import { rethrowIfNavigationError } from "@/lib/actions/rethrowIfNavigationError";
import {
  createProgramNodeRecord,
  createProgramRecord,
  createProgramScheduleBlockRecord,
  deleteProgramNodeRecord,
  deleteProgramScheduleBlockRecord,
  getProgramById,
  getProgramDetailsById,
  getProgramDetailsBySlug,
  listProgramNodes,
  listProgramsForManage,
  listPublishedProgramsForCatalog,
  updateProgramNodeHierarchyRecord,
  updateProgramNodeRecord,
  updateProgramNodeSettingsRecord,
  updateProgramRecord
} from "@/modules/programs/db/queries";
import { getTeamAssociationCountsByNode } from "@/modules/programs/teams/db/queries";
import type { ProgramScheduleBlockType, ProgramType } from "@/modules/programs/types";

const textSchema = z.string().trim();
const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const nullableDateSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => {
    if (!value) {
      return null;
    }

    return value;
  });

const nullableDateTimeSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => {
    if (!value) {
      return null;
    }

    return value;
  });

const createProgramSchema = z.object({
  orgSlug: textSchema.min(1),
  slug: slugSchema,
  name: textSchema.min(2).max(120),
  description: textSchema.max(2000).optional(),
  programType: z.enum(["league", "season", "clinic", "custom"] satisfies ProgramType[]),
  customTypeLabel: textSchema.max(80).optional(),
  status: z.enum(["draft", "published", "archived"]),
  startDate: nullableDateSchema,
  endDate: nullableDateSchema,
  coverImagePath: textSchema.max(500).optional(),
  registrationOpenAt: nullableDateTimeSchema,
  registrationCloseAt: nullableDateTimeSchema
});

const updateProgramSchema = createProgramSchema.extend({
  programId: z.string().uuid()
});

const duplicateProgramSchema = z.object({
  orgSlug: textSchema.min(1),
  programId: z.string().uuid()
});

const saveHierarchySchema = z.object({
  orgSlug: textSchema.min(1),
  programId: z.string().uuid(),
  action: z.enum(["create", "delete", "reorder", "set-published", "update"]),
  nodeId: z.string().uuid().optional(),
  parentId: z.string().uuid().nullable().optional(),
  name: textSchema.max(120).optional(),
  slug: slugSchema.optional(),
  nodeKind: z.enum(["division", "team"]).optional(),
  capacity: z
    .union([z.number().int().min(0), z.null()])
    .optional()
    .transform((value) => (typeof value === "number" ? value : null)),
  waitlistEnabled: z.boolean().optional(),
  nodes: z
    .array(
      z.object({
        nodeId: z.string().uuid(),
        parentId: z.string().uuid().nullable(),
        sortIndex: z.number().int().min(0),
        nodeKind: z.enum(["division", "team"])
      })
    )
    .optional(),
  isPublished: z.boolean().optional()
});

const saveScheduleSchema = z.object({
  orgSlug: textSchema.min(1),
  programId: z.string().uuid(),
  action: z.enum(["create", "delete"]),
  scheduleBlockId: z.string().uuid().optional(),
  programNodeId: z.string().uuid().nullable().optional(),
  blockType: z.enum(["date_range", "meeting_pattern", "one_off"] satisfies ProgramScheduleBlockType[]).optional(),
  title: textSchema.max(120).optional(),
  timezone: textSchema.max(80).optional(),
  startDate: nullableDateSchema,
  endDate: nullableDateSchema,
  startTime: textSchema.max(20).optional(),
  endTime: textSchema.max(20).optional(),
  byDay: z.array(z.number().int().min(0).max(6)).optional(),
  oneOffAt: nullableDateTimeSchema
});

export type ProgramsActionResult<TData = undefined> =
  | {
      ok: true;
      data: TData;
    }
  | {
      ok: false;
      error: string;
    };

function asError(error: string): ProgramsActionResult<never> {
  return {
    ok: false,
    error
  };
}

function normalizeOptional(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function buildCopyName(baseName: string, existingNames: Set<string>) {
  const trimmed = baseName.trim();
  const initial = `${trimmed} Copy`;
  if (!existingNames.has(initial.toLowerCase())) {
    return initial;
  }

  let index = 2;
  while (existingNames.has(`${trimmed} Copy ${index}`.toLowerCase())) {
    index += 1;
  }

  return `${trimmed} Copy ${index}`;
}

function buildCopySlug(baseSlug: string, existingSlugs: Set<string>) {
  const initial = `${baseSlug}-copy`;
  if (!existingSlugs.has(initial)) {
    return initial;
  }

  let index = 2;
  while (existingSlugs.has(`${baseSlug}-copy-${index}`)) {
    index += 1;
  }

  return `${baseSlug}-copy-${index}`;
}

function validateNodeParenting(
  nodeKind: "division" | "team",
  parentId: string | null,
  nodeById: Map<string, { nodeKind: "division" | "team" }>
): string | null {
  if (nodeKind === "team") {
    if (!parentId) {
      return "Teams must be created inside a division.";
    }

    const parentNode = nodeById.get(parentId);
    if (!parentNode || parentNode.nodeKind !== "division") {
      return "Teams can only be placed inside divisions.";
    }
  }

  if (nodeKind === "division" && parentId) {
    const parentNode = nodeById.get(parentId);
    if (parentNode?.nodeKind === "team") {
      return "Teams cannot contain divisions.";
    }
  }

  return null;
}

async function requireProgramsReadOrWrite(orgSlug: string) {
  const orgContext = await getOrgAuthContext(orgSlug);
  const hasAccess = can(orgContext.membershipPermissions, "programs.read") || can(orgContext.membershipPermissions, "programs.write");

  if (!hasAccess) {
    throw new Error("FORBIDDEN");
  }

  return orgContext;
}

export async function getProgramsManagePageData(orgSlug: string) {
  const org = await requireProgramsReadOrWrite(orgSlug);
  const programs = await listProgramsForManage(org.orgId);

  return {
    org,
    programs
  };
}

export async function getProgramManageDetail(orgSlug: string, programId: string) {
  const org = await requireProgramsReadOrWrite(orgSlug);
  const details = await getProgramDetailsById(org.orgId, programId);

  if (!details) {
    return null;
  }

  return {
    org,
    details
  };
}

export async function getPublishedProgramsCatalog(orgSlug: string) {
  const org = await getOrgAuthContext(orgSlug).catch(() => null);
  if (org && can(org.membershipPermissions, "programs.read")) {
    return listProgramsForManage(org.orgId);
  }

  return [];
}

export async function createProgramAction(input: z.input<typeof createProgramSchema>): Promise<ProgramsActionResult<{ programId: string }>> {
  const parsed = createProgramSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Please fill in the required program fields.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "programs.write");
    const created = await createProgramRecord({
      orgId: org.orgId,
      slug: payload.slug,
      name: payload.name,
      description: normalizeOptional(payload.description),
      programType: payload.programType,
      customTypeLabel: payload.programType === "custom" ? normalizeOptional(payload.customTypeLabel) : null,
      status: payload.status,
      startDate: payload.startDate,
      endDate: payload.endDate,
      coverImagePath: normalizeOptional(payload.coverImagePath),
      registrationOpenAt: payload.registrationOpenAt,
      registrationCloseAt: payload.registrationCloseAt,
      settingsJson: {}
    });

    revalidatePath(`/${org.orgSlug}/tools/programs`);
    revalidatePath(`/${org.orgSlug}/programs`);

    return {
      ok: true,
      data: {
        programId: created.id
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to create this program right now.");
  }
}

export async function updateProgramAction(input: z.input<typeof updateProgramSchema>): Promise<ProgramsActionResult<{ programId: string }>> {
  const parsed = updateProgramSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Please review the program details.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "programs.write");
    const updated = await updateProgramRecord({
      orgId: org.orgId,
      programId: payload.programId,
      slug: payload.slug,
      name: payload.name,
      description: normalizeOptional(payload.description),
      programType: payload.programType,
      customTypeLabel: payload.programType === "custom" ? normalizeOptional(payload.customTypeLabel) : null,
      status: payload.status,
      startDate: payload.startDate,
      endDate: payload.endDate,
      coverImagePath: normalizeOptional(payload.coverImagePath),
      registrationOpenAt: payload.registrationOpenAt,
      registrationCloseAt: payload.registrationCloseAt,
      settingsJson: {}
    });

    revalidatePath(`/${org.orgSlug}/tools/programs`);
    revalidatePath(`/${org.orgSlug}/tools/programs/${updated.id}`);
    revalidatePath(`/${org.orgSlug}/programs`);
    revalidatePath(`/${org.orgSlug}/programs/${updated.slug}`);

    return {
      ok: true,
      data: {
        programId: updated.id
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to update this program right now.");
  }
}

export async function duplicateProgramAction(input: z.input<typeof duplicateProgramSchema>): Promise<ProgramsActionResult<{ programId: string }>> {
  const parsed = duplicateProgramSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid duplicate request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "programs.write");
    const source = await getProgramDetailsById(org.orgId, payload.programId);

    if (!source) {
      return asError("Program not found.");
    }

    const existingPrograms = await listProgramsForManage(org.orgId);
    const existingSlugs = new Set(existingPrograms.map((program) => program.slug.toLowerCase()));
    const existingNames = new Set(existingPrograms.map((program) => program.name.toLowerCase()));

    const nextProgram = await createProgramRecord({
      orgId: org.orgId,
      slug: buildCopySlug(source.program.slug, existingSlugs),
      name: buildCopyName(source.program.name, existingNames),
      description: source.program.description,
      programType: source.program.programType,
      customTypeLabel: source.program.customTypeLabel,
      status: source.program.status,
      startDate: source.program.startDate,
      endDate: source.program.endDate,
      coverImagePath: source.program.coverImagePath,
      registrationOpenAt: source.program.registrationOpenAt,
      registrationCloseAt: source.program.registrationCloseAt,
      settingsJson: source.program.settingsJson
    });

    const sourceNodes = [...source.nodes];
    const nodeIdMap = new Map<string, string>();
    const pendingNodes = [...sourceNodes];

    while (pendingNodes.length > 0) {
      let insertedInPass = 0;

      for (let index = 0; index < pendingNodes.length; ) {
        const node = pendingNodes[index];
        if (node.parentId && !nodeIdMap.has(node.parentId)) {
          index += 1;
          continue;
        }

        const created = await createProgramNodeRecord({
          programId: nextProgram.id,
          parentId: node.parentId ? nodeIdMap.get(node.parentId) ?? null : null,
          name: node.name,
          slug: node.slug,
          nodeKind: node.nodeKind,
          capacity: node.capacity,
          waitlistEnabled: node.waitlistEnabled,
          sortIndex: node.sortIndex,
          settingsJson: node.settingsJson
        });

        nodeIdMap.set(node.id, created.id);
        pendingNodes.splice(index, 1);
        insertedInPass += 1;
      }

      if (insertedInPass === 0) {
        return asError("Unable to duplicate program hierarchy.");
      }
    }

    for (const block of source.scheduleBlocks) {
      await createProgramScheduleBlockRecord({
        programId: nextProgram.id,
        programNodeId: block.programNodeId ? nodeIdMap.get(block.programNodeId) ?? null : null,
        blockType: block.blockType,
        title: block.title,
        timezone: block.timezone,
        startDate: block.startDate,
        endDate: block.endDate,
        startTime: block.startTime,
        endTime: block.endTime,
        byDay: block.byDay,
        oneOffAt: block.oneOffAt,
        sortIndex: block.sortIndex,
        settingsJson: block.settingsJson
      });
    }

    revalidatePath(`/${org.orgSlug}/tools/programs`);
    revalidatePath(`/${org.orgSlug}/tools/programs/${nextProgram.id}`);
    revalidatePath(`/${org.orgSlug}/programs`);
    revalidatePath(`/${org.orgSlug}/programs/${nextProgram.slug}`);

    return {
      ok: true,
      data: {
        programId: nextProgram.id
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to duplicate this program right now.");
  }
}

export async function saveProgramHierarchyAction(input: z.input<typeof saveHierarchySchema>): Promise<ProgramsActionResult<{ details: NonNullable<Awaited<ReturnType<typeof getProgramDetailsById>>> }>> {
  const parsed = saveHierarchySchema.safeParse(input);
  if (!parsed.success) {
    return asError("Please review program structure details.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "programs.write");
    const program = await getProgramById(org.orgId, payload.programId);

    if (!program) {
      return asError("Program not found.");
    }

    if (payload.action === "create") {
      if (!payload.name || !payload.slug || !payload.nodeKind) {
        return asError("Node name, slug, and type are required.");
      }

      const existingNodes = await listProgramNodes(payload.programId);
      const nodeById = new Map(existingNodes.map((node) => [node.id, { nodeKind: node.nodeKind }]));
      if (payload.parentId && !nodeById.has(payload.parentId)) {
        return asError("Parent node not found.");
      }

      const parentValidationError = validateNodeParenting(payload.nodeKind, payload.parentId ?? null, nodeById);
      if (parentValidationError) {
        return asError(parentValidationError);
      }

      await createProgramNodeRecord({
        programId: payload.programId,
        parentId: payload.parentId ?? null,
        name: payload.name,
        slug: payload.slug,
        nodeKind: payload.nodeKind,
        capacity: payload.capacity,
        waitlistEnabled: payload.waitlistEnabled ?? false,
        settingsJson: {}
      });
    } else if (payload.action === "delete") {
      if (!payload.nodeId) {
        return asError("Node id is required for delete.");
      }

      await deleteProgramNodeRecord(payload.programId, payload.nodeId);
    } else if (payload.action === "reorder") {
      if (!payload.nodes || payload.nodes.length === 0) {
        return asError("No hierarchy changes were provided.");
      }

      const existingNodes = await listProgramNodes(payload.programId);
      if (existingNodes.length === 0) {
        return asError("No nodes are available to reorder.");
      }

      const existingIds = new Set(existingNodes.map((node) => node.id));
      const inputNodeIds = payload.nodes.map((node) => node.nodeId);
      const uniqueInputNodeIds = new Set(inputNodeIds);

      if (payload.nodes.length !== existingNodes.length || uniqueInputNodeIds.size !== payload.nodes.length) {
        return asError("Hierarchy changed while editing. Refresh and try again.");
      }

      for (const nodeId of inputNodeIds) {
        if (!existingIds.has(nodeId)) {
          return asError("One or more nodes no longer exist. Refresh and try again.");
        }
      }

      for (const node of payload.nodes) {
        if (node.parentId === node.nodeId) {
          return asError("A node cannot be its own parent.");
        }

        if (node.parentId && !existingIds.has(node.parentId)) {
          return asError("Invalid parent assignment detected. Refresh and try again.");
        }
      }

      const parentByNodeId = new Map(payload.nodes.map((node) => [node.nodeId, node.parentId]));
      const kindByNodeId = new Map(payload.nodes.map((node) => [node.nodeId, { nodeKind: node.nodeKind }]));
      for (const nodeId of uniqueInputNodeIds) {
        const seen = new Set<string>([nodeId]);
        let currentParentId = parentByNodeId.get(nodeId) ?? null;

        while (currentParentId) {
          if (seen.has(currentParentId)) {
            return asError("Invalid hierarchy: recursive parent assignment detected.");
          }

          seen.add(currentParentId);
          currentParentId = parentByNodeId.get(currentParentId) ?? null;
        }
      }

      for (const node of payload.nodes) {
        const parentValidationError = validateNodeParenting(node.nodeKind, node.parentId, kindByNodeId);
        if (parentValidationError) {
          return asError(parentValidationError);
        }
      }

      const groups = new Map<string, Array<{ nodeId: string; parentId: string | null; sortIndex: number; nodeKind: "division" | "team" }>>();
      for (const node of payload.nodes) {
        const key = node.parentId ?? "__root__";
        const current = groups.get(key) ?? [];
        current.push(node);
        groups.set(key, current);
      }

      const existingSortByNodeId = new Map(existingNodes.map((node) => [node.id, node.sortIndex]));
      for (const [key, group] of groups.entries()) {
        group.sort((a, b) => {
          if (a.sortIndex !== b.sortIndex) {
            return a.sortIndex - b.sortIndex;
          }

          return (existingSortByNodeId.get(a.nodeId) ?? 0) - (existingSortByNodeId.get(b.nodeId) ?? 0);
        });

        for (let index = 0; index < group.length; index += 1) {
          const item = group[index];
          await updateProgramNodeHierarchyRecord({
            programId: payload.programId,
            nodeId: item.nodeId,
            parentId: key === "__root__" ? null : key,
            sortIndex: index,
            nodeKind: item.nodeKind
          });
        }
      }
    } else if (payload.action === "set-published") {
      if (!payload.nodeId || typeof payload.isPublished !== "boolean") {
        return asError("Node id and publish state are required.");
      }

      const existingNodes = await listProgramNodes(payload.programId);
      const targetNode = existingNodes.find((node) => node.id === payload.nodeId);

      if (!targetNode) {
        return asError("Node not found.");
      }

      await updateProgramNodeSettingsRecord({
        programId: payload.programId,
        nodeId: payload.nodeId,
        settingsJson: {
          ...targetNode.settingsJson,
          published: payload.isPublished
        }
      });
    } else {
      if (!payload.nodeId || !payload.name || !payload.slug || !payload.nodeKind) {
        return asError("Node id, name, slug, and type are required.");
      }

      const existingNodes = await listProgramNodes(payload.programId);
      const targetNode = existingNodes.find((node) => node.id === payload.nodeId);

      if (!targetNode) {
        return asError("Node not found.");
      }

      if (targetNode.nodeKind === "team" && payload.nodeKind === "division") {
        const counts = await getTeamAssociationCountsByNode(targetNode.id);
        if (counts.memberCount > 0 || counts.staffCount > 0) {
          return asError("Teams with roster or staff cannot be converted to divisions.");
        }
      }

      const nodeById = new Map(existingNodes.map((node) => [node.id, { nodeKind: node.nodeKind }]));
      const parentValidationError = validateNodeParenting(payload.nodeKind, targetNode.parentId, nodeById);
      if (parentValidationError) {
        return asError(parentValidationError);
      }

      await updateProgramNodeRecord({
        programId: payload.programId,
        nodeId: payload.nodeId,
        name: payload.name,
        slug: payload.slug,
        nodeKind: payload.nodeKind,
        capacity: payload.capacity,
        waitlistEnabled: payload.waitlistEnabled ?? targetNode.waitlistEnabled
      });

      if (typeof payload.isPublished === "boolean") {
        await updateProgramNodeSettingsRecord({
          programId: payload.programId,
          nodeId: payload.nodeId,
          settingsJson: {
            ...targetNode.settingsJson,
            published: payload.isPublished
          }
        });
      }
    }

    const refreshedDetails = await getProgramDetailsById(org.orgId, payload.programId);
    if (!refreshedDetails) {
      return asError("Program not found.");
    }

    revalidatePath(`/${org.orgSlug}/tools/programs/${payload.programId}`);
    revalidatePath(`/${org.orgSlug}/programs/${program.slug}`);

    return {
      ok: true,
      data: {
        details: refreshedDetails
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to save program structure right now.");
  }
}

export async function saveProgramScheduleAction(input: z.input<typeof saveScheduleSchema>): Promise<ProgramsActionResult<{ details: NonNullable<Awaited<ReturnType<typeof getProgramDetailsById>>> }>> {
  const parsed = saveScheduleSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Please review schedule details.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "programs.write");
    const program = await getProgramById(org.orgId, payload.programId);

    if (!program) {
      return asError("Program not found.");
    }

    if (payload.action === "create") {
      if (!payload.blockType) {
        return asError("Schedule block type is required.");
      }

      await createProgramScheduleBlockRecord({
        programId: payload.programId,
        programNodeId: payload.programNodeId ?? null,
        blockType: payload.blockType,
        title: normalizeOptional(payload.title),
        timezone: normalizeOptional(payload.timezone),
        startDate: payload.startDate,
        endDate: payload.endDate,
        startTime: normalizeOptional(payload.startTime),
        endTime: normalizeOptional(payload.endTime),
        byDay: payload.byDay ?? null,
        oneOffAt: payload.oneOffAt,
        settingsJson: {}
      });
    } else {
      if (!payload.scheduleBlockId) {
        return asError("Schedule block id is required for delete.");
      }

      await deleteProgramScheduleBlockRecord(payload.programId, payload.scheduleBlockId);
    }

    const refreshedDetails = await getProgramDetailsById(org.orgId, payload.programId);
    if (!refreshedDetails) {
      return asError("Program not found.");
    }

    revalidatePath(`/${org.orgSlug}/tools/programs/${payload.programId}`);
    revalidatePath(`/${org.orgSlug}/programs/${program.slug}`);

    return {
      ok: true,
      data: {
        details: refreshedDetails
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to save schedule right now.");
  }
}

export async function getPublicProgramDetails(orgSlug: string, programSlug: string) {
  const orgContext = await getOrgPublicContext(orgSlug);
  return getProgramDetailsBySlug(orgContext.orgId, programSlug, {
    includeDraft: false
  });
}

export async function getPublicProgramCatalog(orgSlug: string) {
  const orgContext = await getOrgPublicContext(orgSlug);
  return listPublishedProgramsForCatalog(orgContext.orgId);
}
