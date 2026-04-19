"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";
import {
  createStripeEmbeddedAccountSessionClientSecret,
  createCheckoutSessionForAccountPaymentMethod,
  createStripeOnboardingLink,
  getOrCreateStripeConnectAccount,
  removeAccountPaymentMethod,
  resolvePortablePaymentMethod,
  setDefaultAccountPaymentMethod,
  syncStripeConnectAccount,
  upsertOrgTaxProfile,
  type OrgTaxProfileInput
} from "@/src/features/billing/service";
import type { BillingActionResult } from "@/src/features/billing/types";
import { rethrowIfNavigationError } from "@/src/shared/navigation/rethrowIfNavigationError";
import { requireOrgPermission } from "@/src/shared/permissions/requireOrgPermission";
import { requireOrgToolEnabled } from "@/src/shared/org/requireOrgToolEnabled";

const orgSlugSchema = z.object({
  orgSlug: z.string().trim().min(1)
});

const taxProfileSchema = z.object({
  orgSlug: z.string().trim().min(1),
  taxClassification: z.enum(["nonprofit", "for_profit", "government", "other"]),
  legalBusinessName: z.string().trim().max(240).optional(),
  einLast4: z
    .string()
    .trim()
    .regex(/^$|^[0-9]{4}$/)
    .optional(),
  taxIdStatus: z.enum(["uncollected", "pending_verification", "verified", "unverified", "not_required"]),
  nonprofitDeclared: z.boolean(),
  businessAddressLine1: z.string().trim().max(240).optional(),
  businessAddressLine2: z.string().trim().max(240).optional(),
  businessAddressCity: z.string().trim().max(120).optional(),
  businessAddressState: z.string().trim().max(80).optional(),
  businessAddressPostalCode: z.string().trim().max(32).optional(),
  businessAddressCountry: z.string().trim().max(2).optional(),
  acknowledgeTaxResponsibility: z.boolean()
});

const paymentMethodSchema = z.object({
  orgSlug: z.string().trim().min(1),
  paymentMethodId: z.string().uuid()
});

const portabilitySchema = z.object({
  orgSlug: z.string().trim().min(1),
  sourcePaymentMethodId: z.string().uuid()
});

function asError(error: string): BillingActionResult<never> {
  return {
    ok: false,
    error
  };
}

