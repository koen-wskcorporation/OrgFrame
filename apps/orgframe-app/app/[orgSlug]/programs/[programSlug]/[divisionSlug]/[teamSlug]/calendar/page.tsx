import { notFound } from "next/navigation";
import { Alert } from "@orgframe/ui/ui/alert";
import { PageHeader } from "@orgframe/ui/ui/page-header";
import { CalendarWorkspace } from "@orgframe/ui/modules/calendar/components/CalendarWorkspace";
import { listCalendarReadModel, listOrgActiveTeams } from "@/modules/calendar/db/queries";
import { listFacilityReservationReadModel } from "@/modules/facilities/db/queries";
import { getOrgRequestContext } from "@/lib/org/getOrgRequestContext";
import { can } from "@/lib/permissions/can";
import { getProgramDetailsBySlug } from "@/modules/programs/db/queries";

type TeamCalendarPageProps = {
  params: Promise<{ orgSlug: string; programSlug: string; divisionSlug: string; teamSlug: string }>;
};

export default async function ProgramTeamCalendarPage({ params }: TeamCalendarPageProps) {
  const { orgSlug, programSlug, divisionSlug, teamSlug } = await params;
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

  const [calendarReadModel, facilityReadModel, activeTeams] = canReadPrograms
    ? await Promise.all([
        listCalendarReadModel(orgRequest.org.orgId).catch(() => null),
        listFacilityReservationReadModel(orgRequest.org.orgId).catch(() => null),
        listOrgActiveTeams(orgRequest.org.orgId).catch(() => [])
      ])
    : [null, null, []];

  return (
    <main className="app-page-shell w-full pb-8 pt-0 md:pb-10 md:pt-0">
      <div className="ui-stack-page">
        <PageHeader description={`Team in ${division.name}.`} title={team.name} />
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
    </main>
  );
}
