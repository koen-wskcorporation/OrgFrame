import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { can } from "@/src/shared/permissions/can";
import { isOrgToolEnabled } from "@/src/shared/org/features";
import { getInboxConnectionsDataAction } from "@/src/features/communications/actions";
import { InboxConnectionsWorkspace } from "@/src/features/communications/components/InboxConnectionsWorkspace";
import { ToolUnavailablePanel } from "../../ToolUnavailablePanel";

export const metadata: Metadata = {
  title: "Inbox Connections"
};

export default async function OrgManageInboxConnectionsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const orgContext = await getOrgAuthContext(orgSlug);
  if (!isOrgToolEnabled(orgContext.toolAvailability, "inbox")) {
    return (
      <PageStack>
        <PageHeader description="Connect per-org communication channels for unified inbox routing." showBorder={false} title="Inbox Connections" />
        <ToolUnavailablePanel title="Inbox" />
      </PageStack>
    );
  }

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
