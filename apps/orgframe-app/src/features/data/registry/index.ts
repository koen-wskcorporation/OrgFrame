import {
  formatEntityKey,
  parseEntityKey,
  type DataSourceDefinition,
  type ResolvedDataSource,
  type SourceTag,
} from "@/src/features/data/registry/types";
import { programsDataSource } from "@/src/features/data/sources/programs";
import { peopleDataSource } from "@/src/features/data/sources/people";
import { formsDataSource } from "@/src/features/data/sources/forms";
import { ordersDataSource } from "@/src/features/data/sources/orders";
import { calendarDataSource } from "@/src/features/data/sources/calendar";
import { filesDataSource } from "@/src/features/data/sources/files";
import { facilitiesDataSource } from "@/src/features/data/sources/facilities";
import { communicationsDataSource } from "@/src/features/data/sources/communications";
import { resolveEntityDataSources } from "@/src/features/data/registry/entity-sources";
import { buildCollectionDataSource } from "@/src/features/data/sources/collection";
import { getDataCollection, listDataCollections } from "@/src/features/data/collections/storage";
import { parseCollectionFqKey } from "@/src/features/data/collections/types";
import type { Permission } from "@/src/features/core/access";

export const TOOL_DATA_SOURCES: DataSourceDefinition[] = [
  programsDataSource,
  peopleDataSource,
  formsDataSource,
  ordersDataSource,
  calendarDataSource,
  filesDataSource,
  facilitiesDataSource,
  communicationsDataSource,
];

function hasAnyPermission(granted: Permission[], required: Permission[]): boolean {
  if (required.length === 0) return true;
  const set = new Set(granted);
  return required.some((p) => set.has(p));
}

function toolTagsFor(def: DataSourceDefinition): SourceTag[] {
  return [
    { label: "System", tone: "neutral" },
    { label: "Tool", tone: "neutral" },
    { label: def.label, tone: "neutral" },
  ];
}

function entityTagsFor(def: DataSourceDefinition): SourceTag[] {
  const entityLabel = def.entityType ? def.entityType.charAt(0).toUpperCase() + def.entityType.slice(1) : "Entity";
  return [
    { label: "System", tone: "neutral" },
    { label: "Auto", tone: "neutral" },
    { label: entityLabel, tone: "neutral" },
  ];
}

function collectionTags(pinned: boolean, sourceLabel: string): SourceTag[] {
  const tags: SourceTag[] = [
    { label: "Custom", tone: "green" },
    { label: sourceLabel, tone: "neutral" },
  ];
  if (pinned) tags.unshift({ label: "Pinned", tone: "yellow" });
  return tags;
}

export async function listAccessibleDataSources(params: {
  orgId: string;
  permissions: Permission[];
}): Promise<ResolvedDataSource[]> {
  const resolved: ResolvedDataSource[] = [];

  for (const def of TOOL_DATA_SOURCES) {
    if (!hasAnyPermission(params.permissions, def.permissions)) continue;
    resolved.push({
      ...def,
      fqKey: def.key,
      tags: toolTagsFor(def),
      isSystem: true,
    });
  }

  const entitySources = await resolveEntityDataSources(params.orgId);
  for (const def of entitySources) {
    if (!hasAnyPermission(params.permissions, def.permissions)) continue;
    if (!def.entityType || !def.entityId) continue;
    resolved.push({
      ...def,
      fqKey: formatEntityKey(def.entityType, def.entityId),
      tags: entityTagsFor(def),
      isSystem: true,
    });
  }

  const collections = await listDataCollections(params.orgId);
  for (const coll of collections) {
    const base = TOOL_DATA_SOURCES.find((src) => src.key === coll.sourceKey);
    if (!base) continue;
    if (!hasAnyPermission(params.permissions, base.permissions)) continue;
    const def = buildCollectionDataSource({ base, collection: coll });
    resolved.push({
      ...def,
      fqKey: `collection:${coll.id}`,
      tags: collectionTags(coll.pinned, base.label),
      isSystem: false,
      pinned: coll.pinned,
    });
  }

  return resolved;
}

export async function getDataSourceByKey(params: {
  orgId: string;
  fqKey: string;
  permissions: Permission[];
}): Promise<ResolvedDataSource | null> {
  const collectionId = parseCollectionFqKey(params.fqKey);
  if (collectionId) {
    const collection = await getDataCollection(params.orgId, collectionId);
    if (!collection) return null;
    const base = TOOL_DATA_SOURCES.find((src) => src.key === collection.sourceKey);
    if (!base) return null;
    if (!hasAnyPermission(params.permissions, base.permissions)) return null;
    const def = buildCollectionDataSource({ base, collection });
    return {
      ...def,
      fqKey: params.fqKey,
      tags: collectionTags(collection.pinned, base.label),
      isSystem: false,
      pinned: collection.pinned,
    };
  }

  const entityInfo = parseEntityKey(params.fqKey);
  if (entityInfo) {
    const entitySources = await resolveEntityDataSources(params.orgId);
    const match = entitySources.find(
      (src) => src.entityType === entityInfo.entityType && src.entityId === entityInfo.entityId
    );
    if (!match) return null;
    if (!hasAnyPermission(params.permissions, match.permissions)) return null;
    return { ...match, fqKey: params.fqKey, tags: entityTagsFor(match), isSystem: true };
  }

  const toolDef = TOOL_DATA_SOURCES.find((src) => src.key === params.fqKey);
  if (!toolDef) return null;
  if (!hasAnyPermission(params.permissions, toolDef.permissions)) return null;
  return { ...toolDef, fqKey: toolDef.key, tags: toolTagsFor(toolDef), isSystem: true };
}
