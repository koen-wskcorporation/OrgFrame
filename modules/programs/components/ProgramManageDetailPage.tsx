import { notFound, redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { PageStack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { PageTabs } from "@/components/ui/page-tabs";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { can } from "@/lib/permissions/can";
import { listFormsForManage } from "@/modules/forms/db/queries";
import { ProgramEditorPanel } from "@/modules/programs/components/ProgramEditorPanel";
import { ProgramPublishToggleButton } from "@/modules/programs/components/ProgramPublishToggleButton";
import { getProgramDetailsById } from "@/modules/programs/db/queries";
import { listProgramScheduleReadModelV2, listProgramScheduleTimelineWithFallback } from "@/modules/programs/schedule/db/queries";
import { listProgramTeamsSummary } from "@/modules/programs/teams/db/queries";
import { ProgramTeamsPanel } from "@/modules/programs/teams/components/ProgramTeamsPanel";

export async function ProgramManageDetailPage({
  orgSlug,
  programId,
  activeSection
}: {
  orgSlug: string;
  programId: string;
  activeSection: "structure" | "schedule" | "registration" | "settings" | "teams";
}) {
  const orgContext = await getOrgAuthContext(orgSlug);
  const canReadPrograms = can(orgContext.membershipPermissions, "programs.read") || can(orgContext.membershipPermissions, "programs.write");

  if (!canReadPrograms) {
    redirect("/forbidden");
  }

  const details = await getProgramDetailsById(orgContext.orgId, programId);

  if (!details) {
    notFound();
  }

  const canWritePrograms = can(orgContext.membershipPermissions, "programs.write");
  const canReadForms = can(orgContext.membershipPermissions, "forms.read") || can(orgContext.membershipPermissions, "forms.write");
  const canWriteForms = can(orgContext.membershipPermissions, "forms.write");
  const forms = canReadForms ? await listFormsForManage(orgContext.orgId) : [];
  const teamSummaries = canReadPrograms ? await listProgramTeamsSummary(details.program.id).catch(() => []) : [];
  const scheduleReadModel =
    activeSection === "schedule"
      ? await listProgramScheduleReadModelV2(details.program.id).catch(() => ({
          rules: [],
          occurrences: [],
          exceptions: []
        }))
      : null;
  const scheduleTimeline =
    activeSection === "schedule"
      ? await listProgramScheduleTimelineWithFallback({
          programId: details.program.id,
          legacyDetails: details
        }).catch(() => ({
          source: "legacy" as const,
          occurrences: []
        }))
      : null;
  const statusLabel = details.program.status === "published" ? "Published" : "Not published";
  const statusColor = details.program.status === "published" ? "green" : "yellow";
  const tabItems = [
    {
      key: "structure",
      label: "Structure",
      description: "Hierarchy, divisions, and teams",
      href: `/${orgContext.orgSlug}/workspace/programs/${details.program.id}/structure`
    },
    {
      key: "schedule",
      label: "Schedule",
      description: "Rules, sessions, and timeline",
      href: `/${orgContext.orgSlug}/workspace/programs/${details.program.id}/schedule`
    },
    {
      key: "registration",
      label: "Registration",
      description: "Forms, eligibility, and intake",
      href: `/${orgContext.orgSlug}/workspace/programs/${details.program.id}/registration`
    },
    {
      key: "teams",
      label: "Teams",
      description: "Roster and staff assignments",
      href: `/${orgContext.orgSlug}/workspace/programs/${details.program.id}/teams`
    },
    {
      key: "settings",
      label: "Settings",
      description: "Metadata, media, and publish state",
      href: `/${orgContext.orgSlug}/workspace/programs/${details.program.id}/settings`
    }
  ] as const;

  return (
    <PageStack>
      <PageHeader
        actions={
          <>
            <Button href={`/${orgContext.orgSlug}/workspace/programs`} variant="secondary">
              Back to programs
            </Button>
            <ProgramPublishToggleButton canWrite={canWritePrograms} orgSlug={orgContext.orgSlug} program={details.program} />
          </>
        }
        description="Edit hierarchy, schedule rules, and registration setup for this program."
        showBorder={false}
        title={
          <span className="inline-flex items-center gap-3">
            <span>{details.program.name}</span>
            <Chip className="normal-case tracking-normal" color={statusColor}>
              {statusLabel}
            </Chip>
          </span>
        }
      />
      <PageTabs active={activeSection} ariaLabel="Program pages" items={tabItems} />
      {!canWritePrograms ? <Alert variant="info">You have read-only access to this program.</Alert> : null}
      {activeSection === "teams" ? (
        <ProgramTeamsPanel
          canWrite={canWritePrograms}
          nodes={details.nodes}
          orgSlug={orgContext.orgSlug}
          programId={details.program.id}
          teamSummaries={teamSummaries}
        />
      ) : (
        <ProgramEditorPanel
          activeSection={activeSection}
          canWritePrograms={canWritePrograms}
          canReadForms={canReadForms}
          canWriteForms={canWriteForms}
          data={details}
          forms={forms}
          orgSlug={orgContext.orgSlug}
          scheduleSeed={
            scheduleReadModel
              ? {
                  rules: scheduleReadModel.rules,
                  occurrences: scheduleReadModel.occurrences,
                  exceptions: scheduleReadModel.exceptions,
                  timelineSource: scheduleTimeline?.source ?? "v2",
                  timelineOccurrences: scheduleTimeline?.occurrences ?? []
                }
              : undefined
          }
          teamSummaries={teamSummaries}
        />
      )}
    </PageStack>
  );
}
