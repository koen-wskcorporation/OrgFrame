import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { PageHeader } from "@/components/ui/page-header";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { can } from "@/lib/permissions/can";
import { listFormsForManage } from "@/modules/forms/db/queries";
import { ProgramEditorPanel } from "@/modules/programs/components/ProgramEditorPanel";
import { ProgramPageTabs } from "@/modules/programs/components/ProgramPageTabs";
import { ProgramPublishToggleButton } from "@/modules/programs/components/ProgramPublishToggleButton";
import { getProgramDetailsById } from "@/modules/programs/db/queries";
import { listProgramScheduleReadModelV2, listProgramScheduleTimelineWithFallback } from "@/modules/programs/schedule/db/queries";

export async function ProgramManageDetailPage({
  orgSlug,
  programId,
  activeSection
}: {
  orgSlug: string;
  programId: string;
  activeSection: "structure" | "schedule" | "registration";
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
  const sectionHref = `/${orgContext.orgSlug}/tools/programs/${details.program.id}/${activeSection}`;

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <>
            <Link className={buttonVariants({ variant: "secondary" })} href={`/${orgContext.orgSlug}/tools/programs`}>
              Back to programs
            </Link>
            <Link className={buttonVariants({ variant: "secondary" })} href={`${sectionHref}?panel=settings`}>
              Program settings
            </Link>
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
      <ProgramPageTabs active={activeSection} orgSlug={orgContext.orgSlug} programId={details.program.id} />
      {!canWritePrograms ? <Alert variant="info">You have read-only access to this program.</Alert> : null}
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
      />
    </div>
  );
}
