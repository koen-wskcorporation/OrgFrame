"use client";

import { useMemo, useState, useTransition } from "react";
import { Trash2, Plus } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { Input } from "@orgframe/ui/primitives/input";
import { Textarea } from "@orgframe/ui/primitives/textarea";
import { Select } from "@orgframe/ui/primitives/select";

function toOptions<T>(items: T[], key: (t: T) => string, label: (t: T) => string) {
  return items.map((item) => ({ value: key(item), label: label(item) }));
}
import { createDataCollectionAction } from "@/src/features/data/actions";
import { filterOperators, type CollectionFilter, type FilterOperator } from "@/src/features/data/collections/types";

type SourceOption = {
  key: string;
  label: string;
  tables: Array<{
    key: string;
    label: string;
    columns: Array<{ key: string; label: string }>;
  }>;
};

type CollectionBuilderProps = {
  orgSlug: string;
  sources: SourceOption[];
};

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  equals: "equals",
  notEquals: "does not equal",
  contains: "contains",
  gt: "greater than",
  lt: "less than",
  isEmpty: "is empty",
  notEmpty: "is not empty",
};

function requiresValue(op: FilterOperator): boolean {
  return op !== "isEmpty" && op !== "notEmpty";
}

export function CollectionBuilder({ orgSlug, sources }: CollectionBuilderProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sourceKey, setSourceKey] = useState<string>(sources[0]?.key ?? "");
  const activeSource = useMemo(() => sources.find((s) => s.key === sourceKey) ?? null, [sources, sourceKey]);
  const [tableKey, setTableKey] = useState<string>(activeSource?.tables[0]?.key ?? "");
  const activeTable = useMemo(
    () => activeSource?.tables.find((t) => t.key === tableKey) ?? activeSource?.tables[0] ?? null,
    [activeSource, tableKey]
  );
  const [filters, setFilters] = useState<CollectionFilter[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSourceChange(next: string) {
    setSourceKey(next);
    const nextSource = sources.find((s) => s.key === next);
    setTableKey(nextSource?.tables[0]?.key ?? "");
    setFilters([]);
  }

  function addFilter() {
    const firstColumn = activeTable?.columns[0]?.key;
    if (!firstColumn) return;
    setFilters((prev) => [...prev, { columnKey: firstColumn, operator: "contains", value: "" }]);
  }

  function updateFilter(index: number, patch: Partial<CollectionFilter>) {
    setFilters((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function removeFilter(index: number) {
    setFilters((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(formData: FormData) {
    const trimmedName = String(formData.get("name") ?? "").trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }
    if (!sourceKey || !tableKey) {
      setError("Pick a source and table.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await createDataCollectionAction({
          orgSlug,
          name: trimmedName,
          description: description.trim() || null,
          sourceKey,
          tableKey,
          filters,
          sort: null,
          pinned: true,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create collection.");
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Basics</CardTitle>
          <CardDescription>Give your collection a name so you can find it later.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-text">Name</span>
            <Input
              name="name"
              placeholder="e.g. Open pending registrations"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-text">Description (optional)</span>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1"
            />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Source</CardTitle>
          <CardDescription>Choose where the data comes from, then which table to filter.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-text">Source</span>
            <Select
              options={toOptions(sources, (s) => s.key, (s) => s.label)}
              value={sourceKey}
              onChange={(e) => onSourceChange(e.target.value)}
              className="mt-1"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-text">Table</span>
            <Select
              options={toOptions(activeSource?.tables ?? [], (t) => t.key, (t) => t.label)}
              value={tableKey}
              onChange={(e) => {
                setTableKey(e.target.value);
                setFilters([]);
              }}
              className="mt-1"
              disabled={!activeSource || activeSource.tables.length === 0}
            />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Narrow the rows in this collection.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {filters.length === 0 ? (
            <p className="text-sm text-text-muted">No filters yet — the collection will show all rows from the source.</p>
          ) : (
            <ul className="space-y-2">
              {filters.map((filter, index) => (
                <li key={index} className="grid gap-2 rounded-card border border-border bg-surface p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                  <label className="block">
                    <span className="text-xs text-text-muted">Column</span>
                    <Select
                      options={toOptions(activeTable?.columns ?? [], (c) => c.key, (c) => c.label)}
                      value={filter.columnKey}
                      onChange={(e) => updateFilter(index, { columnKey: e.target.value })}
                      className="mt-1"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-text-muted">Operator</span>
                    <Select
                      options={filterOperators.map((op) => ({ value: op, label: OPERATOR_LABELS[op] }))}
                      value={filter.operator}
                      onChange={(e) => updateFilter(index, { operator: e.target.value as FilterOperator })}
                      className="mt-1"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-text-muted">Value</span>
                    <Input
                      value={filter.value ?? ""}
                      disabled={!requiresValue(filter.operator)}
                      onChange={(e) => updateFilter(index, { value: e.target.value })}
                      className="mt-1"
                      placeholder={requiresValue(filter.operator) ? "" : "—"}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFilter(index)}
                    iconOnly
                    aria-label="Remove filter"
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Button type="button" variant="secondary" size="sm" onClick={addFilter} disabled={!activeTable}>
            <Plus aria-hidden />
            Add filter
          </Button>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" loading={isPending}>
          Save & pin collection
        </Button>
      </div>
    </form>
  );
}
