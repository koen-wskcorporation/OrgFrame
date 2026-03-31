import { notFound, redirect } from "next/navigation";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { Chip } from "@orgframe/ui/primitives/chip";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { PageTabs } from "@orgframe/ui/primitives/page-tabs";
import { ProgramEditorPanel } from "@/src/features/programs/components/ProgramEditorPanel";
import { ProgramPublishToggleButton } from "@/src/features/programs/components/ProgramPublishToggleButton";
import { ProgramTeamsPanel } from "@/src/features/programs/teams/components/ProgramTeamsPanel";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { can } from "@/src/shared/permissions/can";
import { isOrgToolEnabled } from "@/src/shared/org/features";
import { listFormsForManage } from "@/src/features/forms/db/queries";
import { getProgramDetailsById } from "@/src/features/programs/db/queries";
import { listProgramScheduleReadModelV2, listProgramScheduleTimelineWithFallback } from "@/src/features/programs/schedule/db/queries";
import { listProgramTeamsSummary } from "@/src/features/programs/teams/db/queries";
import { ToolUnavailablePanel } from "../../ToolUnavailablePanel";

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
  if (!isOrgToolEnabled(orgContext.toolAvailability, "programs")) {
    return (
      <PageStack>
        <PageHeader description="Edit hierarchy, schedule rules, and registration setup for this program." showBorder={false} title="Program unavailable" />
        <ToolUnavailablePanel title="Programs" />
      </PageStack>
    );
  }
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
      href: `/${orgContext.orgSlug}/tools/programs/${details.program.id}/structure`
    },
    {
      key: "schedule",
      label: "Schedule",
      description: "Rules, sessions, and timeline",
      href: `/${orgContext.orgSlug}/tools/programs/${details.program.id}/schedule`
    },
    {
      key: "registration",
      label: "Registration",
      description: "Forms, eligibility, and intake",
      href: `/${orgContext.orgSlug}/tools/programs/${details.program.id}/registration`
    },
    {
      key: "teams",
      label: "Teams",
      description: "Roster and staff assignments",
      href: `/${orgContext.orgSlug}/tools/programs/${details.program.id}/teams`
    },
    {
      key: "settings",
      label: "Settings",
      description: "Metadata, media, and publish state",
      href: `/${orgContext.orgSlug}/tools/programs/${details.program.id}/settings`
    }
  ] as const;

  return (
    <PageStack>
      <PageHeader
        actions={
          <>
            <Button href={`/${orgContext.orgSlug}/tools/programs`} variant="secondary">
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
