"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { DataTable, type DataTableColumn } from "@orgframe/ui/primitives/data-table";
import type { TableColumnDef, TableDef } from "@/src/features/data/registry/types";

type TableWidgetProps = {
  def: TableDef;
  rows: Array<Record<string, unknown>>;
  total?: number;
  maxRows?: number;
  storageKey?: string;
};

function renderValue(value: unknown, column: TableColumnDef): string {
  if (value === null || value === undefined) return "—";
  if (column.type === "date" && typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
  }
  if (column.type === "number" && typeof value === "number") {
    return new Intl.NumberFormat("en-US").format(value);
  }
  return String(value);
}

export function TableWidget({ def, rows, total, maxRows, storageKey }: TableWidgetProps) {
  const displayRows = useMemo(() => {
    if (maxRows && rows.length > maxRows) return rows.slice(0, maxRows);
    return rows;
  }, [rows, maxRows]);

  const columns = useMemo<DataTableColumn<Record<string, unknown>>[]>(
    () =>
      def.columns.map((col) => ({
        key: col.key,
        label: col.label,
        defaultVisible: col.defaultVisible ?? true,
        sortable: col.sortable ?? true,
        renderCell: (row) => <span>{renderValue(row[col.key], col)}</span>,
        renderSearchValue: (row) => {
          const v = row[col.key];
          return v === null || v === undefined ? "" : String(v);
        },
        renderSortValue: (row) => {
          const v = row[col.key];
          if (v === null || v === undefined) return "";
          if (col.type === "number" && typeof v === "number") return v;
          if (col.type === "date" && typeof v === "string") {
            const d = new Date(v);
            return Number.isNaN(d.getTime()) ? v : d.getTime();
          }
          return String(v);
        },
      })),
    [def.columns]
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium">{def.label}</CardTitle>
          {typeof total === "number" && (
            <span className="text-xs text-text-muted">
              Showing {displayRows.length.toLocaleString()} of {total.toLocaleString()}
            </span>
          )}
        </div>
        {def.description && <p className="text-xs text-text-muted">{def.description}</p>}
      </CardHeader>
      <CardContent className="pt-0">
        <DataTable
          ariaLabel={def.label}
          data={displayRows}
          columns={columns}
          rowKey={(row) => String(row.id ?? JSON.stringify(row))}
          emptyState={<div className="py-6 text-center text-sm text-text-muted">No rows</div>}
          defaultSort={
            def.defaultSortKey
              ? { columnKey: def.defaultSortKey, direction: def.defaultSortDirection ?? "desc" }
              : undefined
          }
          storageKey={storageKey}
        />
      </CardContent>
    </Card>
  );
}
