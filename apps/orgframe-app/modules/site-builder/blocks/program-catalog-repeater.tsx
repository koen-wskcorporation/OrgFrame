"use client";

import { buttonVariants } from "@orgframe/ui/ui/button";
import { Repeater } from "@orgframe/ui/ui/repeater";

type ProgramCatalogRepeaterItem = {
  id: string;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  href: string;
  metaLabel: string;
};

type ProgramCatalogRepeaterProps = {
  items: ProgramCatalogRepeaterItem[];
};

export function ProgramCatalogRepeater({ items }: ProgramCatalogRepeaterProps) {
  return (
    <Repeater
      emptyMessage="No published programs are available right now."
      getItemKey={(item) => item.id}
      getSearchValue={(item) => `${item.name} ${item.metaLabel} ${item.description ?? ""}`}
      items={items}
      searchPlaceholder="Search programs"
      renderItem={({ item, view }) => (
        <article className={view === "list" ? "rounded-control border bg-surface p-3 sm:flex sm:gap-4" : "rounded-control border bg-surface p-3"}>
          {item.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={`${item.name} cover`}
              className={view === "list" ? "mb-3 h-36 w-full rounded-control object-cover sm:mb-0 sm:h-32 sm:w-44" : "mb-3 h-36 w-full rounded-control object-cover"}
              src={item.coverImageUrl}
            />
          ) : null}
          <div className="min-w-0">
            <h3 className="font-semibold text-text">{item.name}</h3>
            <p className="mt-1 text-xs text-text-muted">{item.metaLabel}</p>
            <p className="mt-2 text-sm text-text-muted">{item.description ?? "View details and registration options."}</p>
            <a className={buttonVariants({ size: "sm", variant: "secondary" })} href={item.href}>
              View program
            </a>
          </div>
        </article>
      )}
    />
  );
}
