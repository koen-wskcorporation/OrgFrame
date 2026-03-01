import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/ui/back-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getOrgPublicContext } from "@/lib/org/getOrgPublicContext";
import { getPublishedEventById } from "@/modules/events/db/queries";

export const metadata: Metadata = {
  title: "Event"
};

function formatEventRange(event: {
  isAllDay: boolean;
  allDayStartDate: string | null;
  allDayEndDate: string | null;
  startsAtUtc: string;
  endsAtUtc: string;
  timezone: string;
}) {
  if (event.isAllDay && event.allDayStartDate && event.allDayEndDate) {
    if (event.allDayStartDate === event.allDayEndDate) {
      return `${event.allDayStartDate} (All day)`;
    }

    return `${event.allDayStartDate} to ${event.allDayEndDate} (All day)`;
  }

  const start = new Date(event.startsAtUtc);
  const end = new Date(event.endsAtUtc);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Time unavailable";
  }

  const formatter = new Intl.DateTimeFormat(undefined, {
    timeZone: event.timezone,
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

  return `${formatter.format(start)} to ${formatter.format(end)}`;
}

function mapEmbedUrl(location: string) {
  return `https://www.google.com/maps?q=${encodeURIComponent(location)}&output=embed`;
}

export default async function OrgEventDetailPage({
  params
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
}) {
  const { orgSlug, eventId } = await params;
  const org = await getOrgPublicContext(orgSlug);
  const event = await getPublishedEventById(org.orgId, eventId);

  if (!event) {
    notFound();
  }

  return (
    <main className="w-full px-6 py-8 md:px-8 md:py-10">
      <div className="space-y-6">
        <BackButton fallbackHref={`/${org.orgSlug}`} label="Back" size="sm" variant="ghost" />

        <PageHeader description={formatEventRange(event)} title={event.title} />

        <Card>
          <CardHeader>
            <CardTitle>Event Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {event.location ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Location</p>
                <p className="text-sm text-text">{event.location}</p>
              </div>
            ) : null}

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Description</p>
              <p className="text-sm text-text-muted">{event.summary ?? "No additional event description provided."}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Map</CardTitle>
          </CardHeader>
          <CardContent>
            {event.location ? (
              <div className="overflow-hidden rounded-control border">
                <iframe
                  className="h-[380px] w-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={mapEmbedUrl(event.location)}
                  title={`Map of ${event.location}`}
                />
              </div>
            ) : (
              <p className="text-sm text-text-muted">No location is attached to this event.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
