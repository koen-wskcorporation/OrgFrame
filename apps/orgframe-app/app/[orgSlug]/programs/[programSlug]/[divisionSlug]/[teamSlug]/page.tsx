import { notFound } from "next/navigation";
import { Alert } from "@orgframe/ui/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/ui/card";
import { PageHeader } from "@orgframe/ui/ui/page-header";
import { CalendarWorkspace } from "@orgframe/ui/modules/calendar/components/CalendarWorkspace";
import { listCalendarReadModel, listOrgActiveTeams } from "@/modules/calendar/db/queries";
import { listFacilityReservationReadModel } from "@/modules/facilities/db/queries";
import { getOrgRequestContext } from "@/lib/org/getOrgRequestContext";
import { can } from "@/lib/permissions/can";
import { getProgramDetailsBySlug } from "@/modules/programs/db/queries";
import { getProgramTeamDetailByNodeId } from "@/modules/programs/teams/db/queries";

type TeamPageProps = {
  params: Promise<{ orgSlug: string; programSlug: string; divisionSlug: string; teamSlug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const allowedTabs = new Set(["home", "roster", "calendar", "staff", "details"]);

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

export default async function ProgramTeamPage({ params, searchParams }: TeamPageProps) {
  const { orgSlug, programSlug, divisionSlug, teamSlug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const tab = resolveTab(resolvedSearchParams);
  const orgRequest = await getOrgRequestContext(orgSlug);

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

  const details = await getProgramDetailsBySlug(orgRequest.org.orgId, programSlug, { includeDraft: false });
  if (!details) {
    notFound();
  }

  const division = details.nodes.find((node) => node.nodeKind === "division" && node.slug === divisionSlug);
  if (!division) {
    notFound();
  }

  const team = details.nodes.find((node) => node.nodeKind === "team" && node.slug === teamSlug && node.parentId === division.id);
  if (!team) {
    notFound();
  }

  const [calendarReadModel, facilityReadModel, activeTeams] =
    (tab === "home" || tab === "calendar") && canReadPrograms
      ? await Promise.all([
          listCalendarReadModel(orgRequest.org.orgId).catch(() => null),
          listFacilityReservationReadModel(orgRequest.org.orgId).catch(() => null),
          listOrgActiveTeams(orgRequest.org.orgId).catch(() => [])
        ])
      : [null, null, []];

  const teamInvites = calendarReadModel
    ? calendarReadModel.invites.filter((invite) => invite.teamId === team.id && (invite.inviteStatus === "accepted" || invite.inviteStatus === "pending"))
    : [];
  const teamOccurrenceIds = new Set(teamInvites.map((invite) => invite.occurrenceId));
  const filteredOccurrences =
    calendarReadModel?.occurrences
      .filter((occurrence) => teamOccurrenceIds.has(occurrence.id) && occurrence.status === "scheduled")
      .sort((left, right) => left.startsAtUtc.localeCompare(right.startsAtUtc)) ?? [];

  const nextOccurrences = filteredOccurrences.slice(0, 3);
  const teamDetail = canReadPrograms ? await getProgramTeamDetailByNodeId(team.id).catch(() => null) : null;
  const roster = teamDetail?.roster.filter((member) => member.status !== "removed") ?? [];
  const staff = teamDetail?.staff ?? [];

  return (
    <main className="app-page-shell w-full pb-8 pt-0 md:pb-10 md:pt-0">
      <div className="ui-stack-page">
        <PageHeader description={`Team in ${division.name}.`} title={team.name} />

        {tab === "home" ? (
          <Card>
            <CardHeader>
              <CardTitle>Team home</CardTitle>
              <CardDescription>Overview for roster, schedule, and staff.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-control border bg-surface px-3 py-2">
                  <p className="text-xs text-text-muted">Roster</p>
                  <p className="text-xl font-semibold text-text">{canReadPrograms ? roster.length : "Hidden"}</p>
                </div>
                <div className="rounded-control border bg-surface px-3 py-2">
                  <p className="text-xs text-text-muted">Staff</p>
                  <p className="text-xl font-semibold text-text">{canReadPrograms ? staff.length : "Hidden"}</p>
                </div>
                <div className="rounded-control border bg-surface px-3 py-2">
                  <p className="text-xs text-text-muted">Upcoming sessions</p>
                  <p className="text-xl font-semibold text-text">{filteredOccurrences.length}</p>
                </div>
              </div>

              {!canReadPrograms ? <Alert variant="info">Some team details are limited to staff.</Alert> : null}

              <div className="space-y-2">
                <p className="text-sm font-medium text-text">Up next</p>
                {nextOccurrences.length === 0 ? <Alert variant="info">No scheduled sessions yet.</Alert> : null}
                {nextOccurrences.map((occurrence) => (
                  <div className="rounded-control border bg-surface px-3 py-2 text-sm" key={occurrence.id}>
                    <p className="font-medium text-text">{calendarReadModel?.entries.find((entry) => entry.id === occurrence.entryId)?.title ?? "Team session"}</p>
                    <p className="text-xs text-text-muted">{formatOccurrenceLine(occurrence)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {tab === "roster" ? (
          <Card>
            <CardHeader>
              <CardTitle>Roster</CardTitle>
              <CardDescription>Active players registered for this team.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {!canReadPrograms ? <Alert variant="info">Roster visibility is limited to team staff.</Alert> : null}
              {canReadPrograms && roster.length === 0 ? <Alert variant="info">No roster entries yet.</Alert> : null}
              {canReadPrograms
                ? roster.map((member) => (
                    <div className="rounded-control border bg-surface px-3 py-2 text-sm" key={member.id}>
                      <p className="font-medium text-text">{member.player.label}</p>
                      <p className="text-xs text-text-muted">
                        {member.role}
                        {member.jerseyNumber ? ` · #${member.jerseyNumber}` : ""}
                        {member.position ? ` · ${member.position}` : ""}
                      </p>
                    </div>
                  ))
                : null}
            </CardContent>
          </Card>
        ) : null}

        {tab === "calendar" ? (
          <div className="space-y-2">
            {!canReadPrograms ? <Alert variant="info">Team calendar visibility is limited to team staff.</Alert> : null}
            {canReadPrograms && calendarReadModel ? (
              <CalendarWorkspace
                activeTeams={activeTeams}
                canWrite={canWritePrograms}
                initialFacilityReadModel={facilityReadModel ?? undefined}
                initialReadModel={calendarReadModel}
                mode="team"
                orgSlug={orgSlug}
                teamId={team.id}
                teamLabel={`${division.name}/${team.name}`}
              />
            ) : null}
          </div>
        ) : null}

        {tab === "staff" ? (
          <Card>
            <CardHeader>
              <CardTitle>Staff</CardTitle>
              <CardDescription>Assigned staff members and coaches.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {!canReadPrograms ? <Alert variant="info">Staff visibility is limited to team staff.</Alert> : null}
              {canReadPrograms && staff.length === 0 ? <Alert variant="info">No staff assigned yet.</Alert> : null}
              {canReadPrograms
                ? staff.map((member) => (
                    <div className="rounded-control border bg-surface px-3 py-2 text-sm" key={member.id}>
                      <p className="font-medium text-text">{member.email ?? member.userId}</p>
                      <p className="text-xs text-text-muted">{member.role.replace(/_/g, " ")}</p>
                    </div>
                  ))
                : null}
            </CardContent>
          </Card>
        ) : null}

        {tab === "details" ? (
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
              <CardDescription>Team metadata and division context.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-text-muted">
              <p>{division.name}</p>
              <p>Program: {details.program.name}</p>
              {teamDetail ? (
                <>
                  {teamDetail.team.teamCode ? <p>Team code: {teamDetail.team.teamCode}</p> : null}
                  {teamDetail.team.levelLabel ? <p>Level: {teamDetail.team.levelLabel}</p> : null}
                  {teamDetail.team.ageGroup ? <p>Age group: {teamDetail.team.ageGroup}</p> : null}
                  {teamDetail.team.gender ? <p>Gender: {teamDetail.team.gender}</p> : null}
                </>
              ) : (
                <Alert variant="info">Team details are available to staff members.</Alert>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
