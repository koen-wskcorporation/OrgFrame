"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import { PageTabs } from "@orgframe/ui/primitives/page-tabs";

type ProgramTabsNavProps = {
  orgSlug: string;
  programId: string;
};

export function ProgramTabsNav({ orgSlug, programId }: ProgramTabsNavProps) {
  const segment = useSelectedLayoutSegment();
  const active = (segment ?? "structure") as "structure" | "registration";
  const items = [
    {
      key: "structure",
      label: "Structure",
      description: "Hierarchy, divisions, and teams",
      href: `/${orgSlug}/manage/programs/${programId}/structure`
    },
    {
      key: "registration",
      label: "Registration",
      description: "Forms, eligibility, and intake",
      href: `/${orgSlug}/manage/programs/${programId}/registration`
    }
  ] as const;

  return <PageTabs active={active} ariaLabel="Program pages" items={items} />;
}
