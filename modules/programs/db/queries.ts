import { createSupabaseServer } from "@/lib/supabase/server";
import type { Program, ProgramCatalogItem, ProgramNode, ProgramScheduleBlock, ProgramWithDetails } from "@/modules/programs/types";
import { isProgramNodePublished } from "@/modules/programs/utils";

const programSelect =
  "id, org_id, slug, name, description, status, program_type, custom_type_label, registration_open_at, registration_close_at, start_date, end_date, cover_image_path, settings_json, created_at, updated_at";
const nodeSelect = "id, program_id, parent_id, name, slug, node_kind, sort_index, capacity, waitlist_enabled, settings_json, created_at, updated_at";
const scheduleSelect =
  "id, program_id, program_node_id, block_type, title, timezone, start_date, end_date, start_time, end_time, by_day, one_off_at, sort_index, settings_json, created_at, updated_at";

type ProgramRow = {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  description: string | null;
  status: Program["status"];
  program_type: Program["programType"];
  custom_type_label: string | null;
  registration_open_at: string | null;
  registration_close_at: string | null;
  start_date: string | null;
  end_date: string | null;
  cover_image_path: string | null;
  settings_json: unknown;
  created_at: string;
  updated_at: string;
};

type NodeRow = {
  id: string;
  program_id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  node_kind: ProgramNode["nodeKind"];
  sort_index: number;
  capacity: number | null;
  waitlist_enabled: boolean;
  settings_json: unknown;
  created_at: string;
  updated_at: string;
};

