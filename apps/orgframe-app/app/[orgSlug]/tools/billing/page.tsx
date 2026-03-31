import { Alert } from "@orgframe/ui/primitives/alert";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { requireOrgPermission } from "@/src/shared/permissions/requireOrgPermission";
import { isOrgToolEnabled } from "@/src/shared/org/features";
import { ToolUnavailablePanel } from "../ToolUnavailablePanel";

export const metadata: Metadata = {
  title: "Billing"
};

export default async function OrgBillingSettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const orgContext = await requireOrgPermission(orgSlug, "org.manage.read");
  if (!isOrgToolEnabled(orgContext.toolAvailability, "billing")) {
    return (
      <PageStack>
        <PageHeader description="Review plan, invoice, and payment settings for this organization." showBorder={false} title="Billing" />
        <ToolUnavailablePanel title="Billing" />
      </PageStack>
    );
  }

  return (
    <PageStack>
      <PageHeader description="Review plan, invoice, and payment settings for this organization." showBorder={false} title="Billing" />

      <Card>
        <CardHeader>
          <CardTitle>Billing Configuration</CardTitle>
          <CardDescription>This section is intentionally minimal while core architecture is stabilized.</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="info">Billing UI is placeholder in this cleanup pass.</Alert>
        </CardContent>
      </Card>
    </PageStack>
  );
}
