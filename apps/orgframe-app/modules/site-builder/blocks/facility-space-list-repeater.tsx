"use client";

import { Repeater } from "@orgframe/ui/ui/repeater";
import { FacilityStatusBadge } from "@orgframe/ui/modules/facilities/components/FacilityStatusBadge";

type FacilitySpaceListItem = {
  id: string;
  name: string;
  spaceKind: string;
  currentStatus: "open" | "closed" | "booked" | "archived";
  isBookable: boolean;
  nextAvailableLabel: string;
};

type FacilitySpaceListRepeaterProps = {
  items: FacilitySpaceListItem[];
};

export function FacilitySpaceListRepeater({ items }: FacilitySpaceListRepeaterProps) {
  return (
    <Repeater
      emptyMessage="No spaces are available right now."
      getItemKey={(item) => item.id}
      getSearchValue={(item) => `${item.name} ${item.spaceKind} ${item.currentStatus}`}
      items={items}
      searchPlaceholder="Search spaces"
      renderItem={({ item }) => (
        <article className="rounded-control border bg-surface px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-text">{item.name}</p>
            <span className="text-xs text-text-muted">{item.spaceKind}</span>
            <FacilityStatusBadge status={item.currentStatus} />
            {!item.isBookable ? <FacilityStatusBadge status="closed" /> : null}
          </div>
          <span className="text-xs text-text-muted">Next available: {item.nextAvailableLabel}</span>
        </article>
      )}
    />
  );
}
