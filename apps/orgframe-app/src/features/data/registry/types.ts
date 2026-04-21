import type { Permission } from "@/src/features/core/access";

export type DataSourceKind = "tool" | "entity" | "collection";

export type EntitySourceType = "program" | "division" | "team" | "facility";

export type DataSourceRef =
  | { kind: "tool"; key: string }
  | { kind: "entity"; entityType: EntitySourceType; entityId: string };

export type MetricDef = {
  key: string;
  label: string;
  description?: string;
  format?: "number" | "currency" | "percent";
  goodDirection?: "up" | "down" | "neutral";
};

export type SeriesDef = {
  key: string;
  label: string;
  kind: "line" | "bar";
  description?: string;
};

export type BreakdownDef = {
  key: string;
  label: string;
  description?: string;
};

export type TableColumnDef = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "status";
  defaultVisible?: boolean;
  sortable?: boolean;
};

export type TableDef = {
  key: string;
  label: string;
  description?: string;
  columns: TableColumnDef[];
  defaultSortKey?: string;
  defaultSortDirection?: "asc" | "desc";
};

export type DashboardWidgetDef =
  | { kind: "metric"; metricKey: string; spanColumns?: 1 | 2 | 3 }
  | { kind: "timeseries"; seriesKey: string; spanColumns?: 1 | 2 | 3 }
  | { kind: "breakdown"; breakdownKey: string; spanColumns?: 1 | 2 | 3 }
  | { kind: "table"; tableKey: string; spanColumns?: 1 | 2 | 3; maxRows?: number };

export type DashboardPresetDef = {
  key: string;
  label: string;
  widgets: DashboardWidgetDef[];
};

export type DataSourceSnapshot = {
  metrics: Record<string, { value: number; previous?: number | null }>;
  series: Record<string, { points: { t: string; v: number }[] }>;
  breakdowns: Record<string, { segments: { label: string; value: number }[] }>;
  tables: Record<string, { rows: Array<Record<string, unknown>>; total: number }>;
};

export type DataSourceLoadCtx = {
  orgId: string;
  /** ISO date (inclusive) */
  rangeStart: string;
  /** ISO date (inclusive) */
  rangeEnd: string;
  /** Optional entity id for entity-scoped sources. */
  entityId?: string | null;
  entityType?: EntitySourceType | null;
};

export type DataSourceLoader = (ctx: DataSourceLoadCtx) => Promise<DataSourceSnapshot>;

export type DataSourceDefinition = {
  /** Slug, e.g. "programs", "people", "forms". Unique across the registry. */
  key: string;
  label: string;
  description?: string;
  icon: string;
  kind: DataSourceKind;
  /** Required permission to even see this source in the picker. */
  permissions: Permission[];
  metrics: MetricDef[];
  series: SeriesDef[];
  breakdowns: BreakdownDef[];
  tables: TableDef[];
  dashboards: DashboardPresetDef[];
  loader: DataSourceLoader;
  /** For entity sources only: the entity type. */
  entityType?: EntitySourceType;
  entityId?: string;
};

export type SourceTag = {
  label: string;
  tone?: "neutral" | "green" | "yellow" | "red";
};

export type ResolvedDataSource = DataSourceDefinition & {
  /** Fully-qualified registry key, e.g. "programs", "entity:program:abc-1234", "collection:<uuid>". */
  fqKey: string;
  /** Dynamic tags rendered in the picker (system-generated, custom, pinned, etc). */
  tags: SourceTag[];
  /** Is this item created by the user (collection) vs system-generated. */
  isSystem: boolean;
  /** For collections: mirrors pinned state. Used for sorting. */
  pinned?: boolean;
};

export function formatEntityKey(entityType: EntitySourceType, entityId: string): string {
  return `entity:${entityType}:${entityId}`;
}

export function parseEntityKey(fqKey: string): { entityType: EntitySourceType; entityId: string } | null {
  if (!fqKey.startsWith("entity:")) return null;
  const parts = fqKey.split(":");
  if (parts.length !== 3) return null;
  const [, entityType, entityId] = parts;
  if (entityType !== "program" && entityType !== "division" && entityType !== "team" && entityType !== "facility") {
    return null;
  }
  return { entityType, entityId };
}

export function emptySnapshot(): DataSourceSnapshot {
  return { metrics: {}, series: {}, breakdowns: {}, tables: {} };
}