function normalizeOptional(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function mapTaxProfileInput(parsed: z.infer<typeof taxProfileSchema>): OrgTaxProfileInput {
  return {
    taxClassification: parsed.taxClassification,
    legalBusinessName: normalizeOptional(parsed.legalBusinessName),
    einLast4: normalizeOptional(parsed.einLast4),
    taxIdStatus: parsed.taxIdStatus,
    nonprofitDeclared: parsed.nonprofitDeclared,
    acknowledgeTaxResponsibility: parsed.acknowledgeTaxResponsibility,
    businessAddress: {
      line1: normalizeOptional(parsed.businessAddressLine1) ?? undefined,
      line2: normalizeOptional(parsed.businessAddressLine2) ?? undefined,
      city: normalizeOptional(parsed.businessAddressCity) ?? undefined,
      state: normalizeOptional(parsed.businessAddressState) ?? undefined,
      postalCode: normalizeOptional(parsed.businessAddressPostalCode) ?? undefined,
      country: normalizeOptional(parsed.businessAddressCountry)?.toUpperCase() ?? undefined
    }
  };
}

function revalidatePaymentPaths(orgSlug: string) {
  revalidatePath(`/${orgSlug}/tools/payments`);
  revalidatePath(`/${orgSlug}/tools/payments/settings`);
  revalidatePath(`/${orgSlug}/tools/payments`, "layout");
}

export async function startOrgStripeOnboardingAction(input: z.input<typeof orgSlugSchema>): Promise<BillingActionResult<{ url: string }>> {
  const parsed = orgSlugSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid billing request.");
  }

  try {
    const org = await requireOrgPermission(parsed.data.orgSlug, "org.manage.read");
    requireOrgToolEnabled(org.toolAvailability, "billing");

    const paymentAccount = await getOrCreateStripeConnectAccount({
      orgId: org.orgId,
      orgSlug: org.orgSlug,
      actorUserId: org.userId
    });

    const url = await createStripeOnboardingLink({
      orgSlug: org.orgSlug,
      connectAccountId: paymentAccount.connectAccountId
    });

    return {
      ok: true,
      data: {
        url
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to start Stripe onboarding right now.");
  }
}

export async function createOrgStripeEmbeddedAccountSessionAction(
  input: z.input<typeof orgSlugSchema>
): Promise<BillingActionResult<{ clientSecret: string }>> {
  const parsed = orgSlugSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid embedded onboarding request.");
  }

  try {
    const org = await requireOrgPermission(parsed.data.orgSlug, "org.manage.read");
    requireOrgToolEnabled(org.toolAvailability, "billing");

    const paymentAccount = await getOrCreateStripeConnectAccount({
      orgId: org.orgId,
      orgSlug: org.orgSlug,
      actorUserId: org.userId
    });

    const clientSecret = await createStripeEmbeddedAccountSessionClientSecret({
      connectAccountId: paymentAccount.connectAccountId
    });

    return {
      ok: true,
      data: {
        clientSecret
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to initialize embedded onboarding.");
  }
}

export async function refreshOrgStripeStatusAction(input: z.input<typeof orgSlugSchema>): Promise<BillingActionResult<{ status: string; payoutsReady: boolean }>> {
  const parsed = orgSlugSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid billing status request.");
  }

  try {
    const org = await requireOrgPermission(parsed.data.orgSlug, "org.manage.read");
    requireOrgToolEnabled(org.toolAvailability, "billing");

    const paymentAccount = await getOrCreateStripeConnectAccount({
      orgId: org.orgId,
      orgSlug: org.orgSlug,
      actorUserId: org.userId
    });

    const synced = await syncStripeConnectAccount({
      orgId: org.orgId,
      connectAccountId: paymentAccount.connectAccountId
    });

    revalidatePaymentPaths(org.orgSlug);

    return {
      ok: true,
      data: {
        status: synced.connectAccount.status,
        payoutsReady: synced.payoutsReady
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to refresh Stripe status right now.");
  }
}

export async function saveOrgTaxProfileAction(input: z.input<typeof taxProfileSchema>): Promise<BillingActionResult<{ acknowledged: boolean }>> {
  const parsed = taxProfileSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid tax profile input.");
  }

  try {
    const org = await requireOrgPermission(parsed.data.orgSlug, "org.manage.read");
    requireOrgToolEnabled(org.toolAvailability, "billing");

    const profile = await upsertOrgTaxProfile({
      orgId: org.orgId,
      actorUserId: org.userId,
      values: mapTaxProfileInput(parsed.data)
    });

    revalidatePaymentPaths(org.orgSlug);

    return {
      ok: true,
      data: {
        acknowledged: Boolean(profile.taxResponsibilityAcknowledgedAt)
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to save tax profile right now.");
  }
}

export async function createAccountPaymentMethodCheckoutAction(input: z.input<typeof orgSlugSchema>): Promise<BillingActionResult<{ url: string }>> {
  const parsed = orgSlugSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid add payment method request.");
  }

  try {
    const org = await requireOrgPermission(parsed.data.orgSlug, "org.manage.read");
    requireOrgToolEnabled(org.toolAvailability, "billing");

    const user = await getSessionUser();
    if (!user) {
      return asError("You must be signed in to add payment methods.");
    }

    const url = await createCheckoutSessionForAccountPaymentMethod({
      user,
      successPath: `/${org.orgSlug}/tools/payments/settings?pm_added=1`,
      cancelPath: `/${org.orgSlug}/tools/payments/settings?pm_cancelled=1`,
      orgSlugForMetadata: org.orgSlug
    });

    return {
      ok: true,
      data: {
        url
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to start payment method setup.");
  }
}

export async function removeAccountPaymentMethodAction(input: z.input<typeof paymentMethodSchema>): Promise<BillingActionResult<{ removed: boolean }>> {
  const parsed = paymentMethodSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid remove payment method request.");
  }

  try {
    const org = await requireOrgPermission(parsed.data.orgSlug, "org.manage.read");
    requireOrgToolEnabled(org.toolAvailability, "billing");

    const user = await getSessionUser();
    if (!user) {
      return asError("You must be signed in to remove payment methods.");
    }

    await removeAccountPaymentMethod({
      userId: user.id,
      paymentMethodId: parsed.data.paymentMethodId
    });

    revalidatePaymentPaths(org.orgSlug);

    return {
      ok: true,
      data: {
        removed: true
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to remove payment method.");
  }
}

export async function setDefaultAccountPaymentMethodAction(input: z.input<typeof paymentMethodSchema>): Promise<BillingActionResult<{ updated: boolean }>> {
  const parsed = paymentMethodSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid default payment method request.");
  }

  try {
    const org = await requireOrgPermission(parsed.data.orgSlug, "org.manage.read");
    requireOrgToolEnabled(org.toolAvailability, "billing");

    const user = await getSessionUser();
    if (!user) {
      return asError("You must be signed in to update payment methods.");
    }

    await setDefaultAccountPaymentMethod({
      userId: user.id,
      paymentMethodId: parsed.data.paymentMethodId
    });

    revalidatePaymentPaths(org.orgSlug);

    return {
      ok: true,
      data: {
        updated: true
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to update default payment method.");
  }
}

export async function resolvePortablePaymentMethodAction(
  input: z.input<typeof portabilitySchema>
): Promise<BillingActionResult<{ connectAccountId: string; connectedPaymentMethodId: string }>> {
  const parsed = portabilitySchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid payment portability request.");
  }

  try {
    const org = await requireOrgPermission(parsed.data.orgSlug, "org.manage.read");
    requireOrgToolEnabled(org.toolAvailability, "billing");

    const user = await getSessionUser();
    if (!user) {
      return asError("You must be signed in to resolve payment methods.");
    }

    const resolution = await resolvePortablePaymentMethod({
      userId: user.id,
      orgId: org.orgId,
      sourcePaymentMethodId: parsed.data.sourcePaymentMethodId
    });

    return {
      ok: true,
      data: resolution
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to resolve payment method portability.");
  }
}
