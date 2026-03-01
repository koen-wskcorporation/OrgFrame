import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { can } from "@/lib/permissions/can";
import { EventsManagePanel } from "@/modules/events/components/EventsManagePanel";
import { listEventsForManage } from "@/modules/events/db/queries";

export const metadata: Metadata = {
  title: "Events"
};

export default async function OrgManageEventsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const orgContext = await getOrgAuthContext(orgSlug);
  const canReadEvents = can(orgContext.membershipPermissions, "events.read") || can(orgContext.membershipPermissions, "events.write");
  const canWriteEvents = can(orgContext.membershipPermissions, "events.write");

  if (!canReadEvents) {
    redirect("/forbidden");
  }

  const events = await listEventsForManage(orgContext.orgId);

  return (
    <div className="space-y-6">
      <PageHeader description="Create and manage organization events for list and calendar blocks." showBorder={false} title="Events" />
      {!canWriteEvents ? <Alert variant="info">You have read-only access to events.</Alert> : null}
      <EventsManagePanel canWrite={canWriteEvents} events={events} orgSlug={orgContext.orgSlug} />
    </div>
  );
}
