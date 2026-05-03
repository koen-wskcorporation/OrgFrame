import { TableWidget } from "@/src/features/data-center/components/widgets/TableWidget";
import type { DataSourceSnapshot, ResolvedDataSource } from "@/src/features/data-center/registry/types";

type TablesViewProps = {
  source: ResolvedDataSource;
  snapshot: DataSourceSnapshot;
};

export function TablesView({ source, snapshot }: TablesViewProps) {
  if (source.tables.length === 0) {
    return <div className="rounded-lg border border-dashed border-border p-6 text-sm text-text-muted">No tables configured for this source.</div>;
  }
  return (
    <div className="space-y-6">
      {source.tables.map((table) => {
        const entry = snapshot.tables[table.key];
        return (
          <TableWidget
            key={table.key}
            def={table}
            rows={entry?.rows ?? []}
            total={entry?.total}
            storageKey={`data-center:${source.fqKey}:table-full:${table.key}`}
          />
        );
      })}
    </div>
  );
}
