import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { listOrgPaymentTransactions } from "@/src/features/billing/service";
import { can } from "@/src/shared/permissions/can";
import { requireOrgPermission } from "@/src/shared/permissions/requireOrgPermission";
import { isOrgToolEnabled } from "@/src/shared/org/features";
import { ToolUnavailablePanel } from "../ToolUnavailablePanel";
import { PaymentsSectionNav } from "./PaymentsSectionNav";
import { PaymentsTransactionsTable } from "./PaymentsTransactionsTable";

export const metadata: Metadata = {
  title: "Payments"
};

export default async function OrgPaymentsOverviewPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const orgContext = await requireOrgPermission(orgSlug, "org.manage.read");

  if (!isOrgToolEnabled(orgContext.toolAvailability, "billing")) {
    return (
      <PageStack>
        <PageHeader description="Review transactions and payment settings for this organization." showBorder={false} title="Payments" />
        <ToolUnavailablePanel title="Payments" />
      </PageStack>
    );
  }

  const canManage = can(orgContext.membershipPermissions, "org.manage.read");
  const transactions = canManage ? await listOrgPaymentTransactions({ orgId: orgContext.orgId, limit: 250 }).catch(() => []) : [];

  return (
    <PageStack>
      <PageHeader description="Review all payment transactions for this organization." showBorder={false} title="Payments" />
      <PaymentsSectionNav active="overview" />

      {!canManage ? <Alert variant="warning">You do not have permission to view payment transactions.</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
          <CardDescription>Most recent transactions across all orders in this organization.</CardDescription>
        </CardHeader>
        <CardContent>
          <PaymentsTransactionsTable transactions={transactions} />
        </CardContent>
      </Card>
    </PageStack>
  );
}
