import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { getOrgPublicContext } from "@/src/shared/org/getOrgPublicContext";
import { CalendarWorkspace } from "@/src/features/calendar/components/CalendarWorkspace";
import { listPublishedCalendarCatalog } from "@/src/features/calendar/db/queries";

export const metadata: Metadata = {
  title: "Events"
};

export default async function OrgPublicEventsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await getOrgPublicContext(orgSlug);
  const items = await listPublishedCalendarCatalog(org.orgId, { limit: 200 });
  const eventItems = items.filter((item) => item.entryType === "event");

  return (
    <main className="app-page-shell w-full py-8 md:py-10">
      <div className="ui-stack-page">
        <PageHeader description="Published events." title="Events" />
        {eventItems.length === 0 ? <Alert variant="info">No published events yet.</Alert> : null}
        {eventItems.length > 0 ? <CalendarWorkspace items={eventItems} mode="public" orgSlug={org.orgSlug} title="Events" /> : null}
      </div>
    </main>
  );
}
