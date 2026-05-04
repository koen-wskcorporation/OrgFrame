"use client";

import { useMemo, useState, useTransition } from "react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { Checkbox } from "@orgframe/ui/primitives/checkbox";
import { Chip } from "@orgframe/ui/primitives/chip";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { Popup } from "@orgframe/ui/primitives/popup";
import { Select } from "@orgframe/ui/primitives/select";
import { useToast } from "@orgframe/ui/primitives/toast";
import type { BillingWorkspaceData } from "@/src/features/billing/types";
import { refreshOrgStripeStatusAction, saveOrgTaxProfileAction, startOrgStripeOnboardingAction } from "./actions";
import { StripeEmbeddedOnboardingCard } from "./StripeEmbeddedOnboardingCard";

type TaxFormState = {
  taxClassification: "nonprofit" | "for_profit" | "government" | "other";
  legalBusinessName: string;
  einLast4: string;
  taxIdStatus: "uncollected" | "pending_verification" | "verified" | "unverified" | "not_required";
  nonprofitDeclared: boolean;
  businessAddressLine1: string;
  businessAddressLine2: string;
  businessAddressCity: string;
  businessAddressState: string;
  businessAddressPostalCode: string;
  businessAddressCountry: string;
  acknowledgeTaxResponsibility: boolean;
};

type ConnectStatus = NonNullable<BillingWorkspaceData["connectAccount"]>["status"] | null;

function toTaxFormState(data: BillingWorkspaceData): TaxFormState {
  return {
    taxClassification: data.taxProfile?.taxClassification ?? "nonprofit",
    legalBusinessName: data.taxProfile?.legalBusinessName ?? "",
    einLast4: data.taxProfile?.einLast4 ?? "",
    taxIdStatus: data.taxProfile?.taxIdStatus ?? "uncollected",
    nonprofitDeclared: data.taxProfile?.nonprofitDeclared ?? true,
    businessAddressLine1: data.taxProfile?.businessAddress.line1 ?? "",
    businessAddressLine2: data.taxProfile?.businessAddress.line2 ?? "",
    businessAddressCity: data.taxProfile?.businessAddress.city ?? "",
    businessAddressState: data.taxProfile?.businessAddress.state ?? "",
    businessAddressPostalCode: data.taxProfile?.businessAddress.postalCode ?? "",
    businessAddressCountry: data.taxProfile?.businessAddress.country ?? "US",
    acknowledgeTaxResponsibility: Boolean(data.taxProfile?.taxResponsibilityAcknowledgedAt)
  };
}

function connectStatusChip(status: ConnectStatus) {
  if (status === "ready") {
    return <Chip color="green" size="compact">Ready</Chip>;
  }

  if (status === "restricted") {
    return <Chip color="yellow" size="compact">Restricted</Chip>;
  }

  if (status === "disabled") {
    return <Chip color="red" size="compact">Disabled</Chip>;
  }

  if (status === "onboarding") {
    return <Chip color="yellow" size="compact">Onboarding</Chip>;
  }

  return <Chip color="neutral" size="compact">Not connected</Chip>;
}

