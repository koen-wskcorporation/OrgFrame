import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { getOrgPublicContext } from "@/src/shared/org/getOrgPublicContext";
import { CalendarWorkspace } from "@/src/features/calendar/components/CalendarWorkspace";
import { listPublishedCalendarCatalog } from "@/src/features/calendar/db/queries";

export const metadata: Metadata = {
  title: "Calendar"
};

export default async function OrgPublicCalendarPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await getOrgPublicContext(orgSlug);
  const items = await listPublishedCalendarCatalog(org.orgId, { limit: 200 });

  return (
    <main className="app-page-shell w-full pb-8 pt-0 md:pb-10 md:pt-0">
      <div className="ui-stack-page">
        <PageHeader description="Published events and games." title="Calendar" />
        {items.length === 0 ? <Alert variant="info">No published calendar items yet.</Alert> : null}
        {items.length > 0 ? <CalendarWorkspace items={items} mode="public" orgSlug={org.orgSlug} title="Calendar" /> : null}
      </div>
    </main>
  );
}
