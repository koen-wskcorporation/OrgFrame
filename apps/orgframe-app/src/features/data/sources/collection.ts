import type { DataSourceDefinition, TableDef } from "@/src/features/data/registry/types";
import type { DataCollection } from "@/src/features/data/collections/types";
import { applyFilters, applySort } from "@/src/features/data/collections/filter";

type Input = {
  base: DataSourceDefinition;
  collection: DataCollection;
};

export function buildCollectionDataSource({ base, collection }: Input): DataSourceDefinition {
  const tableKey = collection.tableKey ?? base.tables[0]?.key ?? null;
  const baseTable = tableKey ? base.tables.find((t) => t.key === tableKey) ?? base.tables[0] ?? null : base.tables[0] ?? null;

  const tables: TableDef[] = baseTable
    ? [
        {
          ...baseTable,
          key: baseTable.key,
          label: collection.name,
          description: collection.description ?? baseTable.description,
          defaultSortKey: collection.sort?.columnKey ?? baseTable.defaultSortKey,
          defaultSortDirection: collection.sort?.direction ?? baseTable.defaultSortDirection,
        },
      ]
    : [];

  return {
    key: `collection:${collection.id}`,
    label: collection.name,
    description: collection.description ?? `Custom collection from ${base.label}`,
    icon: "layout",
    kind: "collection",
    permissions: base.permissions,
    metrics: base.metrics,
    series: base.series,
    breakdowns: base.breakdowns,
    tables,
    dashboards: tables[0]
      ? [
          {
            key: "overview",
            label: "Overview",
            widgets: [{ kind: "table", tableKey: tables[0].key, spanColumns: 3, maxRows: 200 }],
          },
        ]
      : [],
    async loader(ctx) {
      const snapshot = await base.loader(ctx);
      if (!baseTable) return snapshot;

      const entry = snapshot.tables[baseTable.key];
      if (!entry) return snapshot;

      const filtered = applyFilters(entry.rows, collection.filters);
      const sorted = applySort(filtered, collection.sort);

      return {
        ...snapshot,
        tables: {
          ...snapshot.tables,
          [baseTable.key]: { rows: sorted, total: sorted.length },
        },
      };
    },
  };
}