export function BillingWorkspace({ data }: { data: BillingWorkspaceData }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [taxForm, setTaxForm] = useState<TaxFormState>(() => toTaxFormState(data));
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  const hasRequirementsDue = useMemo(
    () => (data.connectAccount?.requirementsCurrentlyDue.length ?? 0) > 0,
    [data.connectAccount?.requirementsCurrentlyDue.length]
  );

  function runAsyncAction(action: () => Promise<void>) {
    startTransition(() => {
      void action();
    });
  }

  function handleOpenOnboarding() {
    runAsyncAction(async () => {
      const result = await startOrgStripeOnboardingAction({ orgSlug: data.orgSlug });
      if (!result.ok) {
        toast({ title: "Unable to initialize onboarding", description: result.error, variant: "destructive" });
        return;
      }

      setOnboardingOpen(true);
    });
  }

  function handleRefreshStatus() {
    runAsyncAction(async () => {
      const result = await refreshOrgStripeStatusAction({ orgSlug: data.orgSlug });
      if (!result.ok) {
        toast({ title: "Unable to refresh status", description: result.error, variant: "destructive" });
        return;
      }

      toast({
        title: "Stripe status refreshed",
        description: `Connect status: ${result.data.status}`,
        variant: "success"
      });

      window.location.reload();
    });
  }

  function handleSaveTaxProfile() {
    runAsyncAction(async () => {
      const result = await saveOrgTaxProfileAction({
        orgSlug: data.orgSlug,
        ...taxForm
      });

      if (!result.ok) {
        toast({ title: "Unable to save tax profile", description: result.error, variant: "destructive" });
        return;
      }

      toast({
        title: "Tax profile updated",
        description: result.data.acknowledged ? "Tax responsibility acknowledgment captured." : "Tax profile saved.",
        variant: "success"
      });

      window.location.reload();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Stripe Connect
            {connectStatusChip(data.connectAccount?.status ?? null)}
          </CardTitle>
          <CardDescription>Each organization connects its own Stripe account and receives funds directly.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.connectAccount ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="ui-muted-block">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Connected account</p>
                <p className="text-sm text-text font-mono">{data.connectAccount.connectAccountId}</p>
              </div>
              <div className="ui-muted-block">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Charges enabled</p>
                <p className="text-sm text-text">{data.connectAccount.chargesEnabled ? "Yes" : "No"}</p>
              </div>
              <div className="ui-muted-block">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Payouts enabled</p>
                <p className="text-sm text-text">{data.connectAccount.payoutsEnabled ? "Yes" : "No"}</p>
              </div>
            </div>
          ) : (
            <Alert variant="info">No connected Stripe account yet.</Alert>
          )}

          {hasRequirementsDue ? (
            <Alert variant="warning">
              Stripe still requires additional onboarding details before payouts can be fully enabled.
            </Alert>
          ) : null}

          {!data.taxAcknowledged ? (
            <Alert variant="warning">Tax responsibility acknowledgement is required before this org can become payout-ready.</Alert>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button disabled={isPending || !data.canManage} onClick={handleOpenOnboarding}>
              {data.connectAccount ? "Continue onboarding" : "Start onboarding"}
            </Button>
            <Button disabled={isPending || !data.canManage} onClick={handleRefreshStatus} variant="secondary">
              Refresh status
            </Button>
          </div>
        </CardContent>
      </Card>

      <Popup
        closeOnBackdrop={false}
        footer={
          <Button onClick={() => setOnboardingOpen(false)} variant="ghost">
            Close
          </Button>
        }
        onClose={() => setOnboardingOpen(false)}
        open={onboardingOpen}
        size="xl"
        subtitle="Complete required Stripe steps for this organization."
        title="Stripe Onboarding"
      >
        <StripeEmbeddedOnboardingCard canManage={data.canManage} orgSlug={data.orgSlug} />
      </Popup>

      <Card>
        <CardHeader>
          <CardTitle>Tax Compliance Defaults</CardTitle>
          <CardDescription>
            By default, each organization is responsible for collecting and remitting applicable transaction taxes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert variant="info">
            Nonprofit status does not automatically exempt transactions from sales tax. Tax obligations vary by jurisdiction.
          </Alert>

          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Tax classification">
              <Select
                onChange={(event) => setTaxForm((current) => ({ ...current, taxClassification: event.target.value as TaxFormState["taxClassification"] }))}
                options={[
                  { label: "Nonprofit", value: "nonprofit" },
                  { label: "For-profit", value: "for_profit" },
                  { label: "Government", value: "government" },
                  { label: "Other", value: "other" }
                ]}
                value={taxForm.taxClassification}
              />
            </FormField>

            <FormField label="Tax ID verification status">
              <Select
                onChange={(event) => setTaxForm((current) => ({ ...current, taxIdStatus: event.target.value as TaxFormState["taxIdStatus"] }))}
                options={[
                  { label: "Uncollected", value: "uncollected" },
                  { label: "Pending verification", value: "pending_verification" },
                  { label: "Verified", value: "verified" },
                  { label: "Unverified", value: "unverified" },
                  { label: "Not required", value: "not_required" }
                ]}
                value={taxForm.taxIdStatus}
              />
            </FormField>

            <FormField label="Legal business name">
              <Input
                onChange={(event) => setTaxForm((current) => ({ ...current, legalBusinessName: event.target.value }))}
                value={taxForm.legalBusinessName}
              />
            </FormField>

            <FormField hint="Store only the last four digits." label="EIN (last 4)">
              <Input
                maxLength={4}
                onChange={(event) => setTaxForm((current) => ({ ...current, einLast4: event.target.value.replace(/[^0-9]/g, "") }))}
                value={taxForm.einLast4}
              />
            </FormField>

            <FormField label="Address line 1">
              <Input
                onChange={(event) => setTaxForm((current) => ({ ...current, businessAddressLine1: event.target.value }))}
                value={taxForm.businessAddressLine1}
              />
            </FormField>

            <FormField label="Address line 2">
              <Input
                onChange={(event) => setTaxForm((current) => ({ ...current, businessAddressLine2: event.target.value }))}
                value={taxForm.businessAddressLine2}
              />
            </FormField>

            <FormField label="City">
              <Input
                onChange={(event) => setTaxForm((current) => ({ ...current, businessAddressCity: event.target.value }))}
                value={taxForm.businessAddressCity}
              />
            </FormField>

            <FormField label="State">
              <Input
                onChange={(event) => setTaxForm((current) => ({ ...current, businessAddressState: event.target.value }))}
                value={taxForm.businessAddressState}
              />
            </FormField>

            <FormField label="Postal code">
              <Input
                onChange={(event) => setTaxForm((current) => ({ ...current, businessAddressPostalCode: event.target.value }))}
                value={taxForm.businessAddressPostalCode}
              />
            </FormField>

            <FormField hint="US only for v1." label="Country">
              <Input
                maxLength={2}
                onChange={(event) => setTaxForm((current) => ({ ...current, businessAddressCountry: event.target.value.toUpperCase() }))}
                value={taxForm.businessAddressCountry}
              />
            </FormField>
          </div>

          <label className="flex items-center gap-2 text-sm text-text">
            <Checkbox
              checked={taxForm.nonprofitDeclared}
              onCheckedChange={(checked) => setTaxForm((current) => ({ ...current, nonprofitDeclared: checked }))}
            />
            This organization has represented itself as a nonprofit.
          </label>

          <label className="flex items-start gap-2 text-sm text-text">
            <Checkbox
              checked={taxForm.acknowledgeTaxResponsibility}
              onCheckedChange={(checked) => setTaxForm((current) => ({ ...current, acknowledgeTaxResponsibility: checked }))}
            />
            <span>
              We acknowledge that this organization is responsible for determining, collecting, and remitting applicable taxes for transactions processed through its connected account.
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={isPending || !data.canManage} onClick={handleSaveTaxProfile} variant="secondary">
              Save tax profile
            </Button>
            {data.taxAcknowledged ? <Chip color="green" size="compact">Tax responsibility acknowledged</Chip> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
