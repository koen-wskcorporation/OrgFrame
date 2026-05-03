import { formatEntityKey, parseEntityKey, type DataSourceDefinition, type ResolvedDataSource } from "@/src/features/data-center/registry/types";
import { programsDataSource } from "@/src/features/data-center/sources/programs";
import { peopleDataSource } from "@/src/features/data-center/sources/people";
import { formsDataSource } from "@/src/features/data-center/sources/forms";
import { ordersDataSource } from "@/src/features/data-center/sources/orders";
import { calendarDataSource } from "@/src/features/data-center/sources/calendar";
import { filesDataSource } from "@/src/features/data-center/sources/files";
import { facilitiesDataSource } from "@/src/features/data-center/sources/facilities";
import { communicationsDataSource } from "@/src/features/data-center/sources/communications";
import { resolveEntityDataSources } from "@/src/features/data-center/registry/entity-sources";
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

export async function listAccessibleDataSources(params: {
  orgId: string;
  permissions: Permission[];
}): Promise<ResolvedDataSource[]> {
  const resolved: ResolvedDataSource[] = [];

  for (const def of TOOL_DATA_SOURCES) {
    if (!hasAnyPermission(params.permissions, def.permissions)) continue;
    resolved.push({ ...def, fqKey: def.key });
  }

  const entitySources = await resolveEntityDataSources(params.orgId);
  for (const def of entitySources) {
    if (!hasAnyPermission(params.permissions, def.permissions)) continue;
    if (!def.entityType || !def.entityId) continue;
    resolved.push({ ...def, fqKey: formatEntityKey(def.entityType, def.entityId) });
  }

  return resolved;
}

export async function getDataSourceByKey(params: {
  orgId: string;
  fqKey: string;
}): Promise<ResolvedDataSource | null> {
  const entityInfo = parseEntityKey(params.fqKey);
  if (entityInfo) {
    const entitySources = await resolveEntityDataSources(params.orgId);
    const match = entitySources.find(
      (src) => src.entityType === entityInfo.entityType && src.entityId === entityInfo.entityId
    );
    if (!match) return null;
    return { ...match, fqKey: params.fqKey };
  }

  const toolDef = TOOL_DATA_SOURCES.find((src) => src.key === params.fqKey);
  if (!toolDef) return null;
  return { ...toolDef, fqKey: toolDef.key };
}
