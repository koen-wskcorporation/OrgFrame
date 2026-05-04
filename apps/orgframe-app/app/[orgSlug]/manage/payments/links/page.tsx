import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";
import { listOrgPaymentLinks } from "@/src/features/billing/service";
import { can } from "@/src/shared/permissions/can";
import { gateManageSection } from "@/src/features/core/layout/gateManageSection";
import { PageShell } from "@/src/features/core/layout/components/PageShell";
import { ManageSection } from "@/src/features/core/layout/components/ManageSection";
import { ToolUnavailablePanel } from "../../ToolUnavailablePanel";
import { PaymentsSectionNav } from "../PaymentsSectionNav";
import { PaymentLinksManager } from "./PaymentLinksManager";

export const metadata: Metadata = {
  title: "Payment Links"
};

export default async function OrgPaymentLinksPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { orgContext, unavailable } = await gateManageSection(orgSlug, {
    permission: "org.manage.read",
    tool: "billing"
  });

  if (unavailable) {
    return (
      <PageShell
        description="Create and manage payment links for this organization."
        tabs={<PaymentsSectionNav active="links" />}
        title="Payments"
      >
        <ToolUnavailablePanel title="Payments" />
      </PageShell>
    );
  }

  const canManage = can(orgContext.membershipPermissions, "org.manage.read");
  const links = canManage ? await listOrgPaymentLinks({ orgId: orgContext.orgId }).catch(() => []) : [];

  return (
    <PageShell
      description="Create shareable payment links for one-off charges and collections."
      tabs={<PaymentsSectionNav active="links" />}
      title="Payments"

    >
      {!canManage ? <Alert variant="warning">You do not have permission to manage payment links.</Alert> : null}
      {canManage ? (
        <ManageSection
          contentClassName="space-y-4 p-5 md:p-6"
          description="Create shareable payment links for one-off charges and collections."
          fill={false}
          title="Payment Links"
        >
          <PaymentLinksManager initialLinks={links} orgSlug={orgSlug} />
        </ManageSection>
      ) : null}
    </PageShell>
  );
}
