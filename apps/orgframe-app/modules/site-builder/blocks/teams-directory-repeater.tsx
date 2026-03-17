"use client";

import { Repeater } from "@orgframe/ui/ui/repeater";

type TeamsDirectoryItem = {
  teamId: string;
  teamName: string;
  programName: string;
  divisionName: string | null;
  levelLabel: string | null;
  ageGroup: string | null;
  gender: string | null;
  memberCount: number;
  staffCount: number;
  href: string;
  showProgram: boolean;
  showDivision: boolean;
  showCounts: boolean;
};

type TeamsDirectoryRepeaterProps = {
  items: TeamsDirectoryItem[];
};

function formatMeta(item: TeamsDirectoryItem) {
  const values = [item.levelLabel, item.ageGroup, item.gender].map((value) => (value ?? "").trim()).filter(Boolean);
  return values.join(" · ");
}

export function TeamsDirectoryRepeater({ items }: TeamsDirectoryRepeaterProps) {
  return (
    <Repeater
      emptyMessage="No teams are available right now."
      getItemKey={(item) => item.teamId}
      getSearchValue={(item) => `${item.teamName} ${item.programName} ${item.divisionName ?? ""} ${item.levelLabel ?? ""} ${item.ageGroup ?? ""} ${item.gender ?? ""}`}
      items={items}
      searchPlaceholder="Search teams"
      renderItem={({ item }) => {
        const meta = formatMeta(item);
        return (
          <article className="rounded-control border bg-surface p-3">
            <h3 className="font-semibold text-text">{item.teamName}</h3>
            <p className="mt-1 text-xs text-text-muted">
              {item.showProgram ? item.programName : null}
              {item.showProgram && item.showDivision && item.divisionName ? " · " : null}
              {item.showDivision ? item.divisionName ?? "General" : null}
            </p>
            {meta ? <p className="mt-1 text-xs text-text-muted">{meta}</p> : null}
            {item.showCounts ? (
              <p className="mt-1 text-xs text-text-muted">
                {item.memberCount} players · {item.staffCount} staff
              </p>
            ) : null}
            <a className="mt-3 inline-flex rounded-full border px-3 py-1.5 text-sm font-semibold text-text hover:bg-surface-muted" href={item.href}>
              View team
            </a>
          </article>
        );
      }}
    />
  );
}
