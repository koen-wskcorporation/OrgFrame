"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgPermission } from "@/src/shared/permissions/requireOrgPermission";
import { rethrowIfNavigationError } from "@/src/shared/navigation/rethrowIfNavigationError";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { can } from "@/src/shared/permissions/can";
import {
  getProgramById,
  getProgramDetailsById,
  listProgramNodes,
  updateProgramNodeHierarchyRecord,
  updateProgramNodeMapGeometryBatch,
  type ProgramNodeMapUpdate
} from "@/src/features/programs/db/queries";
import {
  getProgramMapNodeCounts,
  getTeamIdByNodeIdMap,
  listUnassignedCoachDockItems,
  listUnassignedPlayerDockItems,
  type ProgramMapNodeCounts
} from "@/src/features/programs/map/queries";
import type { ProgramNode } from "@/src/features/programs/types";
import type { AssignmentCandidate } from "@/src/features/programs/map/types";

const textSchema = z.string().trim();

const reparentEntrySchema = z.object({
  nodeId: z.string().uuid(),
  parentId: z.string().uuid().nullable()
});

const mapUpdateSchema = z.object({
  nodeId: z.string().uuid(),
  mapX: z.number().int(),
  mapY: z.number().int(),
  mapWidth: z.number().int().positive(),
  mapHeight: z.number().int().positive(),
  mapZIndex: z.number().int()
});

const saveProgramMapSchema = z.object({
  orgSlug: textSchema.min(1),
  programId: z.string().uuid(),
  updates: z.array(mapUpdateSchema).max(1000),
  reparents: z.array(reparentEntrySchema).max(500).optional()
});

export type ProgramMapActionResult<TData = undefined> =
  | { ok: true; data: TData }
  | { ok: false; error: string };

function asError(error: string): ProgramMapActionResult<never> {
  return { ok: false, error };
}

export type ProgramMapPageData = {
  org: { orgId: string; orgSlug: string; canWrite: boolean };
  program: NonNullable<Awaited<ReturnType<typeof getProgramDetailsById>>>["program"];
  nodes: ProgramNode[];
  teamIdByNodeId: Record<string, string>;
  nodeCounts: ProgramMapNodeCounts;
  assignmentDock: {
    players: AssignmentCandidate[];
    coaches: AssignmentCandidate[];
  };
};

export async function getProgramMapPageData(
  orgSlug: string,
  programId: string
): Promise<ProgramMapPageData | null> {
  const orgContext = await getOrgAuthContext(orgSlug);
  const canRead =
    can(orgContext.membershipPermissions, "programs.read") ||
    can(orgContext.membershipPermissions, "programs.write");

  if (!canRead) {
    throw new Error("FORBIDDEN");
  }

  const details = await getProgramDetailsById(orgContext.orgId, programId);
  if (!details) return null;

  const [teamIdMap, players, coaches, nodeCounts] = await Promise.all([
    getTeamIdByNodeIdMap(programId),
    listUnassignedPlayerDockItems(programId),
    listUnassignedCoachDockItems(programId),
    getProgramMapNodeCounts(programId)
  ]);

  return {
    org: {
      orgId: orgContext.orgId,
      orgSlug: orgContext.orgSlug,
      canWrite: can(orgContext.membershipPermissions, "programs.write")
    },
    program: details.program,
    nodes: details.nodes,
    teamIdByNodeId: Object.fromEntries(teamIdMap.entries()),
    nodeCounts,
    assignmentDock: { players, coaches }
  };
}

export async function saveProgramMapAction(
  input: z.input<typeof saveProgramMapSchema>
): Promise<ProgramMapActionResult<{ nodes: ProgramNode[] }>> {
  const parsed = saveProgramMapSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid program map payload.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "programs.write");
    const program = await getProgramById(org.orgId, payload.programId);
    if (!program) {
      return asError("Program not found.");
    }

    if (payload.reparents && payload.reparents.length > 0) {
      const existingNodes = await listProgramNodes(payload.programId);
      const byId = new Map(existingNodes.map((node) => [node.id, node]));

      for (const entry of payload.reparents) {
        const target = byId.get(entry.nodeId);
        if (!target) {
          return asError("One or more nodes were modified elsewhere. Refresh and try again.");
        }
        if (target.nodeKind !== "team") {
          return asError("Only teams can be reparented from the map.");
        }
        if (entry.parentId) {
          const parent = byId.get(entry.parentId);
          if (!parent || parent.nodeKind !== "division") {
            return asError("Teams can only sit inside divisions.");
          }
        } else {
          return asError("Teams must remain inside a division.");
        }

        await updateProgramNodeHierarchyRecord({
          programId: payload.programId,
          nodeId: entry.nodeId,
          parentId: entry.parentId,
          nodeKind: target.nodeKind,
          sortIndex: target.sortIndex
        });
      }
    }

    const updates: ProgramNodeMapUpdate[] = payload.updates.map((entry) => ({
      nodeId: entry.nodeId,
      mapX: entry.mapX,
      mapY: entry.mapY,
      mapWidth: entry.mapWidth,
      mapHeight: entry.mapHeight,
      mapZIndex: entry.mapZIndex
    }));

    await updateProgramNodeMapGeometryBatch({
      programId: payload.programId,
      updates
    });

    const refreshed = await listProgramNodes(payload.programId);

    revalidatePath(`/${org.orgSlug}/manage/programs/${payload.programId}/structure`);
    revalidatePath(`/${org.orgSlug}/manage/programs/${payload.programId}/teams`);

    return { ok: true, data: { nodes: refreshed } };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to save program map right now.");
  }
}
