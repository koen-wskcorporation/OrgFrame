import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackButton } from "@orgframe/ui/primitives/back-button";
import { Card, CardContent, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { getOrgPublicContext } from "@/src/shared/org/getOrgPublicContext";
import { getCalendarOccurrenceReadModel } from "@/src/features/calendar/db/queries";

export const metadata: Metadata = {
  title: "Calendar Item"
};

export default async function OrgCalendarOccurrenceDetailPage({
  params
}: {
  params: Promise<{ orgSlug: string; occurrenceId: string }>;
}) {
  const { orgSlug, occurrenceId } = await params;
  const org = await getOrgPublicContext(orgSlug);
  const readModel = await getCalendarOccurrenceReadModel(org.orgId, occurrenceId);

  if (!readModel || readModel.entry.visibility !== "published" || readModel.entry.status !== "scheduled") {
    notFound();
  }

  const location = typeof readModel.entry.settingsJson.location === "string" ? readModel.entry.settingsJson.location : null;

  return (
    <main className="app-page-shell w-full pb-8 pt-0 md:pb-10 md:pt-0">
      <div className="ui-stack-page">
        <BackButton fallbackHref={`/${org.orgSlug}`} label="Back" size="sm" variant="ghost" />
        <PageHeader description={`${readModel.entry.entryType} · ${new Date(readModel.occurrence.startsAtUtc).toLocaleString()}`} title={readModel.entry.title} />

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {readModel.entry.summary ? <p className="text-sm text-text-muted">{readModel.entry.summary}</p> : null}
            {location ? <p className="text-sm text-text-muted">Location: {location}</p> : null}
            <p className="text-sm text-text-muted">
              {new Date(readModel.occurrence.startsAtUtc).toLocaleString()} - {new Date(readModel.occurrence.endsAtUtc).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
