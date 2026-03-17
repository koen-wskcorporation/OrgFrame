"use client";

import { Button } from "@orgframe/ui/ui/button";
import { Card, CardContent, CardDescription, CardHeaderCompact, CardTitle } from "@orgframe/ui/ui/card";
import { Repeater } from "@orgframe/ui/ui/repeater";

type ManageCardItem = {
  section: "organization" | "operations";
  title: string;
  description: string;
  href: string;
  cta: string;
};

type ManageCardsRepeaterProps = {
  cards: ManageCardItem[];
};

export function ManageCardsRepeater({ cards }: ManageCardsRepeaterProps) {
  return (
    <Repeater
      emptyMessage="No management modules matched your search."
      getItemKey={(card) => `${card.section}-${card.title}`}
      getSearchValue={(card) => `${card.title} ${card.description} ${card.section}`}
      items={cards}
      searchPlaceholder="Search management modules"
      renderItem={({ item, view }) => (
        <Card className={view === "list" ? "sm:flex sm:items-center sm:justify-between sm:gap-4" : undefined}>
          <CardHeaderCompact className={view === "list" ? "sm:flex-1" : undefined}>
            <CardTitle>{item.title}</CardTitle>
            <CardDescription>{item.description}</CardDescription>
          </CardHeaderCompact>
          <CardContent className={view === "list" ? "pt-0 sm:pb-0 sm:pt-0" : undefined}>
            <Button href={item.href} variant="secondary">
              {item.cta}
            </Button>
          </CardContent>
        </Card>
      )}
    />
  );
}
