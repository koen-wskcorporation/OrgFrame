import type { SharePermission, ShareTarget } from "@/src/features/org-share/types";

export type SharingMetadata = {
  permission: SharePermission;
  targets: ShareTarget[];
  updatedAt: string;
};

export type BillingConnectStatus = "not_connected" | "onboarding" | "restricted" | "ready" | "disabled";

export type OrgPaymentAccount = {
  id: string;
  orgId: string;
  provider: "stripe";
  connectAccountId: string;
  status: BillingConnectStatus;
  country: string;
  defaultCurrency: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsCurrentlyDue: string[];
  requirementsPastDue: string[];
  requirementsEventuallyDue: string[];
  requirementsDisabledReason: string | null;
  onboardingCompletedAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrgPaymentTaxProfile = {
  id: string;
  orgId: string;
  taxClassification: "nonprofit" | "for_profit" | "government" | "other";
  legalBusinessName: string | null;
  einLast4: string | null;
  taxIdStatus: "uncollected" | "pending_verification" | "verified" | "unverified" | "not_required";
  nonprofitDeclared: boolean;
  businessAddress: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  taxResponsibilityAcknowledgedAt: string | null;
  taxResponsibilityAcknowledgedByUserId: string | null;
  updatedAt: string;
};

export type AccountPaymentMethod = {
  id: string;
  stripePaymentMethodId: string;
  methodType: string | null;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  billingName: string | null;
  status: "active" | "detached" | "deleted";
  isDefault: boolean;
  createdAt: string;
};

export type BillingWorkspaceData = {
  orgSlug: string;
  orgId: string;
  connectAccount: OrgPaymentAccount | null;
  taxProfile: OrgPaymentTaxProfile | null;
  taxAcknowledged: boolean;
  payoutsReady: boolean;
  canManage: boolean;
};

export type BillingActionResult<TData = undefined> =
  | {
      ok: true;
      data: TData;
    }
  | {
      ok: false;
      error: string;
    };

export type OrgPaymentTransaction = {
  id: string;
  orderId: string | null;
  sourcePaymentKey: string | null;
  sourceEventId: string | null;
  paymentStatus: string | null;
  paymentDate: string | null;
  paymentAmount: number | null;
  paidRegistrationFee: number | null;
  paidCcFee: number | null;
  payerUserId: string | null;
  registrationId: string | null;
  playerId: string | null;
  createdAt: string;
};

export type OrgPaymentLink = {
  id: string;
  orgId: string;
  slug: string;
  title: string;
  description: string | null;
  amountCents: number;
  currency: string;
  isActive: boolean;
  successMessage: string | null;
  metadataJson: Record<string, unknown> & {
    sharing?: SharingMetadata;
  };
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicPaymentLink = {
  id: string;
  orgId: string;
  slug: string;
  title: string;
  description: string | null;
  amountCents: number;
  currency: string;
  successMessage: string | null;
};
