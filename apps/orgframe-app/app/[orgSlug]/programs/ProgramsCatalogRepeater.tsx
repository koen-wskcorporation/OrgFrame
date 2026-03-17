"use client";

import { Button } from "@orgframe/ui/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/ui/card";
import { Repeater } from "@orgframe/ui/ui/repeater";

type ProgramCatalogItem = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  coverImageUrl: string | null;
  typeLabel: string;
  dateLabel: string;
  href: string;
};

type ProgramsCatalogRepeaterProps = {
  items: ProgramCatalogItem[];
};

export function ProgramsCatalogRepeater({ items }: ProgramsCatalogRepeaterProps) {
  return (
    <Repeater
      emptyMessage="No published programs yet."
      getItemKey={(program) => program.id}
      getSearchValue={(program) => `${program.name} ${program.typeLabel} ${program.dateLabel} ${program.description ?? ""}`}
      items={items}
      searchPlaceholder="Search programs"
      renderItem={({ item, view }) => (
        <Card className={view === "list" ? "sm:flex sm:gap-4" : undefined}>
          {item.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={`${item.name} cover`}
              className={view === "list" ? "h-40 w-full rounded-t-card object-cover sm:h-auto sm:w-56 sm:rounded-l-card sm:rounded-tr-none" : "h-44 w-full rounded-t-card object-cover"}
              src={item.coverImageUrl}
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <CardHeader>
              <CardTitle>{item.name}</CardTitle>
              <CardDescription>
                {item.typeLabel} · {item.dateLabel}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-text-muted">{item.description ?? "Program details are available on the next page."}</p>
              <Button href={item.href} variant="secondary">
                View program
              </Button>
            </CardContent>
          </div>
        </Card>
      )}
    />
  );
}
