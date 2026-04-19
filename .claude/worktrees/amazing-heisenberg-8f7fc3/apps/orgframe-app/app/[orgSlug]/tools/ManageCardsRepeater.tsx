"use client";

import { SearchableLinkCards, type SearchableLinkCardItem } from "@orgframe/ui/primitives/searchable-link-cards";

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
  const items: SearchableLinkCardItem[] = cards.map((card) => ({
    key: `${card.section}-${card.title}`,
    title: card.title,
    description: card.description,
    href: card.href,
    ctaLabel: card.cta,
    searchText: `${card.title} ${card.description} ${card.section}`
  }));

  return (
    <SearchableLinkCards
      emptyMessage="No management modules matched your search."
      searchPlaceholder="Search management modules"
      items={items}
      defaultCtaPrefix=""
    />
  );
}
