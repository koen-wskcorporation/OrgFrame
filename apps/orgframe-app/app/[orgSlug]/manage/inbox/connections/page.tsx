import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { PageShell } from "@/src/features/core/layout/components/PageShell";
import { ManageSection } from "@/src/features/core/layout/components/ManageSection";
import { gateManageSection } from "@/src/features/core/layout/gateManageSection";
import { can } from "@/src/shared/permissions/can";
import { getInboxConnectionsDataAction } from "@/src/features/inbox/actions";
import { InboxConnectionsWorkspace } from "@/src/features/inbox/components/InboxConnectionsWorkspace";
import { ToolUnavailablePanel } from "../../ToolUnavailablePanel";

export const metadata: Metadata = {
  title: "Inbox Connections"
};

export default async function OrgManageInboxConnectionsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { orgContext, unavailable } = await gateManageSection(orgSlug, {
    permission: ["communications.read", "communications.write"],
    tool: "inbox"
  });

  if (unavailable) {
    return (
      <PageShell description="Connect per-org communication channels for unified inbox routing." title="Inbox Connections">
        <ToolUnavailablePanel title="Inbox" />
      </PageShell>
    );
  }

  const canWrite = can(orgContext.membershipPermissions, "communications.write");
  const data = await getInboxConnectionsDataAction({ orgSlug });

  if (!data.ok) {
    return (
      <PageShell description="Connect per-org communication channels for unified inbox routing." title="Inbox Connections">
        <Alert className="m-5" variant="destructive">{data.error}</Alert>
      </PageShell>
    );
  }

  return (
    <PageShell
      actions={
        <Button href={`/${orgSlug}/manage/inbox`} variant="secondary">
          Open Conversations
        </Button>
      }
      description="Manage per-org channel connections and webhook routing targets for the unified inbox."
      title="Inbox Connections"
    >
      <ManageSection
        description="Per-org channel connections and webhook routing targets."
        fill={false}
        title="Connections"
      >
        <InboxConnectionsWorkspace canWrite={canWrite} initialIntegrations={data.data.integrations} orgSlug={orgSlug} />
      </ManageSection>
    </PageShell>
  );
}
