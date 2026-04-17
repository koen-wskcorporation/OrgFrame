"use client";

import { Card, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { Repeater } from "@orgframe/ui/primitives/repeater";
import { ReadMoreDescription } from "@/src/features/site/blocks/read-more-description.client";

type CtaGridRepeaterItem = {
  id: string;
  title: string;
  description: string;
  href: string;
  isExternal: boolean;
};

type CtaGridRepeaterProps = {
  items: CtaGridRepeaterItem[];
};

export function CtaGridRepeater({ items }: CtaGridRepeaterProps) {
  return (
    <Repeater
      disableSearch
      disableViewToggle
      emptyMessage="No cards are available."
      fixedView="grid"
      getItemKey={(item) => item.id}
      getSearchValue={(item) => `${item.title} ${item.description}`}
      items={items}
      renderItem={({ item }) => (
        <a
          className="flex h-full min-w-0"
          href={item.href}
          rel={item.isExternal ? "noreferrer" : undefined}
          target={item.isExternal ? "_blank" : undefined}
        >
          <Card className="flex h-full w-full min-w-0 flex-col transition-colors hover:bg-surface-muted">
            <CardHeader className="flex h-full min-w-0 flex-col items-start justify-start pb-6 text-left">
              <CardTitle className="min-w-0 break-all whitespace-normal text-base">{item.title}</CardTitle>
              <ReadMoreDescription>{item.description}</ReadMoreDescription>
            </CardHeader>
          </Card>
        </a>
      )}
    />
  );
}
