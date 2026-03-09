import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { getOrgPublicContext } from "@/lib/org/getOrgPublicContext";
import { PublicCalendarWorkspace } from "@/modules/calendar/components/PublicCalendarWorkspace";
import { listPublishedCalendarCatalog } from "@/modules/calendar/db/queries";

export const metadata: Metadata = {
  title: "Events"
};

export default async function PublicEventsScreen({
  params
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const org = await getOrgPublicContext(orgSlug);
  const allItems = await listPublishedCalendarCatalog(org.orgId, { limit: 200 });
  const items = allItems.filter((item) => item.entryType === "event");

  return (
    <main className="app-page-shell w-full py-8 md:py-10">
      <div className="ui-stack-page">
        <PageHeader description="Published organization events and schedules." title="Events" />
        {items.length === 0 ? <Alert variant="info">No published events are available yet.</Alert> : <PublicCalendarWorkspace items={items} orgSlug={org.orgSlug} title="Events" />}
      </div>
    </main>
  );
}
