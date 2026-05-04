import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";
import { can } from "@/src/shared/permissions/can";
import { gateManageSection } from "@/src/features/core/layout/gateManageSection";
import { listOrgPaymentTransactions } from "@/src/features/payments/queries";
import { PaymentsSectionNav } from "@/src/features/payments/components/PaymentsSectionNav";
import { PaymentsTransactionsTable } from "@/src/features/payments/components/PaymentsTransactionsTable";
import { PageShell } from "@/src/features/core/layout/components/PageShell";
import { ManageSection } from "@/src/features/core/layout/components/ManageSection";
import { ToolUnavailablePanel } from "../ToolUnavailablePanel";

export const metadata: Metadata = {
  title: "Payments"
};

export default async function OrgPaymentsOverviewPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { orgContext, unavailable } = await gateManageSection(orgSlug, {
    permission: "org.manage.read",
    tool: "billing"
  });

  if (unavailable) {
    return (
      <PageShell
        description="Review transactions and payment settings for this organization."
        tabs={<PaymentsSectionNav active="overview" />}
        title="Payments"
      >
        <ToolUnavailablePanel title="Payments" />
      </PageShell>
    );
  }

  const canManage = can(orgContext.membershipPermissions, "org.manage.read");
  const transactions = canManage ? await listOrgPaymentTransactions({ orgId: orgContext.orgId, limit: 250 }).catch(() => []) : [];

  return (
    <PageShell
      description="Review all payment transactions for this organization."
      tabs={<PaymentsSectionNav active="overview" />}
      title="Payments"

    >
      {!canManage ? <Alert variant="warning">You do not have permission to view payment transactions.</Alert> : null}
      <ManageSection
        contentClassName="space-y-4 p-5 md:p-6"
        description="Review all payment transactions for this organization."
        fill={false}
        title="Transactions"
      >
        <PaymentsTransactionsTable transactions={transactions} />
      </ManageSection>
    </PageShell>
  );
}
