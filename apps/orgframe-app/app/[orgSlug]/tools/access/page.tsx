import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { PageStack } from "@orgframe/ui/primitives/layout";
import type { Metadata } from "next";
import { getAccountsAccessPageData } from "@/src/features/access/actions";
import { AccountsAccessPanel } from "@/src/features/access/components/AccountsAccessPanel";
import { isOrgToolEnabled } from "@/src/shared/org/features";
import { ToolUnavailablePanel } from "../ToolUnavailablePanel";

export const metadata: Metadata = {
  title: "User Accounts"
};

export default async function OrgMembersSettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const data = await getAccountsAccessPageData(orgSlug);

  if (!isOrgToolEnabled(data.toolAvailability, "access")) {
    return (
      <PageStack>
        <PageHeader description="Invite users, assign access roles, and handle account recovery." showBorder={false} title="User Accounts" />
        <ToolUnavailablePanel title="User Accounts" />
      </PageStack>
    );
  }

  return (
    <PageStack>
      <PageHeader
        description="Invite users, assign access roles, and handle account recovery."
        showBorder={false}
        title="User Accounts"
      />
      <AccountsAccessPanel
        currentUserPermissions={data.currentUserPermissions}
        currentUserRole={data.currentUserRole}
        loadError={data.loadError}
        members={data.members}
        orgSlug={data.orgSlug}
        roles={data.roles}
        serviceRoleConfigured={data.serviceRoleConfigured}
      />
    </PageStack>
  );
}
