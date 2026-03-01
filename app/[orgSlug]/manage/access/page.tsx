import { PageHeader } from "@/components/ui/page-header";
import type { Metadata } from "next";
import { getAccountsAccessPageData } from "@/modules/manage-access/actions";
import { AccountsAccessPanel } from "@/modules/manage-access/components/AccountsAccessPanel";

export const metadata: Metadata = {
  title: "User Accounts"
};

export default async function OrgMembersSettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const data = await getAccountsAccessPageData(orgSlug);

  return (
    <>
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
    </>
  );
}
