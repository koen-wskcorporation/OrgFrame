import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageStack } from "@/components/ui/layout";
import { PageHeader } from "@/components/ui/page-header";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { can } from "@/lib/permissions/can";
import { getInboxWorkspaceDataAction } from "@/modules/communications/actions";
import { InboxWorkspace } from "@/modules/communications/components/InboxWorkspace";

export const metadata: Metadata = {
  title: "Inbox"
};

export default async function OrgManageInboxPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const orgContext = await getOrgAuthContext(orgSlug);

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
          <Button href={`/${orgContext.orgSlug}/tools/inbox/connections`} size="sm" variant="secondary">
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
