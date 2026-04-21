import { z } from "zod";

export const filterOperators = ["equals", "notEquals", "contains", "gt", "lt", "isEmpty", "notEmpty"] as const;
export type FilterOperator = (typeof filterOperators)[number];

export const collectionFilterSchema = z.object({
  columnKey: z.string().min(1),
  operator: z.enum(filterOperators),
  value: z.string().optional(),
});

export type CollectionFilter = z.infer<typeof collectionFilterSchema>;

export const collectionSortSchema = z.object({
  columnKey: z.string().min(1),
  direction: z.enum(["asc", "desc"]),
});

export type CollectionSort = z.infer<typeof collectionSortSchema>;

export type DataCollection = {
  id: string;
  orgId: string;
  createdBy: string | null;
  name: string;
  description: string | null;
  sourceKey: string;
  tableKey: string | null;
  filters: CollectionFilter[];
  sort: CollectionSort | null;
  pinned: boolean;
  sortIndex: number;
  createdAt: string;
  updatedAt: string;
};

export function collectionFqKey(id: string): string {
  return `collection:${id}`;
}

export function parseCollectionFqKey(fqKey: string): string | null {
  if (!fqKey.startsWith("collection:")) return null;
  const id = fqKey.slice("collection:".length);
  return id.length > 0 ? id : null;
}
