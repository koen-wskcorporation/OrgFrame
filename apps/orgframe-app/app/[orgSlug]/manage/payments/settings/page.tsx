import { Alert } from "@orgframe/ui/primitives/alert";
import type { Metadata } from "next";
import { getBillingWorkspaceData, getOrCreateStripeConnectAccount, syncStripeConnectAccount } from "@/src/features/billing/service";
import { can } from "@/src/shared/permissions/can";
import { gateManageSection } from "@/src/features/core/layout/gateManageSection";
import { PageShell } from "@/src/features/core/layout/components/PageShell";
import { Section } from "@orgframe/ui/primitives/section";
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
  const [{ orgContext, unavailable }, query] = await Promise.all([
    gateManageSection(orgSlug, { permission: "org.manage.read", tool: "billing" }),
    searchParams
  ]);

  if (unavailable) {
    return (
      <PageShell
        description="Manage Stripe Connect and tax settings for this organization."
        tabs={<PaymentsSectionNav active="settings" />}
        title="Payments"
      >
        <ToolUnavailablePanel title="Payments" />
      </PageShell>
    );
  }

  const canManage = can(orgContext.membershipPermissions, "org.manage.read");

  if (query.connect && canManage) {
    const account = await getOrCreateStripeConnectAccount({
      orgId: orgContext.orgId,
      orgSlug: orgContext.orgSlug,
      actorUserId: orgContext.userId
    });
    await syncStripeConnectAccount({ orgId: orgContext.orgId, connectAccountId: account.connectAccountId });
  }

  const workspaceData = await getBillingWorkspaceData({
    orgSlug: orgContext.orgSlug,
    orgId: orgContext.orgId,
    canManage
  });

  return (
    <PageShell
      description="Manage Stripe Connect onboarding and tax defaults for this organization."
      tabs={<PaymentsSectionNav active="settings" />}
      title="Payments"

    >
      {query.connect === "return" ? <Alert variant="success">Stripe onboarding returned successfully. Status was refreshed.</Alert> : null}
      {query.connect === "refresh" ? <Alert variant="info">Stripe onboarding session refreshed. Continue onboarding when ready.</Alert> : null}
      <Section
        contentClassName="space-y-4 p-5 md:p-6"
        description="Manage Stripe Connect onboarding and tax defaults for this organization."
        fill={false}
        title="Settings"
      >
        <BillingWorkspace data={workspaceData} />
      </Section>
    </PageShell>
  );
}
