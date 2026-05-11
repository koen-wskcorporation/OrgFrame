"use client";

import { useMemo } from "react";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { Chip } from "@orgframe/ui/primitives/chip";
import { Repeater } from "@orgframe/ui/primitives/repeater";
import type { SourceTag } from "@/src/features/data/registry/types";

export type SourceItem = {
  fqKey: string;
  label: string;
  description: string | null;
  tags: SourceTag[];
  dashboardsCount: number;
  tablesCount: number;
  kindOrder: number;
  pinned: boolean;
  href: string;
  searchText: string;
};

type SourcesRepeaterProps = {
  items: SourceItem[];
};

export function SourcesRepeater({ items: itemsInput }: SourcesRepeaterProps) {
  const items = useMemo<SourceItem[]>(
    () =>
      [...itemsInput].sort((a, b) => {
        if (a.kindOrder !== b.kindOrder) return a.kindOrder - b.kindOrder;
        return a.label.localeCompare(b.label);
      }),
    [itemsInput]
  );

  return (
    <Repeater<SourceItem>
      items={items}
      getItemKey={(item) => item.fqKey}
      getSearchValue={(item) => item.searchText}
      searchPlaceholder="Search data sources and collections"
      emptyMessage="No data sources match your search."
      initialView="grid"
      renderItem={({ item, view }) => (
        <Card className={view === "list" ? "sm:flex sm:items-center sm:justify-between sm:gap-4" : undefined}>
          <CardHeader className={view === "list" ? "sm:flex-1" : undefined}>
            <CardTitle className="flex items-center gap-2">
              <span className="truncate">{item.label}</span>
            </CardTitle>
            {item.description ? <CardDescription className="line-clamp-2">{item.description}</CardDescription> : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {item.tags.map((tag, idx) => (
                <Chip key={`${item.fqKey}-tag-${idx}`} color={tag.tone ?? "neutral"}>
                  {tag.label}
                </Chip>
              ))}
            </div>
          </CardHeader>
          <CardContent className={view === "list" ? "pt-0 sm:pb-0 sm:pt-0" : "pt-3"}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-text-muted">
                {item.dashboardsCount} dashboard{item.dashboardsCount === 1 ? "" : "s"} • {item.tablesCount} table
                {item.tablesCount === 1 ? "" : "s"}
              </span>
              <Button href={item.href} size="sm" variant="secondary">
                Open
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    />
  );
}
