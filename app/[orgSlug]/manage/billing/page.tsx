import { Alert } from "@/components/ui/alert";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Billing"
};

export default function OrgBillingSettingsPage() {
  return (
    <>
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
    </>
  );
}
