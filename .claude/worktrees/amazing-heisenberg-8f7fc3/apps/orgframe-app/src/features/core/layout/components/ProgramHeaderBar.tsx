"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { NavItem } from "@orgframe/ui/primitives/nav-item";
import { cn } from "@orgframe/ui/primitives/utils";
import { getProgramSubnavContextAction, type ProgramSubnavContext } from "@/src/features/programs/public/actions";

type ProgramHeaderBarProps = {
  orgSlug: string;
};

type ProgramRouteContext = {
  programSlug: string;
  divisionSlug: string;
  teamSlug: string | null;
};

type TabDefinition = {
  key: string;
  label: string;
};

const divisionTabs: TabDefinition[] = [
  { key: "home", label: "Home" },
  { key: "teams", label: "Teams" },
  { key: "calendar", label: "Calendar" },
  { key: "standings", label: "Standings" }
];

const teamTabs: TabDefinition[] = [
  { key: "home", label: "Home" },
  { key: "roster", label: "Roster" },
  { key: "calendar", label: "Calendar" },
  { key: "staff", label: "Staff" },
  { key: "details", label: "Details" }
];

const DEFAULT_DIVISION_TAB = "home";
const DEFAULT_TEAM_TAB = "home";

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseProgramRoute(pathname: string, orgSlug: string): ProgramRouteContext | null {
  const segments = pathname.split("/").filter(Boolean);
  const prefixedOffset = segments[0] === orgSlug ? 1 : 0;
  const programsIndex = prefixedOffset;
  if (segments[programsIndex] !== "programs") {
    return null;
  }
  if (segments.length < programsIndex + 3) {
    return null;
  }

  return {
    programSlug: segments[programsIndex + 1] ?? "",
    divisionSlug: segments[programsIndex + 2] ?? "",
    teamSlug: segments[programsIndex + 3] ?? null
  };
}

export function ProgramHeaderBar({ orgSlug }: ProgramHeaderBarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [context, setContext] = useState<ProgramSubnavContext | null>(null);
  const [isLoading, startTransition] = useTransition();

  const routeContext = useMemo(() => parseProgramRoute(pathname, orgSlug), [pathname, orgSlug]);

  useEffect(() => {
    if (!routeContext) {
      setContext(null);
      return;
    }

    let isActive = true;
    startTransition(async () => {
      try {
        const result = await getProgramSubnavContextAction({
          orgSlug,
          programSlug: routeContext.programSlug,
          divisionSlug: routeContext.divisionSlug,
          teamSlug: routeContext.teamSlug
        });

        if (!result.ok) {
          if (isActive) {
            setContext(null);
          }
          return;
        }

        if (isActive) {
          setContext(result.data);
        }
      } catch {
        if (isActive) {
          setContext(null);
        }
      }
    });
    return () => {
      isActive = false;
    };
  }, [orgSlug, routeContext]);

  if (!routeContext) {
    return null;
  }

  const isTeam = Boolean(routeContext.teamSlug);
  const tabs = isTeam ? teamTabs : divisionTabs;
  const defaultTab = isTeam ? DEFAULT_TEAM_TAB : DEFAULT_DIVISION_TAB;
  const pathnameSegments = pathname.split("/").filter(Boolean);
  const prefixedOffset = pathnameSegments[0] === orgSlug ? 1 : 0;
  const teamSubroute = isTeam ? (pathnameSegments[prefixedOffset + 4] ?? "").toLowerCase() : "";
  const activeTab = (() => {
    if (isTeam && teamSubroute === "calendar") {
      return "calendar";
    }
    const tab = searchParams.get("tab")?.toLowerCase() ?? "";
    return tabs.some((item) => item.key === tab) ? tab : defaultTab;
  })();

  const basePath = `/programs/${routeContext.programSlug}/${routeContext.divisionSlug}${isTeam ? `/${routeContext.teamSlug}` : ""}`;
  const programLabel = context?.program.name ?? titleFromSlug(routeContext.programSlug);
  const divisionLabel = context?.division.name ?? titleFromSlug(routeContext.divisionSlug);
  const teamLabel = routeContext.teamSlug ? context?.team?.name ?? titleFromSlug(routeContext.teamSlug) : "";

  return (
    <div className="border-t border-border/60 bg-surface-muted/70 px-4 py-2 md:px-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{programLabel}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text">
            <span>{divisionLabel}</span>
            {teamLabel ? <span className="text-text-muted">/</span> : null}
            {teamLabel ? <span>{teamLabel}</span> : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tabs.map((tab) => {
            const href =
              isTeam && tab.key === "calendar"
                ? `${basePath}/calendar`
                : tab.key === defaultTab
                  ? basePath
                  : `${basePath}?tab=${tab.key}`;
            return (
              <NavItem
                active={activeTab === tab.key}
                href={href}
                key={tab.key}
                size="sm"
                variant="header"
                className={cn(isLoading ? "opacity-60" : "")}
              >
                {tab.label}
              </NavItem>
            );
          })}
        </div>
      </div>
    </div>
  );
}
