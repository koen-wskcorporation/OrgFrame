import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/src/shared/data-api/server";
import {
  constructStripeEvent,
  markStripeWebhookEventFailed,
  markStripeWebhookEventProcessed,
  recordStripeWebhookEvent,
  syncAccountPaymentMethodFromSetupIntent,
  syncAccountPaymentMethodFromStripeCustomer,
  syncPaymentLinkCheckoutSession,
  syncStripeConnectAccount
} from "@/src/features/billing/service";

export const runtime = "nodejs";

async function findOrgIdByConnectAccountId(connectAccountId: string): Promise<string | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .schema("commerce").from("org_payment_accounts")
    .select("org_id")
    .eq("connect_account_id", connectAccountId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load org payment account by connect id: ${error.message}`);
  }

  return data?.org_id ?? null;
}

export async function POST(request: Request) {
  let webhookRowId: string | undefined;

  try {
    const rawBody = await request.text();
    const signature = request.headers.get("stripe-signature") ?? "";

    if (!signature) {
      return NextResponse.json({ ok: false, error: "missing_signature" }, { status: 400 });
    }

    const event = constructStripeEvent(rawBody, signature);

    const eventRecord = await recordStripeWebhookEvent({
      eventId: event.id,
      eventType: event.type,
      payload: event
    });

    webhookRowId = eventRecord.webhookRowId;

    if (!eventRecord.shouldProcess) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    if (event.type === "account.updated") {
      const account = event.data.object;
      const connectAccountId = account.id;
      const orgIdFromMetadata = typeof account.metadata?.org_id === "string" ? account.metadata.org_id : null;
      const orgId = orgIdFromMetadata || (await findOrgIdByConnectAccountId(connectAccountId));

      if (orgId) {
        await syncStripeConnectAccount({
          orgId,
          connectAccountId
        });
      }
    }

    if (event.type === "capability.updated") {
      const capability = event.data.object;
      const connectAccountId = typeof capability.account === "string" ? capability.account : "";

      if (connectAccountId) {
        const orgId = await findOrgIdByConnectAccountId(connectAccountId);
        if (orgId) {
          await syncStripeConnectAccount({
            orgId,
            connectAccountId
          });
        }
      }
    }

    if (event.type === "setup_intent.succeeded") {
      const setupIntent = event.data.object;
      if (typeof setupIntent.id === "string") {
        await syncAccountPaymentMethodFromSetupIntent(setupIntent.id);
      }
    }

    if (event.type === "checkout.session.completed") {
      const checkoutSession = event.data.object;

      if (checkoutSession.mode === "setup" && typeof checkoutSession.setup_intent === "string") {
        await syncAccountPaymentMethodFromSetupIntent(checkoutSession.setup_intent);
      }

      if (checkoutSession.mode === "payment") {
        const metadata = checkoutSession.metadata ?? {};
        const paymentLinkId = typeof metadata.payment_link_id === "string" ? metadata.payment_link_id : null;
        const orgIdFromMetadata = typeof metadata.org_id === "string" ? metadata.org_id : null;
        const connectAccountId = typeof event.account === "string" ? event.account : "";
        const resolvedOrgId = orgIdFromMetadata || (connectAccountId ? await findOrgIdByConnectAccountId(connectAccountId) : null);

        await syncPaymentLinkCheckoutSession({
          checkoutSessionId: checkoutSession.id,
          status: "complete",
          paymentIntentId: typeof checkoutSession.payment_intent === "string" ? checkoutSession.payment_intent : null,
          payerEmail: checkoutSession.customer_details?.email ?? checkoutSession.customer_email ?? null,
          amountTotalCents: typeof checkoutSession.amount_total === "number" ? checkoutSession.amount_total : null,
          currency: checkoutSession.currency ?? null,
          paymentLinkId,
          orgId: resolvedOrgId
        });
      }
    }

    if (event.type === "checkout.session.expired") {
      const checkoutSession = event.data.object;

      if (checkoutSession.mode === "payment") {
        const metadata = checkoutSession.metadata ?? {};
        const paymentLinkId = typeof metadata.payment_link_id === "string" ? metadata.payment_link_id : null;
        const orgIdFromMetadata = typeof metadata.org_id === "string" ? metadata.org_id : null;
        const connectAccountId = typeof event.account === "string" ? event.account : "";
        const resolvedOrgId = orgIdFromMetadata || (connectAccountId ? await findOrgIdByConnectAccountId(connectAccountId) : null);

        await syncPaymentLinkCheckoutSession({
          checkoutSessionId: checkoutSession.id,
          status: "expired",
          paymentIntentId: typeof checkoutSession.payment_intent === "string" ? checkoutSession.payment_intent : null,
          payerEmail: checkoutSession.customer_details?.email ?? checkoutSession.customer_email ?? null,
          amountTotalCents: typeof checkoutSession.amount_total === "number" ? checkoutSession.amount_total : null,
          currency: checkoutSession.currency ?? null,
          paymentLinkId,
          orgId: resolvedOrgId
        });
      }
    }

    if (event.type === "payment_method.attached") {
      const paymentMethod = event.data.object;
      if (typeof paymentMethod.customer === "string") {
        await syncAccountPaymentMethodFromStripeCustomer({
          stripeCustomerId: paymentMethod.customer,
          stripePaymentMethodId: paymentMethod.id
        });
      }
    }

    await markStripeWebhookEventProcessed({ webhookRowId });

    return NextResponse.json({ ok: true });
  } catch (error) {
    await markStripeWebhookEventFailed({
      webhookRowId,
      error: error instanceof Error ? error.message : "webhook_failed"
    });

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "webhook_failed"
      },
      { status: 500 }
    );
  }
}
