"use client";

import { Button } from "@orgframe/ui/ui/button";
import { Card, CardContent, CardDescription, CardHeaderCompact, CardTitle } from "@orgframe/ui/ui/card";
import { Repeater } from "@orgframe/ui/ui/repeater";

export type SearchableLinkCardItem = {
  key: string;
  title: string;
  href: string;
  ctaLabel?: string;
  description?: string | null;
  searchText?: string;
};

type SearchableLinkCardsProps = {
  items: SearchableLinkCardItem[];
  emptyMessage: string;
  searchPlaceholder: string;
  defaultCtaPrefix?: string;
};

export function SearchableLinkCards({ items, emptyMessage, searchPlaceholder, defaultCtaPrefix = "Open" }: SearchableLinkCardsProps) {
  return (
    <Repeater
      emptyMessage={emptyMessage}
      getItemKey={(item) => item.key}
      getSearchValue={(item) => item.searchText ?? `${item.title} ${item.description ?? ""}`}
      items={items}
      searchPlaceholder={searchPlaceholder}
      renderItem={({ item, view }) => (
        <Card className={view === "list" ? "sm:flex sm:items-center sm:justify-between sm:gap-4" : undefined}>
          <CardHeaderCompact className={view === "list" ? "sm:flex-1" : undefined}>
            <CardTitle>{item.title}</CardTitle>
            {item.description ? <CardDescription>{item.description}</CardDescription> : null}
          </CardHeaderCompact>
          <CardContent className={view === "list" ? "pt-0 sm:pb-0 sm:pt-0" : "pt-4"}>
            <Button href={item.href} variant="secondary">
              {item.ctaLabel ?? `${defaultCtaPrefix} ${item.title}`}
            </Button>
          </CardContent>
        </Card>
      )}
    />
  );
}
