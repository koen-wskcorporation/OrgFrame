import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { getOrgPublicContext } from "@/lib/org/getOrgPublicContext";
import { PublicCalendarWorkspace } from "@/modules/calendar/components/PublicCalendarWorkspace";
import { listPublishedCalendarCatalog } from "@/modules/calendar/db/queries";

export const metadata: Metadata = {
  title: "Calendar"
};

export default async function PublicCalendarScreen({
  params
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const org = await getOrgPublicContext(orgSlug);
  const items = await listPublishedCalendarCatalog(org.orgId, { limit: 200 });

  return (
    <main className="app-page-shell w-full py-8 md:py-10">
      <div className="ui-stack-page">
        <PageHeader description="Published events, games, and organization schedule highlights." title="Calendar" />
        {items.length === 0 ? <Alert variant="info">No scheduled events are published yet.</Alert> : <PublicCalendarWorkspace items={items} orgSlug={org.orgSlug} />}
      </div>
    </main>
  );
}
