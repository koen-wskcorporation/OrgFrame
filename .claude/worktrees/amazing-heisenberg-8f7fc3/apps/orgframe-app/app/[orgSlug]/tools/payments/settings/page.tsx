import { Alert } from "@orgframe/ui/primitives/alert";
import type { Metadata } from "next";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { getBillingWorkspaceData, getOrCreateStripeConnectAccount, syncStripeConnectAccount } from "@/src/features/billing/service";
import { can } from "@/src/shared/permissions/can";
import { requireOrgPermission } from "@/src/shared/permissions/requireOrgPermission";
import { isOrgToolEnabled } from "@/src/shared/org/features";
import { BillingWorkspace } from "../../billing/BillingWorkspace";
import { ToolUnavailablePanel } from "../../ToolUnavailablePanel";
import { PaymentsSectionNav } from "../PaymentsSectionNav";

export const metadata: Metadata = {
  title: "Payments Settings"
};

export default async function OrgPaymentsSettingsPage({
  params,
  searchParams
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ connect?: string }>;
}) {
  const { orgSlug } = await params;
  const [orgContext, query] = await Promise.all([requireOrgPermission(orgSlug, "org.manage.read"), searchParams]);

  if (!isOrgToolEnabled(orgContext.toolAvailability, "billing")) {
    return (
      <PageStack>
        <PageHeader description="Manage Stripe Connect and tax settings for this organization." showBorder={false} title="Payments" />
        <PaymentsSectionNav active="settings" />
        <ToolUnavailablePanel title="Payments" />
      </PageStack>
    );
  }

  const canManage = can(orgContext.membershipPermissions, "org.manage.read");

  if (query.connect && canManage) {
    const account = await getOrCreateStripeConnectAccount({
      orgId: orgContext.orgId,
      orgSlug: orgContext.orgSlug,
      actorUserId: orgContext.userId
    });

    await syncStripeConnectAccount({
      orgId: orgContext.orgId,
      connectAccountId: account.connectAccountId
    });
  }

  const workspaceData = await getBillingWorkspaceData({
    orgSlug: orgContext.orgSlug,
    orgId: orgContext.orgId,
    canManage
  });

  return (
    <PageStack>
      <PageHeader description="Manage Stripe Connect onboarding and tax defaults for this organization." showBorder={false} title="Payments" />
      <PaymentsSectionNav active="settings" />

      {query.connect === "return" ? <Alert variant="success">Stripe onboarding returned successfully. Status was refreshed.</Alert> : null}
      {query.connect === "refresh" ? <Alert variant="info">Stripe onboarding session refreshed. Continue onboarding when ready.</Alert> : null}

      <BillingWorkspace data={workspaceData} />
    </PageStack>
  );
}
