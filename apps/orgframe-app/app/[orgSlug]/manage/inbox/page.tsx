import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { ManagePageShell } from "@/src/features/core/layout/components/ManagePageShell";
import { ManageSection } from "@/src/features/core/layout/components/ManageSection";
import { gateManageSection } from "@/src/features/core/layout/gateManageSection";
import { can } from "@/src/shared/permissions/can";
import { getInboxWorkspaceDataAction } from "@/src/features/inbox/actions";
import { InboxWorkspace } from "@/src/features/inbox/components/InboxWorkspace";
import { ToolUnavailablePanel } from "../ToolUnavailablePanel";

export const metadata: Metadata = {
  title: "Inbox"
};

export default async function OrgManageInboxPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { orgContext, unavailable } = await gateManageSection(orgSlug, {
    permission: ["communications.read", "communications.write"],
    tool: "inbox"
  });

  if (unavailable) {
    return (
      <ManagePageShell description="Unified communication inbox and identity resolution." title="Inbox">
        <ToolUnavailablePanel title="Inbox" />
      </ManagePageShell>
    );
  }

  const canWrite = can(orgContext.membershipPermissions, "communications.write");
  const workspace = await getInboxWorkspaceDataAction({ orgSlug });

  if (!workspace.ok) {
    return (
      <ManagePageShell description="Unified communication inbox and identity resolution." title="Inbox">
        <Alert className="m-5" variant="destructive">{workspace.error}</Alert>
      </ManagePageShell>
    );
  }

  return (
    <ManagePageShell title="Inbox" variant="workspace">
      {!canWrite ? <Alert variant="info">You have read-only inbox access.</Alert> : null}
      <ManageSection
        actions={
          <Button href={`/${orgSlug}/manage/inbox/connections`} size="sm" variant="secondary">
            Connections
          </Button>
        }
        description="Unified inbox for email, SMS, social, and web chat conversations with contact identity resolution."
        title="Inbox"
      >
        <InboxWorkspace canWrite={canWrite} initialReadModel={workspace.data} orgSlug={orgSlug} />
      </ManageSection>
    </ManagePageShell>
  );
}
