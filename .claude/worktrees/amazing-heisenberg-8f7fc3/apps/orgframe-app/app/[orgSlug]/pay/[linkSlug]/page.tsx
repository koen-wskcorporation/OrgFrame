import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { createCheckoutSessionForPublicPaymentLink, getPublicPaymentLink } from "@/src/features/billing/service";
import { getOrgRequestContext } from "@/src/shared/org/getOrgRequestContext";
import { rethrowIfNavigationError } from "@/src/shared/navigation/rethrowIfNavigationError";

export const metadata: Metadata = {
  title: "Pay"
};

function formatCurrency(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase()
  }).format(amountCents / 100);
}

export default async function PublicPaymentLinkPage({
  params,
  searchParams
}: {
  params: Promise<{ orgSlug: string; linkSlug: string }>;
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const { orgSlug, linkSlug } = await params;
  const query = await searchParams;
  const orgContext = await getOrgRequestContext(orgSlug);
  const orgId = orgContext.org.orgId;
  const link = await getPublicPaymentLink({
    orgId,
    linkSlug
  });

  if (!link) {
    notFound();
  }

  async function startCheckout(formData: FormData) {
    "use server";

    try {
      const customerEmail = String(formData.get("email") ?? "").trim();
      const checkoutUrl = await createCheckoutSessionForPublicPaymentLink({
        orgId,
        orgSlug,
        linkSlug,
        customerEmail: customerEmail || null
      });

      redirect(checkoutUrl);
    } catch (error) {
      rethrowIfNavigationError(error);
      const message = error instanceof Error ? error.message : "Unable to initialize payment.";
      redirect(`/${orgSlug}/pay/${linkSlug}?error=${encodeURIComponent(message)}`);
    }
  }

  const status = query.status ?? "";
  const errorText = query.error ?? "";

  return (
    <PageStack className="mx-auto max-w-2xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>{link.title}</CardTitle>
          <CardDescription>{link.description ?? `Payment for ${orgContext.org.orgName}`}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "success" ? (
            <Alert variant="success">{link.successMessage ?? "Payment received successfully. Thank you."}</Alert>
          ) : null}

          {status === "cancelled" ? <Alert variant="warning">Payment was cancelled. You can try again any time.</Alert> : null}

          {errorText ? <Alert variant="destructive">{errorText}</Alert> : null}

          <div className="rounded-control border bg-surface-muted p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Amount due</p>
            <p className="text-2xl font-semibold text-text">{formatCurrency(link.amountCents, link.currency)}</p>
          </div>

          <form action={startCheckout} className="space-y-3">
            <FormField hint="Optional. Used for Stripe receipt delivery." label="Email">
              <Input name="email" type="email" />
            </FormField>
            <Button type="submit">Continue to secure payment</Button>
          </form>
        </CardContent>
      </Card>
    </PageStack>
  );
}