type ScheduleRow = {
  id: string;
  program_id: string;
  program_node_id: string | null;
  block_type: ProgramScheduleBlock["blockType"];
  title: string | null;
  timezone: string | null;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  by_day: number[] | null;
  one_off_at: string | null;
  sort_index: number;
  settings_json: unknown;
  created_at: string;
  updated_at: string;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function mapProgram(row: ProgramRow): Program {
  return {
    id: row.id,
    orgId: row.org_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    status: row.status,
    programType: row.program_type,
    customTypeLabel: row.custom_type_label,
    registrationOpenAt: row.registration_open_at,
    registrationCloseAt: row.registration_close_at,
    startDate: row.start_date,
    endDate: row.end_date,
    coverImagePath: row.cover_image_path,
    settingsJson: asObject(row.settings_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapNode(row: NodeRow): ProgramNode {
  return {
    id: row.id,
    programId: row.program_id,
    parentId: row.parent_id,
    name: row.name,
    slug: row.slug,
    nodeKind: row.node_kind,
    sortIndex: Number.isFinite(row.sort_index) ? row.sort_index : 0,
    capacity: row.capacity,
    waitlistEnabled: row.waitlist_enabled,
    settingsJson: asObject(row.settings_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapSchedule(row: ScheduleRow): ProgramScheduleBlock {
  return {
    id: row.id,
    programId: row.program_id,
    programNodeId: row.program_node_id,
    blockType: row.block_type,
    title: row.title,
    timezone: row.timezone,
    startDate: row.start_date,
    endDate: row.end_date,
    startTime: row.start_time,
    endTime: row.end_time,
    byDay: Array.isArray(row.by_day) ? row.by_day.filter((value) => Number.isInteger(value)) : null,
    oneOffAt: row.one_off_at,
    sortIndex: Number.isFinite(row.sort_index) ? row.sort_index : 0,
    settingsJson: asObject(row.settings_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listProgramsForManage(orgId: string): Promise<Program[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("programs")
    .select(programSelect)
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list programs: ${error.message}`);
  }

  return (data ?? []).map((row) => mapProgram(row as ProgramRow));
}

export async function listPublishedProgramsForCatalog(orgId: string, options?: { limit?: number }): Promise<ProgramCatalogItem[]> {
  const supabase = await createSupabaseServer();
  let query = supabase
    .from("programs")
    .select(programSelect)
    .eq("org_id", orgId)
    .eq("status", "published")
    .order("start_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (options?.limit && options.limit > 0) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list published programs: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const program = mapProgram(row as ProgramRow);
    return {
      id: program.id,
      slug: program.slug,
      name: program.name,
      description: program.description,
      status: program.status,
      programType: program.programType,
      customTypeLabel: program.customTypeLabel,
      startDate: program.startDate,
      endDate: program.endDate,
      registrationOpenAt: program.registrationOpenAt,
      registrationCloseAt: program.registrationCloseAt,
      coverImagePath: program.coverImagePath,
      settingsJson: program.settingsJson
    } satisfies ProgramCatalogItem;
  });
}

export async function getProgramById(orgId: string, programId: string): Promise<Program | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("programs")
    .select(programSelect)
    .eq("org_id", orgId)
    .eq("id", programId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load program: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return mapProgram(data as ProgramRow);
}

export async function getProgramBySlug(orgId: string, programSlug: string, options?: { includeDraft?: boolean }): Promise<Program | null> {
  const supabase = await createSupabaseServer();
  let query = supabase.from("programs").select(programSelect).eq("org_id", orgId).eq("slug", programSlug).limit(1);

  if (!options?.includeDraft) {
    query = query.eq("status", "published");
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(`Failed to load program: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return mapProgram(data as ProgramRow);
}

export async function getProgramDetailsById(orgId: string, programId: string): Promise<ProgramWithDetails | null> {
  const program = await getProgramById(orgId, programId);

  if (!program) {
    return null;
  }

  const [nodes, scheduleBlocks] = await Promise.all([listProgramNodes(program.id), listProgramScheduleBlocks(program.id)]);

  return {
    program,
    nodes,
    scheduleBlocks
  };
}

export async function getProgramDetailsBySlug(
  orgId: string,
  programSlug: string,
  options?: { includeDraft?: boolean }
): Promise<ProgramWithDetails | null> {
  const program = await getProgramBySlug(orgId, programSlug, options);

  if (!program) {
    return null;
  }

  const [allNodes, scheduleBlocks] = await Promise.all([listProgramNodes(program.id), listProgramScheduleBlocks(program.id)]);
  const nodes =
    options?.includeDraft === false
      ? (() => {
          const nodeById = new Map(allNodes.map((node) => [node.id, node]));
          const visibilityCache = new Map<string, boolean>();

          const isVisible = (node: ProgramNode): boolean => {
            const cached = visibilityCache.get(node.id);
            if (typeof cached === "boolean") {
              return cached;
            }

            if (!isProgramNodePublished(node)) {
              visibilityCache.set(node.id, false);
              return false;
            }

            if (!node.parentId) {
              visibilityCache.set(node.id, true);
              return true;
            }

            const parent = nodeById.get(node.parentId);
            if (!parent) {
              visibilityCache.set(node.id, false);
              return false;
            }

            const visible = isVisible(parent);
            visibilityCache.set(node.id, visible);
            return visible;
          };

          return allNodes.filter((node) => isVisible(node));
        })()
      : allNodes;

  return {
    program,
    nodes,
    scheduleBlocks
  };
}

export async function listProgramNodes(programId: string, options?: { publishedOnly?: boolean }): Promise<ProgramNode[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("program_nodes")
    .select(nodeSelect)
    .eq("program_id", programId)
    .order("sort_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list program nodes: ${error.message}`);
  }

  const nodes = (data ?? []).map((row) => mapNode(row as NodeRow));
  if (!options?.publishedOnly) {
    return nodes;
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const visibilityCache = new Map<string, boolean>();

  const isVisible = (node: ProgramNode): boolean => {
    const cached = visibilityCache.get(node.id);
    if (typeof cached === "boolean") {
      return cached;
    }

    if (!isProgramNodePublished(node)) {
      visibilityCache.set(node.id, false);
      return false;
    }

    if (!node.parentId) {
      visibilityCache.set(node.id, true);
      return true;
    }

    const parent = nodeById.get(node.parentId);
    if (!parent) {
      visibilityCache.set(node.id, false);
      return false;
    }

    const visible = isVisible(parent);
    visibilityCache.set(node.id, visible);
    return visible;
  };

  return nodes.filter((node) => isVisible(node));
}

export async function listProgramScheduleBlocks(programId: string): Promise<ProgramScheduleBlock[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("program_schedule_blocks")
    .select(scheduleSelect)
    .eq("program_id", programId)
    .order("sort_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list program schedule blocks: ${error.message}`);
  }

  return (data ?? []).map((row) => mapSchedule(row as ScheduleRow));
}

export async function createProgramRecord(input: {
  orgId: string;
  slug: string;
  name: string;
  description: string | null;
  programType: Program["programType"];
  customTypeLabel: string | null;
  status: Program["status"];
  startDate: string | null;
  endDate: string | null;
  registrationOpenAt: string | null;
  registrationCloseAt: string | null;
  coverImagePath: string | null;
  settingsJson?: Record<string, unknown>;
}): Promise<Program> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("programs")
    .insert({
      org_id: input.orgId,
      slug: input.slug,
      name: input.name,
      description: input.description,
      program_type: input.programType,
      custom_type_label: input.customTypeLabel,
      status: input.status,
      start_date: input.startDate,
      end_date: input.endDate,
      cover_image_path: input.coverImagePath,
      registration_open_at: input.registrationOpenAt,
      registration_close_at: input.registrationCloseAt,
      settings_json: input.settingsJson ?? {}
    })
    .select(programSelect)
    .single();

  if (error) {
    throw new Error(`Failed to create program: ${error.message}`);
  }

  return mapProgram(data as ProgramRow);
}

export async function updateProgramRecord(input: {
  orgId: string;
  programId: string;
  slug: string;
  name: string;
  description: string | null;
  programType: Program["programType"];
  customTypeLabel: string | null;
  status: Program["status"];
  startDate: string | null;
  endDate: string | null;
  registrationOpenAt: string | null;
  registrationCloseAt: string | null;
  coverImagePath: string | null;
  settingsJson?: Record<string, unknown>;
}): Promise<Program> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("programs")
    .update({
      slug: input.slug,
      name: input.name,
      description: input.description,
      program_type: input.programType,
      custom_type_label: input.customTypeLabel,
      status: input.status,
      start_date: input.startDate,
      end_date: input.endDate,
      cover_image_path: input.coverImagePath,
      registration_open_at: input.registrationOpenAt,
      registration_close_at: input.registrationCloseAt,
      settings_json: input.settingsJson ?? {}
    })
    .eq("org_id", input.orgId)
    .eq("id", input.programId)
    .select(programSelect)
    .single();

  if (error) {
    throw new Error(`Failed to update program: ${error.message}`);
  }

  return mapProgram(data as ProgramRow);
}

export async function createProgramNodeRecord(input: {
  programId: string;
  parentId: string | null;
  name: string;
  slug: string;
  nodeKind: ProgramNode["nodeKind"];
  capacity: number | null;
  waitlistEnabled: boolean;
  sortIndex?: number;
  settingsJson?: Record<string, unknown>;
}): Promise<ProgramNode> {
  const supabase = await createSupabaseServer();
  const sortIndex =
    typeof input.sortIndex === "number"
      ? input.sortIndex
      : await (async () => {
          const { data: latest } = await supabase
            .from("program_nodes")
            .select("sort_index")
            .eq("program_id", input.programId)
            .eq("parent_id", input.parentId)
            .order("sort_index", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!latest || typeof latest.sort_index !== "number") {
            return 0;
          }

          return latest.sort_index + 1;
        })();

  const { data, error } = await supabase
    .from("program_nodes")
    .insert({
      program_id: input.programId,
      parent_id: input.parentId,
      name: input.name,
      slug: input.slug,
      node_kind: input.nodeKind,
      capacity: input.capacity,
      waitlist_enabled: input.waitlistEnabled,
      sort_index: sortIndex,
      settings_json: input.settingsJson ?? {}
    })
    .select(nodeSelect)
    .single();

  if (error) {
    throw new Error(`Failed to create program node: ${error.message}`);
  }

  return mapNode(data as NodeRow);
}

export async function deleteProgramNodeRecord(programId: string, nodeId: string) {
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("program_nodes").delete().eq("program_id", programId).eq("id", nodeId);

  if (error) {
    throw new Error(`Failed to delete program node: ${error.message}`);
  }
}

export async function updateProgramNodeHierarchyRecord(input: {
  programId: string;
  nodeId: string;
  parentId: string | null;
  nodeKind: ProgramNode["nodeKind"];
  sortIndex: number;
}) {
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from("program_nodes")
    .update({
      parent_id: input.parentId,
      node_kind: input.nodeKind,
      sort_index: input.sortIndex
    })
    .eq("program_id", input.programId)
    .eq("id", input.nodeId);

  if (error) {
    throw new Error(`Failed to update program node hierarchy: ${error.message}`);
  }
}

export async function updateProgramNodeSettingsRecord(input: {
  programId: string;
  nodeId: string;
  settingsJson: Record<string, unknown>;
}) {
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from("program_nodes")
    .update({
      settings_json: input.settingsJson
    })
    .eq("program_id", input.programId)
    .eq("id", input.nodeId);

  if (error) {
    throw new Error(`Failed to update program node settings: ${error.message}`);
  }
}

export async function updateProgramNodeRecord(input: {
  programId: string;
  nodeId: string;
  name: string;
  slug: string;
  nodeKind: ProgramNode["nodeKind"];
  capacity: number | null;
  waitlistEnabled: boolean;
}) {
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from("program_nodes")
    .update({
      name: input.name,
      slug: input.slug,
      node_kind: input.nodeKind,
      capacity: input.capacity,
      waitlist_enabled: input.waitlistEnabled
    })
    .eq("program_id", input.programId)
    .eq("id", input.nodeId);

  if (error) {
    throw new Error(`Failed to update program node: ${error.message}`);
  }
}

export async function createProgramScheduleBlockRecord(input: {
  programId: string;
  programNodeId: string | null;
  blockType: ProgramScheduleBlock["blockType"];
  title: string | null;
  timezone: string | null;
  startDate: string | null;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  byDay: number[] | null;
  oneOffAt: string | null;
  sortIndex?: number;
  settingsJson?: Record<string, unknown>;
}): Promise<ProgramScheduleBlock> {
  const supabase = await createSupabaseServer();
  const sortIndex =
    typeof input.sortIndex === "number"
      ? input.sortIndex
      : await (async () => {
          const { data: latest } = await supabase
            .from("program_schedule_blocks")
            .select("sort_index")
            .eq("program_id", input.programId)
            .order("sort_index", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!latest || typeof latest.sort_index !== "number") {
            return 0;
          }

          return latest.sort_index + 1;
        })();

  const { data, error } = await supabase
    .from("program_schedule_blocks")
    .insert({
      program_id: input.programId,
      program_node_id: input.programNodeId,
      block_type: input.blockType,
      title: input.title,
      timezone: input.timezone,
      start_date: input.startDate,
      end_date: input.endDate,
      start_time: input.startTime,
      end_time: input.endTime,
      by_day: input.byDay,
      one_off_at: input.oneOffAt,
      sort_index: sortIndex,
      settings_json: input.settingsJson ?? {}
    })
    .select(scheduleSelect)
    .single();

  if (error) {
    throw new Error(`Failed to create schedule block: ${error.message}`);
  }

  return mapSchedule(data as ScheduleRow);
}

export async function deleteProgramScheduleBlockRecord(programId: string, blockId: string) {
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("program_schedule_blocks").delete().eq("program_id", programId).eq("id", blockId);

  if (error) {
    throw new Error(`Failed to delete schedule block: ${error.message}`);
  }
}
