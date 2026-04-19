import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { can } from "@/src/shared/permissions/can";
import { isOrgToolEnabled } from "@/src/features/core/config/tools";
import { getInboxWorkspaceDataAction } from "@/src/features/communications/actions";
import { InboxWorkspace } from "@/src/features/communications/components/InboxWorkspace";
import { ToolUnavailablePanel } from "../ToolUnavailablePanel";

export const metadata: Metadata = {
  title: "Inbox"
};

export default async function OrgManageInboxPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const orgContext = await getOrgAuthContext(orgSlug);
  if (!isOrgToolEnabled(orgContext.toolAvailability, "inbox")) {
    return (
      <PageStack>
        <PageHeader description="Unified communication inbox and identity resolution." showBorder={false} title="Inbox" />
        <ToolUnavailablePanel title="Inbox" />
      </PageStack>
    );
  }

  const canRead = can(orgContext.membershipPermissions, "communications.read") || can(orgContext.membershipPermissions, "communications.write");
  const canWrite = can(orgContext.membershipPermissions, "communications.write");

  if (!canRead) {
    redirect("/forbidden");
  }

  const workspace = await getInboxWorkspaceDataAction({
    orgSlug: orgContext.orgSlug
  });

  if (!workspace.ok) {
    return (
      <PageStack>
        <PageHeader description="Unified communication inbox and identity resolution." showBorder={false} title="Inbox" />
        <Alert variant="destructive">{workspace.error}</Alert>
      </PageStack>
    );
  }

  return (
    <PageStack>
      <PageHeader
        actions={
          <Button href={`/${orgContext.orgSlug}/manage/inbox/connections`} size="sm" variant="secondary">
            Connections
          </Button>
        }
        description="Unified inbox for email, SMS, social, and web chat conversations with contact identity resolution."
        showBorder={false}
        title="Inbox"
      />
      {!canWrite ? <Alert variant="info">You have read-only inbox access.</Alert> : null}
      <InboxWorkspace canWrite={canWrite} initialReadModel={workspace.data} orgSlug={orgContext.orgSlug} />
    </PageStack>
  );
}
