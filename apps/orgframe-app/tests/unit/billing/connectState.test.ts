import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPayoutsReady, mapStripeAccountToConnectState } from "@/src/features/billing/service";

describe("billing connect status mapping", () => {
  it("marks account ready when charges/payouts are enabled and tax is acknowledged", () => {
    const mapped = mapStripeAccountToConnectState({
      account: {
        id: "acct_ready",
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        requirements: {
          currently_due: [],
          past_due: [],
          eventually_due: [],
          disabled_reason: null
        }
      } as any,
      taxAcknowledged: true
    });

    assert.equal(mapped.status, "ready");
    assert.equal(mapped.chargesEnabled, true);
    assert.equal(mapped.payoutsEnabled, true);
  });

  it("marks account restricted when tax is not acknowledged", () => {
    const mapped = mapStripeAccountToConnectState({
      account: {
        id: "acct_restricted",
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        requirements: {
          currently_due: [],
          past_due: [],
          eventually_due: [],
          disabled_reason: null
        }
      } as any,
      taxAcknowledged: false
    });

    assert.equal(mapped.status, "restricted");
  });

  it("computes payouts ready only for ready connected account and acknowledged tax", () => {
    assert.equal(
      isPayoutsReady({
        connectAccount: {
          id: "id",
          orgId: "org",
          provider: "stripe",
          connectAccountId: "acct",
          status: "ready",
          country: "US",
          defaultCurrency: "usd",
          chargesEnabled: true,
          payoutsEnabled: true,
          detailsSubmitted: true,
          requirementsCurrentlyDue: [],
          requirementsPastDue: [],
          requirementsEventuallyDue: [],
          requirementsDisabledReason: null,
          onboardingCompletedAt: null,
          lastSyncedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        },
        taxAcknowledged: true
      }),
      true
    );

    assert.equal(
      isPayoutsReady({
        connectAccount: null,
        taxAcknowledged: true
      }),
      false
    );
  });
});
