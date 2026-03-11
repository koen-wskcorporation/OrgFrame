import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageStack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { can } from "@/lib/permissions/can";
import { getInboxConnectionsDataAction } from "@/modules/communications/actions";
import { InboxConnectionsWorkspace } from "@/modules/communications/components/InboxConnectionsWorkspace";

export const metadata: Metadata = {
  title: "Inbox Connections"
};

export default async function OrgManageInboxConnectionsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const orgContext = await getOrgAuthContext(orgSlug);

  const canRead = can(orgContext.membershipPermissions, "communications.read") || can(orgContext.membershipPermissions, "communications.write");
  const canWrite = can(orgContext.membershipPermissions, "communications.write");

  if (!canRead) {
    redirect("/forbidden");
  }

  const data = await getInboxConnectionsDataAction({
    orgSlug: orgContext.orgSlug
  });

  if (!data.ok) {
    return (
      <PageStack>
        <PageHeader description="Connect per-org communication channels for unified inbox routing." showBorder={false} title="Inbox Connections" />
        <Alert variant="destructive">{data.error}</Alert>
      </PageStack>
    );
  }

  return (
    <PageStack>
      <PageHeader
        description="Manage per-org channel connections and webhook routing targets for the unified inbox."
        showBorder={false}
        title="Inbox Connections"
        actions={
          <Button href={`/${orgContext.orgSlug}/tools/inbox`} variant="secondary">
            Open Conversations
          </Button>
        }
      />
      <InboxConnectionsWorkspace canWrite={canWrite} initialIntegrations={data.data.integrations} orgSlug={orgContext.orgSlug} />
    </PageStack>
  );
}
