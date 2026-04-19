"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { PageTabs } from "@orgframe/ui/primitives/page-tabs";

type FacilityTabsNavProps = {
  orgSlug: string;
  spaceId: string;
};

export function FacilityTabsNav({ orgSlug, spaceId }: FacilityTabsNavProps) {
  const segment = useSelectedLayoutSegment();
  const active = (segment ?? "structure") as "overview" | "structure" | "settings";
  const items = [
    {
      key: "overview",
      label: "Overview",
      description: "Status, visibility, and controls",
      href: `/${orgSlug}/manage/facilities/${spaceId}/overview`
    },
    {
      key: "structure",
      label: "Structure",
      description: "Zones, rooms, and nested layout",
      href: `/${orgSlug}/manage/facilities/${spaceId}/structure`
    },
    {
      key: "settings",
      label: "Settings",
      description: "Status, booking controls, and archive",
      href: `/${orgSlug}/manage/facilities/${spaceId}/settings`
    }
  ] as const;

  return <PageTabs active={active} ariaLabel="Facility pages" items={items} />;
}
