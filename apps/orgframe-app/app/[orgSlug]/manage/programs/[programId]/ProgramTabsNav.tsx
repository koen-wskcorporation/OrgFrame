"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { PageTabs } from "@orgframe/ui/primitives/page-tabs";

type ProgramTabsNavProps = {
  orgSlug: string;
  programId: string;
};

export function ProgramTabsNav({ orgSlug, programId }: ProgramTabsNavProps) {
  const segment = useSelectedLayoutSegment();
  const active = (segment ?? "structure") as "structure" | "schedule" | "registration" | "teams" | "settings";
  const items = [
    {
      key: "structure",
      label: "Structure",
      description: "Hierarchy, divisions, and teams",
      href: `/${orgSlug}/manage/programs/${programId}/structure`
    },
    {
      key: "schedule",
      label: "Schedule",
      description: "Rules, sessions, and timeline",
      href: `/${orgSlug}/manage/programs/${programId}/schedule`
    },
    {
      key: "registration",
      label: "Registration",
      description: "Forms, eligibility, and intake",
      href: `/${orgSlug}/manage/programs/${programId}/registration`
    },
    {
      key: "teams",
      label: "Teams",
      description: "Roster and staff assignments",
      href: `/${orgSlug}/manage/programs/${programId}/teams`
    },
    {
      key: "settings",
      label: "Settings",
      description: "Metadata, media, and publish state",
      href: `/${orgSlug}/manage/programs/${programId}/settings`
    }
  ] as const;

  return <PageTabs active={active} ariaLabel="Program pages" items={items} />;
}
