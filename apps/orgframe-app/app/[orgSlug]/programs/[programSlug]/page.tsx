import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { ManageCalendarSection } from "@/app/[orgSlug]/manage/calendar/ManageCalendarSection";
import { getOrgAssetPublicUrl } from "@/src/shared/branding/getOrgAssetPublicUrl";
import { getOrgRequestContext } from "@/src/shared/org/getOrgRequestContext";
import { can } from "@/src/shared/permissions/can";
import { getCalendarWorkspaceDataAction } from "@/src/features/calendar/actions";
import { scopeCalendarReadModelByContext } from "@/src/features/calendar/read-model-scope";
import { listPublishedFormsForProgram } from "@/src/features/forms/db/queries";
import { getProgramDetailsBySlug } from "@/src/features/programs/db/queries";
import { listProgramScheduleTimelineWithFallback } from "@/src/features/programs/schedule/db/queries";

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ orgSlug: string; programSlug: string }>;
}): Promise<Metadata> {
  const { programSlug } = await params;
  return {
    title: titleFromSlug(programSlug) || "Program"
  };
}

function formatDateRange(startDate: string | null, endDate: string | null) {
  if (startDate && endDate) {
    return `${startDate} to ${endDate}`;
  }

  if (startDate) {
    return `Starts ${startDate}`;
  }

  if (endDate) {
    return `Ends ${endDate}`;
  }

  return "Dates to be announced";
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

export default async function OrgProgramDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ orgSlug: string; programSlug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgSlug, programSlug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const tab = typeof resolvedSearchParams?.tab === "string" ? resolvedSearchParams.tab : "home";
  const orgRequest = await getOrgRequestContext(orgSlug);
  const details = await getProgramDetailsBySlug(orgRequest.org.orgId, programSlug, {
    includeDraft: false
  });

  if (!details) {
    notFound();
  }

  const [forms, scheduleTimeline] = await Promise.all([
    listPublishedFormsForProgram(orgRequest.org.orgId, details.program.id),
    listProgramScheduleTimelineWithFallback({
      programId: details.program.id,
      legacyDetails: details
    })
  ]);
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
          programId: details.program.id
        })
      : null;

  const nodeById = new Map(details.nodes.map((node) => [node.id, node]));

  return (
    <main className="app-page-shell w-full py-8 md:py-10">
      <div className="ui-stack-page">
        <PageHeader
          description={details.program.description ?? "Program details and registration options."}
          title={details.program.name}
        />
        {details.program.coverImagePath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={`${details.program.name} cover`}
            className="h-64 w-full rounded-card border object-cover"
            src={getOrgAssetPublicUrl(details.program.coverImagePath) ?? ""}
          />
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Program details</CardTitle>
              <CardDescription>Availability window and taxonomy.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-text-muted">
              <p>Status: {details.program.status}</p>
              <p>Type: {details.program.programType === "custom" ? details.program.customTypeLabel ?? "Custom" : details.program.programType}</p>
              <p>{formatDateRange(details.program.startDate, details.program.endDate)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Registration</CardTitle>
              <CardDescription>Choose a published form to submit.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {forms.length === 0 ? <Alert variant="info">Registration is not open yet for this program.</Alert> : null}
              {forms.map((form) => (
                <div className="rounded-control border bg-surface px-3 py-3" key={form.id}>
                  <p className="font-semibold text-text">{form.name}</p>
                  <p className="text-xs text-text-muted">/{orgSlug}/register/{form.slug}</p>
                  <div className="mt-2">
                    <Button href={`/register/${form.slug}`} size="sm">
                      Register
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {tab === "calendar" ? (
          <div className="space-y-2">
            {!canReadPrograms ? <Alert variant="info">Program calendar visibility is limited to authorized members.</Alert> : null}
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
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Program Structure</CardTitle>
                <CardDescription>Published structure nodes and capacity planning.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {details.nodes.length === 0 ? <Alert variant="info">No structure nodes published yet.</Alert> : null}
                {details.nodes.map((node) => {
                  const parent = node.parentId ? nodeById.get(node.parentId) ?? null : null;
                  const href =
                    node.nodeKind === "division"
                      ? `/programs/${details.program.slug}/${node.slug}`
                      : parent
                        ? `/programs/${details.program.slug}/${parent.slug}/${node.slug}`
                        : null;

                  return (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border bg-surface px-3 py-2 text-sm" key={node.id}>
                      <div>
                        <p className="font-medium text-text">{node.name}</p>
                        <p className="text-xs text-text-muted">
                          {node.nodeKind}
                          {typeof node.capacity === "number" ? ` · Capacity ${node.capacity}` : " · Open capacity"}
                          {node.waitlistEnabled ? " · Waitlist enabled" : ""}
                        </p>
                      </div>
                      {href ? (
                        <Button href={href} size="sm" variant="ghost">
                          View
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Schedule</CardTitle>
                <CardDescription>Published session timeline.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {scheduleTimeline.occurrences.length === 0 ? <Alert variant="info">No schedule sessions yet.</Alert> : null}
                {scheduleTimeline.occurrences.map((occurrence) => (
                  <div className="rounded-control border bg-surface px-3 py-2 text-sm" key={occurrence.id}>
                    <p className="font-medium text-text">{occurrence.title ?? "Program session"}</p>
                    <p className="text-xs text-text-muted">{formatOccurrenceLine(occurrence)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
