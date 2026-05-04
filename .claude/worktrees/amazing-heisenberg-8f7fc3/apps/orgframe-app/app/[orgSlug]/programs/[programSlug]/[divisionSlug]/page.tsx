import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { ManageCalendarSection } from "@/app/[orgSlug]/manage/calendar/ManageCalendarSection";
import { getOrgRequestContext } from "@/src/shared/org/getOrgRequestContext";
import { can } from "@/src/shared/permissions/can";
import { getCalendarWorkspaceDataAction } from "@/src/features/calendar/actions";
import { scopeCalendarReadModelByContext } from "@/src/features/calendar/read-model-scope";
import { getProgramDetailsBySlug } from "@/src/features/programs/db/queries";
import { listProgramScheduleTimelineWithFallback } from "@/src/features/programs/schedule/db/queries";

type DivisionPageProps = {
  params: Promise<{ orgSlug: string; programSlug: string; divisionSlug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const allowedTabs = new Set(["home", "teams", "calendar", "standings"]);

function resolveTab(searchParams: Record<string, string | string[] | undefined> | undefined) {
  const value = typeof searchParams?.tab === "string" ? searchParams.tab : "";
  return allowedTabs.has(value) ? value : "home";
}

function formatOccurrenceLine(input: { startsAtUtc: string; endsAtUtc: string; timezone: string }) {
  const startsAt = new Date(input.startsAtUtc);
  const endsAt = new Date(input.endsAtUtc);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return "Date pending";
  }

  return `${startsAt.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  })} · ${startsAt.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit"
  })} - ${endsAt.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit"
  })} (${input.timezone})`;
}

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function generateMetadata({ params }: DivisionPageProps): Promise<Metadata> {
  const { divisionSlug, programSlug } = await params;
  const divisionTitle = titleFromSlug(divisionSlug) || "Division";
  const programTitle = titleFromSlug(programSlug) || "Program";

  return {
    title: `${divisionTitle} (${programTitle})`
  };
}

export default async function ProgramDivisionPage({ params, searchParams }: DivisionPageProps) {
  const { orgSlug, programSlug, divisionSlug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const tab = resolveTab(resolvedSearchParams);
  const orgRequest = await getOrgRequestContext(orgSlug);
  const details = await getProgramDetailsBySlug(orgRequest.org.orgId, programSlug, { includeDraft: false });

  if (!details) {
    notFound();
  }

  const division = details.nodes.find((node) => node.nodeKind === "division" && node.slug === divisionSlug);
  if (!division) {
    notFound();
  }

  const teams = details.nodes.filter((node) => node.nodeKind === "team" && node.parentId === division.id);
  const canReadPrograms = Boolean(
    orgRequest.membership &&
      (can(orgRequest.membership.permissions, "programs.read") ||
        can(orgRequest.membership.permissions, "programs.write") ||
        can(orgRequest.membership.permissions, "calendar.read") ||
        can(orgRequest.membership.permissions, "calendar.write"))
  );
  const canWritePrograms = Boolean(
    orgRequest.membership &&
      (can(orgRequest.membership.permissions, "programs.write") ||
        can(orgRequest.membership.permissions, "calendar.write") ||
        can(orgRequest.membership.permissions, "org.manage.read"))
  );

  const workspaceData = tab === "calendar" && canReadPrograms ? await getCalendarWorkspaceDataAction({ orgSlug }) : null;
  const scopedReadModel =
    workspaceData?.ok
      ? scopeCalendarReadModelByContext({
          readModel: workspaceData.data.readModel,
          divisionId: division.id
        })
      : null;

  const scheduleTimeline =
    tab === "calendar" || tab === "home" ? await listProgramScheduleTimelineWithFallback({ programId: details.program.id, legacyDetails: details }) : null;
  const calendarNodes = new Set([division.id, ...teams.map((team) => team.id)]);
  const filteredOccurrences =
    scheduleTimeline?.occurrences.filter((occurrence) => !occurrence.programNodeId || calendarNodes.has(occurrence.programNodeId)) ?? [];
  const nextOccurrences = filteredOccurrences.slice(0, 3);

  return (
    <main className="app-page-shell w-full py-8 md:py-10">
      <div className="ui-stack-page">
        <PageHeader description={`Division in ${details.program.name}.`} title={division.name} />

        {tab === "home" ? (
          <Card>
            <CardHeader>
              <CardTitle>Division home</CardTitle>
              <CardDescription>Overview for teams, schedule, and standings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-control border bg-surface px-3 py-2">
                  <p className="text-xs text-text-muted">Teams</p>
                  <p className="text-xl font-semibold text-text">{teams.length}</p>
                </div>
                <div className="rounded-control border bg-surface px-3 py-2">
                  <p className="text-xs text-text-muted">Upcoming sessions</p>
                  <p className="text-xl font-semibold text-text">{filteredOccurrences.length}</p>
                </div>
                <div className="rounded-control border bg-surface px-3 py-2">
                  <p className="text-xs text-text-muted">Standings</p>
                  <p className="text-xl font-semibold text-text">Pending</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-text">Up next</p>
                {nextOccurrences.length === 0 ? <Alert variant="info">No scheduled sessions yet.</Alert> : null}
                {nextOccurrences.map((occurrence) => (
                  <div className="rounded-control border bg-surface px-3 py-2 text-sm" key={occurrence.id}>
                    <p className="font-medium text-text">{occurrence.title ?? "Division session"}</p>
                    <p className="text-xs text-text-muted">{formatOccurrenceLine(occurrence)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {tab === "teams" ? (
          <Card>
            <CardHeader>
              <CardTitle>Teams</CardTitle>
              <CardDescription>Teams competing within this division.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {teams.length === 0 ? <Alert variant="info">No teams have been published yet.</Alert> : null}
              {teams.map((team) => (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border bg-surface px-3 py-2 text-sm" key={team.id}>
                  <div>
                    <p className="font-medium text-text">{team.name}</p>
                    <p className="text-xs text-text-muted">Team · {team.slug}</p>
                  </div>
                  <Button href={`/programs/${details.program.slug}/${division.slug}/${team.slug}`} size="sm" variant="secondary">
                    View team
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {tab === "calendar" ? (
          <div className="space-y-2">
            {!canReadPrograms ? <Alert variant="info">Division calendar visibility is limited to authorized members.</Alert> : null}
            {canReadPrograms && workspaceData?.ok && scopedReadModel ? (
              <ManageCalendarSection
                activeTeams={workspaceData.data.activeTeams}
                canWrite={canWritePrograms}
                initialFacilityReadModel={workspaceData.data.facilityReadModel}
                initialReadModel={scopedReadModel}
                orgSlug={orgSlug}
              />
            ) : null}
          </div>
        ) : null}

        {tab === "standings" ? (
          <Card>
            <CardHeader>
              <CardTitle>Standings</CardTitle>
              <CardDescription>Track division records and rankings.</CardDescription>
            </CardHeader>
            <CardContent>
              <Alert variant="info">Standings will appear here once results are recorded.</Alert>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
