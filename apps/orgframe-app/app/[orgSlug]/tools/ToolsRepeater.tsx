"use client";

import { Button } from "@orgframe/ui/ui/button";
import { Card, CardContent, CardDescription, CardHeaderCompact, CardTitle } from "@orgframe/ui/ui/card";
import { Repeater } from "@orgframe/ui/ui/repeater";

type ToolItem = {
  key: string;
  label: string;
  description?: string | null;
  href: string;
};

type ToolsRepeaterProps = {
  items: ToolItem[];
};

export function ToolsRepeater({ items }: ToolsRepeaterProps) {
  return (
    <Repeater
      emptyMessage="No tools matched your search."
      getItemKey={(item) => item.key}
      getSearchValue={(item) => `${item.label} ${item.description ?? ""}`}
      items={items}
      searchPlaceholder="Search tools"
      renderItem={({ item, view }) => (
        <Card className={view === "list" ? "sm:flex sm:items-center sm:justify-between sm:gap-4" : undefined}>
          <CardHeaderCompact className={view === "list" ? "sm:flex-1" : undefined}>
            <CardTitle>{item.label}</CardTitle>
            {item.description ? <CardDescription>{item.description}</CardDescription> : null}
          </CardHeaderCompact>
          <CardContent className={view === "list" ? "pt-0 sm:pb-0 sm:pt-0" : "pt-4"}>
            <Button href={item.href} variant="secondary">
              Open {item.label}
            </Button>
          </CardContent>
        </Card>
      )}
    />
  );
}
