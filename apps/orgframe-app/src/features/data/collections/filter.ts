import type { CollectionFilter, CollectionSort } from "@/src/features/data/collections/types";

function toComparable(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.getTime();
  return String(value);
}

function testFilter(row: Record<string, unknown>, filter: CollectionFilter): boolean {
  const raw = row[filter.columnKey];
  const cmp = toComparable(raw);
  const needle = filter.value ?? "";

  switch (filter.operator) {
    case "isEmpty":
      return cmp === null || cmp === "";
    case "notEmpty":
      return cmp !== null && cmp !== "";
    case "equals":
      return String(cmp ?? "").toLowerCase() === needle.toLowerCase();
    case "notEquals":
      return String(cmp ?? "").toLowerCase() !== needle.toLowerCase();
    case "contains":
      return String(cmp ?? "").toLowerCase().includes(needle.toLowerCase());
    case "gt": {
      const n = Number(cmp);
      const m = Number(needle);
      if (Number.isFinite(n) && Number.isFinite(m)) return n > m;
      return String(cmp ?? "") > needle;
    }
    case "lt": {
      const n = Number(cmp);
      const m = Number(needle);
      if (Number.isFinite(n) && Number.isFinite(m)) return n < m;
      return String(cmp ?? "") < needle;
    }
    default:
      return true;
  }
}

export function applyFilters(rows: Array<Record<string, unknown>>, filters: CollectionFilter[]): Array<Record<string, unknown>> {
  if (filters.length === 0) return rows;
  return rows.filter((row) => filters.every((f) => testFilter(row, f)));
}

export function applySort(rows: Array<Record<string, unknown>>, sort: CollectionSort | null): Array<Record<string, unknown>> {
  if (!sort) return rows;
  const dir = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = toComparable(a[sort.columnKey]);
    const bv = toComparable(b[sort.columnKey]);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}
