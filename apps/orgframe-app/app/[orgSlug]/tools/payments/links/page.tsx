import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { listOrgPaymentLinks } from "@/src/features/billing/service";
import { can } from "@/src/shared/permissions/can";
import { requireOrgPermission } from "@/src/shared/permissions/requireOrgPermission";
import { isOrgToolEnabled } from "@/src/shared/org/features";
import { ToolUnavailablePanel } from "../../ToolUnavailablePanel";
import { PaymentsSectionNav } from "../PaymentsSectionNav";
import { PaymentLinksManager } from "./PaymentLinksManager";

export const metadata: Metadata = {
  title: "Payment Links"
};

export default async function OrgPaymentLinksPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const orgContext = await requireOrgPermission(orgSlug, "org.manage.read");

  if (!isOrgToolEnabled(orgContext.toolAvailability, "billing")) {
    return (
      <PageStack>
        <PageHeader description="Create and manage payment links for this organization." showBorder={false} title="Payments" />
        <PaymentsSectionNav active="links" />
        <ToolUnavailablePanel title="Payments" />
      </PageStack>
    );
  }

  const canManage = can(orgContext.membershipPermissions, "org.manage.read");
  const links = canManage ? await listOrgPaymentLinks({ orgId: orgContext.orgId }).catch(() => []) : [];

  return (
    <PageStack>
      <PageHeader description="Create shareable payment links for one-off charges and collections." showBorder={false} title="Payments" />
      <PaymentsSectionNav active="links" />

      {!canManage ? <Alert variant="warning">You do not have permission to manage payment links.</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Payment Links</CardTitle>
          <CardDescription>Create links admins can share to collect payment for ad hoc items.</CardDescription>
        </CardHeader>
        <CardContent>{canManage ? <PaymentLinksManager initialLinks={links} orgSlug={orgSlug} /> : null}</CardContent>
      </Card>
    </PageStack>
  );
}
