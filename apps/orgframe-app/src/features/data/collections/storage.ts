import { createSupabaseServer } from "@/src/shared/data-api/server";
import type { CollectionFilter, CollectionSort, DataCollection } from "@/src/features/data/collections/types";

type CollectionRow = {
  id: string;
  org_id: string;
  created_by: string | null;
  name: string;
  description: string | null;
  source_key: string;
  table_key: string | null;
  filters_json: unknown;
  sort_json: unknown;
  pinned: boolean;
  sort_index: number;
  created_at: string;
  updated_at: string;
};

function parseFilters(raw: unknown): CollectionFilter[] {
  if (!Array.isArray(raw)) return [];
  const out: CollectionFilter[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const columnKey = typeof rec.columnKey === "string" ? rec.columnKey : null;
    const operator = typeof rec.operator === "string" ? rec.operator : null;
    if (!columnKey || !operator) continue;
    out.push({
      columnKey,
      operator: operator as CollectionFilter["operator"],
      value: typeof rec.value === "string" ? rec.value : undefined,
    });
  }
  return out;
}

function parseSort(raw: unknown): CollectionSort | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.columnKey !== "string" || (rec.direction !== "asc" && rec.direction !== "desc")) return null;
  return { columnKey: rec.columnKey, direction: rec.direction };
}

function mapRow(row: CollectionRow): DataCollection {
  return {
    id: row.id,
    orgId: row.org_id,
    createdBy: row.created_by,
    name: row.name,
    description: row.description,
    sourceKey: row.source_key,
    tableKey: row.table_key,
    filters: parseFilters(row.filters_json),
    sort: parseSort(row.sort_json),
    pinned: row.pinned,
    sortIndex: row.sort_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listDataCollections(orgId: string): Promise<DataCollection[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("orgs")
    .from("org_data_collections")
    .select("id, org_id, created_by, name, description, source_key, table_key, filters_json, sort_json, pinned, sort_index, created_at, updated_at")
    .eq("org_id", orgId)
    .order("sort_index", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list collections: ${error.message}`);
  return (data ?? []).map((row) => mapRow(row as CollectionRow));
}

export async function getDataCollection(orgId: string, id: string): Promise<DataCollection | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("orgs")
    .from("org_data_collections")
    .select("id, org_id, created_by, name, description, source_key, table_key, filters_json, sort_json, pinned, sort_index, created_at, updated_at")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load collection: ${error.message}`);
  return data ? mapRow(data as CollectionRow) : null;
}

export async function createDataCollection(input: {
  orgId: string;
  userId: string;
  name: string;
  description?: string | null;
  sourceKey: string;
  tableKey?: string | null;
  filters: CollectionFilter[];
  sort?: CollectionSort | null;
  pinned?: boolean;
}): Promise<DataCollection> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("orgs")
    .from("org_data_collections")
    .insert({
      org_id: input.orgId,
      created_by: input.userId,
      name: input.name,
      description: input.description ?? null,
      source_key: input.sourceKey,
      table_key: input.tableKey ?? null,
      filters_json: input.filters,
      sort_json: input.sort ?? null,
      pinned: input.pinned ?? true,
    })
    .select("id, org_id, created_by, name, description, source_key, table_key, filters_json, sort_json, pinned, sort_index, created_at, updated_at")
    .single();
  if (error || !data) throw new Error(`Failed to create collection: ${error?.message ?? "unknown"}`);
  return mapRow(data as CollectionRow);
}

export async function updateDataCollectionPinned(input: { orgId: string; id: string; pinned: boolean }) {
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .schema("orgs")
    .from("org_data_collections")
    .update({ pinned: input.pinned })
    .eq("org_id", input.orgId)
    .eq("id", input.id);
  if (error) throw new Error(`Failed to update pin state: ${error.message}`);
}

export async function deleteDataCollection(input: { orgId: string; id: string }) {
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .schema("orgs")
    .from("org_data_collections")
    .delete()
    .eq("org_id", input.orgId)
    .eq("id", input.id);
  if (error) throw new Error(`Failed to delete collection: ${error.message}`);
}
