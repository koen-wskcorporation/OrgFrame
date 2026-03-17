"use client";

import * as React from "react";
import { Grid3X3, List, Search } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { Input } from "./input";

export type RepeaterView = "grid" | "list";

type RepeaterRenderArgs<TItem> = {
  item: TItem;
  index: number;
  view: RepeaterView;
};

type RepeaterProps<TItem> = {
  items: TItem[];
  getItemKey: (item: TItem, index: number) => React.Key;
  getSearchValue: (item: TItem) => string;
  renderItem: (args: RepeaterRenderArgs<TItem>) => React.ReactNode;
  searchPlaceholder?: string;
  emptyMessage?: string;
  initialView?: RepeaterView;
  className?: string;
  gridClassName?: string;
  listClassName?: string;
};

export function Repeater<TItem>({
  items,
  getItemKey,
  getSearchValue,
  renderItem,
  searchPlaceholder = "Search",
  emptyMessage = "No items found.",
  initialView = "grid",
  className,
  gridClassName,
  listClassName
}: RepeaterProps<TItem>) {
  const [query, setQuery] = React.useState("");
  const [view, setView] = React.useState<RepeaterView>(initialView);
  const normalizedQuery = query.trim().toLowerCase();

  const filteredItems = React.useMemo(() => {
    if (!normalizedQuery) {
      return items;
    }

    return items.filter((item) => getSearchValue(item).toLowerCase().includes(normalizedQuery));
  }, [getSearchValue, items, normalizedQuery]);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-md">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <Input
            className="pl-10"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            value={query}
          />
        </div>

        <div aria-label="Choose repeater view" className="inline-flex items-center gap-2" role="group">
          <Button
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
            size="sm"
            type="button"
            variant={view === "grid" ? "secondary" : "ghost"}
          >
            <Grid3X3 aria-hidden />
            Grid
          </Button>
          <Button
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
            size="sm"
            type="button"
            variant={view === "list" ? "secondary" : "ghost"}
          >
            <List aria-hidden />
            List
          </Button>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <p className="rounded-card border border-dashed px-4 py-5 text-sm text-text-muted">{emptyMessage}</p>
      ) : (
        <div className={cn(view === "grid" ? cn("ui-card-grid", gridClassName) : cn("space-y-3", listClassName))}>
          {filteredItems.map((item, index) => (
            <React.Fragment key={getItemKey(item, index)}>{renderItem({ item, index, view })}</React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
