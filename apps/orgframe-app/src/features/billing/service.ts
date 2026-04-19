import { randomBytes } from "crypto";
import Stripe from "stripe";
import { createOptionalSupabaseServiceRoleClient, createSupabaseServer } from "@/src/shared/data-api/server";
import type { SessionUser } from "@/src/features/core/auth/server/getSessionUser";
import type {
  AccountPaymentMethod,
  BillingConnectStatus,
  PublicPaymentLink,
  OrgPaymentLink,
  BillingWorkspaceData,
  OrgPaymentAccount,
  OrgPaymentTaxProfile,
  OrgPaymentTransaction
} from "@/src/features/billing/types";

type OrgPaymentAccountRow = {
  id: string;
  org_id: string;
  provider: "stripe";
  connect_account_id: string;
  status: BillingConnectStatus;
  country: string;
  default_currency: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements_currently_due_json: unknown;
  requirements_past_due_json: unknown;
  requirements_eventually_due_json: unknown;
  requirements_disabled_reason: string | null;
  onboarding_completed_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

type OrgPaymentTaxProfileRow = {
  id: string;
  org_id: string;
  tax_classification: "nonprofit" | "for_profit" | "government" | "other";
  legal_business_name: string | null;
  ein_last4: string | null;
  tax_id_status: "uncollected" | "pending_verification" | "verified" | "unverified" | "not_required";
  nonprofit_declared: boolean;
  business_address_json: unknown;
  tax_responsibility_acknowledged_at: string | null;
  tax_responsibility_acknowledged_by_user_id: string | null;
  updated_at: string;
};

type AccountPaymentMethodRow = {
  id: string;
  stripe_payment_method_id: string;
  method_type: string | null;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  billing_name: string | null;
  status: "active" | "detached" | "deleted";
  is_default: boolean;
  created_at: string;
};

type AccountPaymentProfileRow = {
  id: string;
  user_id: string;
  stripe_customer_id: string;
};

type OrgPaymentTransactionRow = {
  id: string;
  order_id: string | null;
  source_payment_key: string | null;
  source_event_id: string | null;
  payment_status: string | null;
  payment_date: string | null;
  payment_amount: number | string | null;
  paid_registration_fee: number | string | null;
  paid_cc_fee: number | string | null;
  payer_user_id: string | null;
  registration_id: string | null;
  player_id: string | null;
  created_at: string;
};

type OrgPaymentLinkRow = {
  id: string;
  org_id: string;
  slug: string;
  title: string;
  description: string | null;
  amount_cents: number;
  currency: string;
  is_active: boolean;
  success_message: string | null;
  metadata_json: unknown;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type PaymentLinkPaymentRow = {
  id: string;
  stripe_checkout_session_id: string;
  stripe_payment_intent_id: string | null;
  status: "open" | "complete" | "expired" | "failed";
  amount_total_cents: number | null;
  currency: string | null;
  paid_at: string | null;
  created_at: string;
};

export type OrgTaxProfileInput = {
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
  acknowledgeTaxResponsibility: boolean;
};

export type SyncStripeAccountResult = {
  connectAccount: OrgPaymentAccount;
  taxAcknowledged: boolean;
  payoutsReady: boolean;
};

let stripeClient: Stripe | null = null;

async function getBillingSupabaseClient() {
  return createOptionalSupabaseServiceRoleClient() ?? (await createSupabaseServer());
}

function getStripeSecretKey() {
  return (process.env.STRIPE_SECRET_KEY ?? "").trim();
}

function getSiteOrigin() {
  const value = (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? "").trim();
  if (!value) {
    throw new Error("SITE_URL_NOT_CONFIGURED");
  }

  return value.replace(/\/$/, "");
}

function getStripeClient() {
  if (stripeClient) {
    return stripeClient;
  }

  const secretKey = getStripeSecretKey();
  if (!secretKey) {
    throw new Error("STRIPE_NOT_CONFIGURED");
  }

  stripeClient = new Stripe(secretKey);
  return stripeClient;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function asAddress(value: unknown): OrgPaymentTaxProfile["businessAddress"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const candidate = value as Record<string, unknown>;
  const next: OrgPaymentTaxProfile["businessAddress"] = {};

  if (typeof candidate.line1 === "string") next.line1 = candidate.line1;
  if (typeof candidate.line2 === "string") next.line2 = candidate.line2;
  if (typeof candidate.city === "string") next.city = candidate.city;
  if (typeof candidate.state === "string") next.state = candidate.state;
  if (typeof candidate.postalCode === "string") next.postalCode = candidate.postalCode;
  if (typeof candidate.postal_code === "string" && !next.postalCode) next.postalCode = candidate.postal_code;
  if (typeof candidate.country === "string") next.country = candidate.country;

  return next;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function mapOrgPaymentAccount(row: OrgPaymentAccountRow): OrgPaymentAccount {
  return {
    id: row.id,
    orgId: row.org_id,
    provider: row.provider,
    connectAccountId: row.connect_account_id,
    status: row.status,
    country: row.country,
    defaultCurrency: row.default_currency,
    chargesEnabled: row.charges_enabled,
    payoutsEnabled: row.payouts_enabled,
    detailsSubmitted: row.details_submitted,
    requirementsCurrentlyDue: asStringArray(row.requirements_currently_due_json),
    requirementsPastDue: asStringArray(row.requirements_past_due_json),
    requirementsEventuallyDue: asStringArray(row.requirements_eventually_due_json),
    requirementsDisabledReason: row.requirements_disabled_reason,
    onboardingCompletedAt: row.onboarding_completed_at,
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTaxProfile(row: OrgPaymentTaxProfileRow): OrgPaymentTaxProfile {
  return {
    id: row.id,
    orgId: row.org_id,
    taxClassification: row.tax_classification,
    legalBusinessName: row.legal_business_name,
    einLast4: row.ein_last4,
    taxIdStatus: row.tax_id_status,
    nonprofitDeclared: row.nonprofit_declared,
    businessAddress: asAddress(row.business_address_json),
    taxResponsibilityAcknowledgedAt: row.tax_responsibility_acknowledged_at,
    taxResponsibilityAcknowledgedByUserId: row.tax_responsibility_acknowledged_by_user_id,
    updatedAt: row.updated_at
  };
}

function mapPaymentMethod(row: AccountPaymentMethodRow): AccountPaymentMethod {
  return {
    id: row.id,
    stripePaymentMethodId: row.stripe_payment_method_id,
    methodType: row.method_type,
    brand: row.brand,
    last4: row.last4,
    expMonth: row.exp_month,
    expYear: row.exp_year,
    billingName: row.billing_name,
    status: row.status,
    isDefault: row.is_default,
    createdAt: row.created_at
  };
}

function asMoney(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function mapPaymentTransaction(row: OrgPaymentTransactionRow): OrgPaymentTransaction {
  return {
    id: row.id,
    orderId: row.order_id,
    sourcePaymentKey: row.source_payment_key,
    sourceEventId: row.source_event_id,
    paymentStatus: row.payment_status,
    paymentDate: row.payment_date,
    paymentAmount: asMoney(row.payment_amount),
    paidRegistrationFee: asMoney(row.paid_registration_fee),
    paidCcFee: asMoney(row.paid_cc_fee),
    payerUserId: row.payer_user_id,
    registrationId: row.registration_id,
    playerId: row.player_id,
    createdAt: row.created_at
  };
}

function mapPaymentLink(row: OrgPaymentLinkRow): OrgPaymentLink {
  return {
    id: row.id,
    orgId: row.org_id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    amountCents: row.amount_cents,
    currency: row.currency,
    isActive: row.is_active,
    successMessage: row.success_message,
    metadataJson: asObject(row.metadata_json),
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPaymentLinkPaymentToTransaction(row: PaymentLinkPaymentRow): OrgPaymentTransaction {
  const currency = (row.currency ?? "usd").toLowerCase();
  const currencyDivisor = currency === "usd" ? 100 : 100;
  const amount = typeof row.amount_total_cents === "number" ? row.amount_total_cents / currencyDivisor : null;

  return {
    id: row.id,
    orderId: null,
    sourcePaymentKey: row.stripe_checkout_session_id,
    sourceEventId: row.stripe_payment_intent_id,
    paymentStatus: row.status,
    paymentDate: row.paid_at ?? row.created_at,
    paymentAmount: amount,
    paidRegistrationFee: null,
    paidCcFee: null,
    payerUserId: null,
    registrationId: null,
    playerId: null,
    createdAt: row.created_at
  };
}

function resolveConnectStatus(input: {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  disabledReason: string | null;
  currentlyDue: string[];
  taxAcknowledged: boolean;
}): BillingConnectStatus {
  if (input.disabledReason) {
    return "disabled";
  }

  if (!input.detailsSubmitted) {
    return "onboarding";
  }

  if (input.currentlyDue.length > 0 || !input.chargesEnabled || !input.payoutsEnabled || !input.taxAcknowledged) {
    return "restricted";
  }

  return "ready";
}

export function mapStripeAccountToConnectState(input: {
  account: Stripe.Account;
  taxAcknowledged: boolean;
}): {
  status: BillingConnectStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsCurrentlyDue: string[];
  requirementsPastDue: string[];
  requirementsEventuallyDue: string[];
  requirementsDisabledReason: string | null;
  onboardingCompletedAt: string | null;
} {
  const requirementsCurrentlyDue = input.account.requirements?.currently_due ?? [];
  const requirementsPastDue = input.account.requirements?.past_due ?? [];
  const requirementsEventuallyDue = input.account.requirements?.eventually_due ?? [];
  const detailsSubmitted = Boolean(input.account.details_submitted);
  const chargesEnabled = Boolean(input.account.charges_enabled);
  const payoutsEnabled = Boolean(input.account.payouts_enabled);
  const requirementsDisabledReason = input.account.requirements?.disabled_reason ?? null;

  return {
    status: resolveConnectStatus({
      chargesEnabled,
      payoutsEnabled,
      detailsSubmitted,
      disabledReason: requirementsDisabledReason,
      currentlyDue: requirementsCurrentlyDue,
      taxAcknowledged: input.taxAcknowledged
    }),
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    requirementsCurrentlyDue,
    requirementsPastDue,
    requirementsEventuallyDue,
    requirementsDisabledReason,
    onboardingCompletedAt: detailsSubmitted ? new Date().toISOString() : null
  };
}

export function isPayoutsReady(input: {
  connectAccount: OrgPaymentAccount | null;
  taxAcknowledged: boolean;
}) {
  return Boolean(input.connectAccount && input.taxAcknowledged && input.connectAccount.chargesEnabled && input.connectAccount.payoutsEnabled && input.connectAccount.status === "ready");
}

export async function getBillingWorkspaceData(input: {
  orgSlug: string;
  orgId: string;
  canManage: boolean;
}): Promise<BillingWorkspaceData> {
  const supabase = await getBillingSupabaseClient();

  const [paymentAccountResult, taxProfileResult] = await Promise.all([
    supabase
      .schema("commerce").from("org_payment_accounts")
      .select(
        "id, org_id, provider, connect_account_id, status, country, default_currency, charges_enabled, payouts_enabled, details_submitted, requirements_currently_due_json, requirements_past_due_json, requirements_eventually_due_json, requirements_disabled_reason, onboarding_completed_at, last_synced_at, created_at, updated_at"
      )
      .eq("org_id", input.orgId)
      .maybeSingle(),
    supabase
      .schema("commerce").from("org_payment_tax_profiles")
      .select(
        "id, org_id, tax_classification, legal_business_name, ein_last4, tax_id_status, nonprofit_declared, business_address_json, tax_responsibility_acknowledged_at, tax_responsibility_acknowledged_by_user_id, updated_at"
      )
      .eq("org_id", input.orgId)
      .maybeSingle()
  ]);

  if (paymentAccountResult.error) {
    throw new Error(`Failed to load payment account: ${paymentAccountResult.error.message}`);
  }

  if (taxProfileResult.error) {
    throw new Error(`Failed to load tax profile: ${taxProfileResult.error.message}`);
  }

  const connectAccount = paymentAccountResult.data ? mapOrgPaymentAccount(paymentAccountResult.data as OrgPaymentAccountRow) : null;
  const taxProfile = taxProfileResult.data ? mapTaxProfile(taxProfileResult.data as OrgPaymentTaxProfileRow) : null;
  const taxAcknowledged = Boolean(taxProfile?.taxResponsibilityAcknowledgedAt);

  return {
    orgSlug: input.orgSlug,
    orgId: input.orgId,
    connectAccount,
    taxProfile,
    taxAcknowledged,
    payoutsReady: isPayoutsReady({ connectAccount, taxAcknowledged }),
    canManage: input.canManage
  };
}

export async function upsertOrgTaxProfile(input: {
  orgId: string;
  actorUserId: string;
  values: OrgTaxProfileInput;
}): Promise<OrgPaymentTaxProfile> {
  const supabase = await getBillingSupabaseClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .schema("commerce").from("org_payment_tax_profiles")
    .upsert(
      {
        org_id: input.orgId,
        tax_classification: input.values.taxClassification,
        legal_business_name: input.values.legalBusinessName,
        ein_last4: input.values.einLast4,
        tax_id_status: input.values.taxIdStatus,
        nonprofit_declared: input.values.nonprofitDeclared,
        business_address_json: input.values.businessAddress,
        tax_responsibility_acknowledged_at: input.values.acknowledgeTaxResponsibility ? now : null,
        tax_responsibility_acknowledged_by_user_id: input.values.acknowledgeTaxResponsibility ? input.actorUserId : null
      },
      { onConflict: "org_id" }
    )
    .select(
      "id, org_id, tax_classification, legal_business_name, ein_last4, tax_id_status, nonprofit_declared, business_address_json, tax_responsibility_acknowledged_at, tax_responsibility_acknowledged_by_user_id, updated_at"
    )
    .single();

  if (error || !data) {
    throw new Error(`Failed to save tax profile: ${error?.message ?? "Unknown error"}`);
  }

  return mapTaxProfile(data as OrgPaymentTaxProfileRow);
}

async function getOrgPaymentAccount(orgId: string): Promise<OrgPaymentAccount | null> {
  const supabase = await getBillingSupabaseClient();
  const { data, error } = await supabase
    .schema("commerce").from("org_payment_accounts")
    .select(
      "id, org_id, provider, connect_account_id, status, country, default_currency, charges_enabled, payouts_enabled, details_submitted, requirements_currently_due_json, requirements_past_due_json, requirements_eventually_due_json, requirements_disabled_reason, onboarding_completed_at, last_synced_at, created_at, updated_at"
    )
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load org payment account: ${error.message}`);
  }

  return data ? mapOrgPaymentAccount(data as OrgPaymentAccountRow) : null;
}

export async function getOrCreateStripeConnectAccount(input: {
  orgId: string;
  orgSlug: string;
  actorUserId: string;
}): Promise<OrgPaymentAccount> {
  const existing = await getOrgPaymentAccount(input.orgId);
  if (existing) {
    return existing;
  }

  const stripe = getStripeClient();
  const account = await stripe.accounts.create({
    type: "express",
    country: "US",
    default_currency: "usd",
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true }
    },
    business_type: "company",
    metadata: {
      org_id: input.orgId,
      org_slug: input.orgSlug
    }
  });

  const supabase = await getBillingSupabaseClient();
  const { data, error } = await supabase
    .schema("commerce").from("org_payment_accounts")
    .upsert(
      {
        org_id: input.orgId,
        provider: "stripe",
        connect_account_id: account.id,
        status: "onboarding",
        country: "US",
        default_currency: "usd",
        created_by_user_id: input.actorUserId,
        metadata_json: {
          created_via: "billing_tool"
        }
      },
      { onConflict: "org_id" }
    )
    .select(
      "id, org_id, provider, connect_account_id, status, country, default_currency, charges_enabled, payouts_enabled, details_submitted, requirements_currently_due_json, requirements_past_due_json, requirements_eventually_due_json, requirements_disabled_reason, onboarding_completed_at, last_synced_at, created_at, updated_at"
    )
    .single();

  if (error || !data) {
    throw new Error(`Failed to save org payment account: ${error?.message ?? "Unknown error"}`);
  }

  return mapOrgPaymentAccount(data as OrgPaymentAccountRow);
}

async function getTaxAcknowledged(orgId: string) {
  const supabase = await getBillingSupabaseClient();
  const { data, error } = await supabase
    .schema("commerce").from("org_payment_tax_profiles")
    .select("tax_responsibility_acknowledged_at")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load tax acknowledgement: ${error.message}`);
  }

  return Boolean(data?.tax_responsibility_acknowledged_at);
}

export async function syncStripeConnectAccount(input: {
  orgId: string;
  connectAccountId: string;
}): Promise<SyncStripeAccountResult> {
  const stripe = getStripeClient();
  const taxAcknowledged = await getTaxAcknowledged(input.orgId);
  const account = await stripe.accounts.retrieve(input.connectAccountId);
  const mapped = mapStripeAccountToConnectState({ account, taxAcknowledged });

  const supabase = await getBillingSupabaseClient();
  const { data, error } = await supabase
    .schema("commerce").from("org_payment_accounts")
    .update({
      status: mapped.status,
      charges_enabled: mapped.chargesEnabled,
      payouts_enabled: mapped.payoutsEnabled,
      details_submitted: mapped.detailsSubmitted,
      requirements_currently_due_json: mapped.requirementsCurrentlyDue,
      requirements_past_due_json: mapped.requirementsPastDue,
      requirements_eventually_due_json: mapped.requirementsEventuallyDue,
      requirements_disabled_reason: mapped.requirementsDisabledReason,
      onboarding_completed_at: mapped.onboardingCompletedAt,
      last_synced_at: new Date().toISOString(),
      metadata_json: {
        account_id: account.id,
        account_type: account.type,
        business_type: account.business_type,
        dashboard_display_name: account.settings?.dashboard?.display_name ?? null,
        statement_descriptor: account.settings?.payments?.statement_descriptor ?? null,
        external_accounts_url: account.external_accounts?.url ?? null
      }
    })
    .eq("org_id", input.orgId)
    .eq("connect_account_id", input.connectAccountId)
    .select(
      "id, org_id, provider, connect_account_id, status, country, default_currency, charges_enabled, payouts_enabled, details_submitted, requirements_currently_due_json, requirements_past_due_json, requirements_eventually_due_json, requirements_disabled_reason, onboarding_completed_at, last_synced_at, created_at, updated_at"
    )
    .single();

  if (error || !data) {
    throw new Error(`Failed to update connect account: ${error?.message ?? "Unknown error"}`);
  }

  const connectAccount = mapOrgPaymentAccount(data as OrgPaymentAccountRow);
  return {
    connectAccount,
    taxAcknowledged,
    payoutsReady: isPayoutsReady({
      connectAccount,
      taxAcknowledged
    })
  };
}

export async function createStripeOnboardingLink(input: {
  orgSlug: string;
  connectAccountId: string;
}): Promise<string> {
  const stripe = getStripeClient();
  const origin = getSiteOrigin();

  const link = await stripe.accountLinks.create({
    account: input.connectAccountId,
    type: "account_onboarding",
    refresh_url: `${origin}/${input.orgSlug}/manage/payments/settings?connect=refresh`,
    return_url: `${origin}/${input.orgSlug}/manage/payments/settings?connect=return`
  });

  return link.url;
}

export async function createStripeEmbeddedAccountSessionClientSecret(input: {
  connectAccountId: string;
}): Promise<string> {
  const stripe = getStripeClient();
  const session = await stripe.accountSessions.create({
    account: input.connectAccountId,
    components: {
      account_onboarding: {
        enabled: true,
        features: {
          external_account_collection: true
        }
      },
      notification_banner: {
        enabled: true
      }
    }
  });

  return session.client_secret;
}

async function getOrCreateAccountPaymentProfile(input: {
  user: SessionUser;
}): Promise<AccountPaymentProfileRow> {
  const supabase = await getBillingSupabaseClient();

  const { data: existing, error: existingError } = await supabase
    .schema("commerce").from("account_payment_profiles")
    .select("id, user_id, stripe_customer_id")
    .eq("user_id", input.user.id)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to load payment profile: ${existingError.message}`);
  }

  if (existing) {
    return existing as AccountPaymentProfileRow;
  }

  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    email: input.user.email ?? undefined,
    metadata: {
      account_user_id: input.user.id
    }
  });

  const { data, error } = await supabase
    .schema("commerce").from("account_payment_profiles")
    .insert({
      user_id: input.user.id,
      provider: "stripe",
      stripe_customer_id: customer.id,
      email: input.user.email ?? null,
      name: null
    })
    .select("id, user_id, stripe_customer_id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create payment profile: ${error?.message ?? "Unknown error"}`);
  }

  return data as AccountPaymentProfileRow;
}

function extractCardDetails(paymentMethod: Stripe.PaymentMethod) {
  return {
    methodType: paymentMethod.type ?? null,
    brand: paymentMethod.card?.brand ?? null,
    last4: paymentMethod.card?.last4 ?? paymentMethod.us_bank_account?.last4 ?? null,
    expMonth: paymentMethod.card?.exp_month ?? null,
    expYear: paymentMethod.card?.exp_year ?? null,
    billingName: paymentMethod.billing_details?.name ?? null,
    billingAddress: {
      line1: paymentMethod.billing_details?.address?.line1 ?? undefined,
      line2: paymentMethod.billing_details?.address?.line2 ?? undefined,
      city: paymentMethod.billing_details?.address?.city ?? undefined,
      state: paymentMethod.billing_details?.address?.state ?? undefined,
      postalCode: paymentMethod.billing_details?.address?.postal_code ?? undefined,
      country: paymentMethod.billing_details?.address?.country ?? undefined
    }
  };
}

async function ensureSingleDefaultMethod(input: {
  userId: string;
  paymentProfileId: string;
  preferredMethodId?: string;
}) {
  const supabase = await getBillingSupabaseClient();
  const { data, error } = await supabase
    .schema("commerce").from("account_payment_methods")
    .select("id")
    .eq("payment_profile_id", input.paymentProfileId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to resolve defaults: ${error.message}`);
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return;
  }

  const preferredId = input.preferredMethodId && rows.some((row) => row.id === input.preferredMethodId) ? input.preferredMethodId : rows[0].id;

  const { error: clearError } = await supabase
    .schema("commerce").from("account_payment_methods")
    .update({ is_default: false })
    .eq("payment_profile_id", input.paymentProfileId)
    .eq("user_id", input.userId)
    .eq("status", "active");

  if (clearError) {
    throw new Error(`Failed to clear default methods: ${clearError.message}`);
  }

  const { error: setError } = await supabase
    .schema("commerce").from("account_payment_methods")
    .update({ is_default: true })
    .eq("id", preferredId)
    .eq("user_id", input.userId);

  if (setError) {
    throw new Error(`Failed to set default method: ${setError.message}`);
  }
}

async function upsertAccountPaymentMethod(input: {
  paymentProfile: AccountPaymentProfileRow;
  userId: string;
  paymentMethod: Stripe.PaymentMethod;
  setDefault: boolean;
}) {
  const supabase = await getBillingSupabaseClient();
  const details = extractCardDetails(input.paymentMethod);

  const { data, error } = await supabase
    .schema("commerce").from("account_payment_methods")
    .upsert(
      {
        payment_profile_id: input.paymentProfile.id,
        user_id: input.userId,
        provider: "stripe",
        stripe_payment_method_id: input.paymentMethod.id,
        method_type: details.methodType,
        brand: details.brand,
        last4: details.last4,
        exp_month: details.expMonth,
        exp_year: details.expYear,
        billing_name: details.billingName,
        billing_address_json: details.billingAddress,
        status: "active",
        is_default: input.setDefault
      },
      {
        onConflict: "stripe_payment_method_id"
      }
    )
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to save payment method: ${error?.message ?? "Unknown error"}`);
  }

  await ensureSingleDefaultMethod({
    userId: input.userId,
    paymentProfileId: input.paymentProfile.id,
    preferredMethodId: input.setDefault ? data.id : undefined
  });
}

export async function createCheckoutSessionForAccountPaymentMethod(input: {
  user: SessionUser;
  successPath: string;
  cancelPath: string;
  orgSlugForMetadata?: string;
}): Promise<string> {
  const stripe = getStripeClient();
  const origin = getSiteOrigin();
  const paymentProfile = await getOrCreateAccountPaymentProfile({ user: input.user });

  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    payment_method_types: ["card"],
    customer: paymentProfile.stripe_customer_id,
    success_url: `${origin}${input.successPath.startsWith("/") ? input.successPath : `/${input.successPath}`}`,
    cancel_url: `${origin}${input.cancelPath.startsWith("/") ? input.cancelPath : `/${input.cancelPath}`}`,
    metadata: {
      org_slug: input.orgSlugForMetadata ?? "",
      account_user_id: input.user.id
    }
  });

  if (!session.url) {
    throw new Error("Failed to create setup checkout session URL.");
  }

  return session.url;
}

export async function listAccountPaymentMethods(userId: string): Promise<AccountPaymentMethod[]> {
  const supabase = await getBillingSupabaseClient();
  const { data, error } = await supabase
    .schema("commerce").from("account_payment_methods")
    .select("id, stripe_payment_method_id, method_type, brand, last4, exp_month, exp_year, billing_name, status, is_default, created_at")
    .eq("user_id", userId)
    .neq("status", "deleted")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load account payment methods: ${error.message}`);
  }

  return (data ?? []).map((row) => mapPaymentMethod(row as AccountPaymentMethodRow));
}

function createPaymentLinkSlug() {
  return randomBytes(6).toString("base64url").toLowerCase();
}

export async function listOrgPaymentLinks(input: { orgId: string }): Promise<OrgPaymentLink[]> {
  const supabase = await getBillingSupabaseClient();
  const { data, error } = await supabase
    .schema("commerce").from("payment_links")
    .select("id, org_id, slug, title, description, amount_cents, currency, is_active, success_message, metadata_json, created_by_user_id, created_at, updated_at")
    .eq("org_id", input.orgId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load payment links: ${error.message}`);
  }

  return (data ?? []).map((row) => mapPaymentLink(row as OrgPaymentLinkRow));
}

export async function createOrgPaymentLink(input: {
  orgId: string;
  actorUserId: string;
  title: string;
  description: string | null;
  amountCents: number;
  currency?: string;
  successMessage?: string | null;
}): Promise<OrgPaymentLink> {
  const supabase = await getBillingSupabaseClient();
  const currency = (input.currency ?? "usd").toLowerCase();

  let attempts = 0;
  while (attempts < 5) {
    attempts += 1;
    const slug = createPaymentLinkSlug();
    const { data, error } = await supabase
      .schema("commerce").from("payment_links")
      .insert({
        org_id: input.orgId,
        slug,
        title: input.title,
        description: input.description,
        amount_cents: input.amountCents,
        currency,
        is_active: true,
        success_message: input.successMessage ?? null,
        metadata_json: {},
        created_by_user_id: input.actorUserId
      })
      .select("id, org_id, slug, title, description, amount_cents, currency, is_active, success_message, metadata_json, created_by_user_id, created_at, updated_at")
      .single();

    if (!error && data) {
      return mapPaymentLink(data as OrgPaymentLinkRow);
    }

    if (!error || !(error.message.includes("payment_links_slug_key") || error.message.includes("duplicate key"))) {
      throw new Error(`Failed to create payment link: ${error?.message ?? "Unknown error"}`);
    }
  }

  throw new Error("Failed to generate unique payment link slug.");
}

export async function setOrgPaymentLinkActive(input: {
  orgId: string;
  linkId: string;
  isActive: boolean;
}): Promise<OrgPaymentLink> {
  const supabase = await getBillingSupabaseClient();
  const { data, error } = await supabase
    .schema("commerce").from("payment_links")
    .update({ is_active: input.isActive })
    .eq("org_id", input.orgId)
    .eq("id", input.linkId)
    .select("id, org_id, slug, title, description, amount_cents, currency, is_active, success_message, metadata_json, created_by_user_id, created_at, updated_at")
    .single();

  if (error || !data) {
    throw new Error(`Failed to update payment link: ${error?.message ?? "Unknown error"}`);
  }

  return mapPaymentLink(data as OrgPaymentLinkRow);
}

export async function setOrgPaymentLinkSharing(input: {
  orgId: string;
  linkId: string;
  sharing: OrgPaymentLink["metadataJson"]["sharing"];
}): Promise<OrgPaymentLink> {
  const supabase = await getBillingSupabaseClient();
  const { data: existing, error: existingError } = await supabase
    .schema("commerce").from("payment_links")
    .select("metadata_json")
    .eq("org_id", input.orgId)
    .eq("id", input.linkId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to load payment link metadata: ${existingError.message}`);
  }

  const nextMetadata = {
    ...asObject(existing?.metadata_json),
    sharing: input.sharing
  };

  const { data, error } = await supabase
    .schema("commerce").from("payment_links")
    .update({
      metadata_json: nextMetadata
    })
    .eq("org_id", input.orgId)
    .eq("id", input.linkId)
    .select("id, org_id, slug, title, description, amount_cents, currency, is_active, success_message, metadata_json, created_by_user_id, created_at, updated_at")
    .single();

  if (error || !data) {
    throw new Error(`Failed to update payment link sharing: ${error?.message ?? "Unknown error"}`);
  }

  return mapPaymentLink(data as OrgPaymentLinkRow);
}

export async function getPublicPaymentLink(input: {
  orgId: string;
  linkSlug: string;
}): Promise<PublicPaymentLink | null> {
  const supabase = await getBillingSupabaseClient();
  const { data, error } = await supabase
    .schema("commerce").from("payment_links")
    .select("id, org_id, slug, title, description, amount_cents, currency, success_message")
    .eq("org_id", input.orgId)
    .eq("slug", input.linkSlug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load payment link: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    orgId: data.org_id,
    slug: data.slug,
    title: data.title,
    description: data.description,
    amountCents: data.amount_cents,
    currency: data.currency,
    successMessage: data.success_message
  };
}

export async function createCheckoutSessionForPublicPaymentLink(input: {
  orgId: string;
  orgSlug: string;
  linkSlug: string;
  customerEmail?: string | null;
}): Promise<string> {
  const stripe = getStripeClient();
  const origin = getSiteOrigin();
  const supabase = await getBillingSupabaseClient();

  const [paymentLink, paymentAccount] = await Promise.all([
    getPublicPaymentLink({
      orgId: input.orgId,
      linkSlug: input.linkSlug
    }),
    getOrgPaymentAccount(input.orgId)
  ]);

  if (!paymentLink) {
    throw new Error("Payment link not found.");
  }

  if (!paymentAccount?.connectAccountId) {
    throw new Error("Organization has not connected Stripe.");
  }

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      submit_type: "pay",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: paymentLink.currency,
            unit_amount: paymentLink.amountCents,
            product_data: {
              name: paymentLink.title,
              description: paymentLink.description ?? undefined
            }
          }
        }
      ],
      success_url: `${origin}/${input.orgSlug}/pay/${paymentLink.slug}?status=success`,
      cancel_url: `${origin}/${input.orgSlug}/pay/${paymentLink.slug}?status=cancelled`,
      customer_email: input.customerEmail ?? undefined,
      metadata: {
        org_id: input.orgId,
        payment_link_id: paymentLink.id,
        payment_link_slug: paymentLink.slug
      },
      payment_intent_data: {
        metadata: {
          org_id: input.orgId,
          payment_link_id: paymentLink.id,
          payment_link_slug: paymentLink.slug
        }
      }
    },
    {
      stripeAccount: paymentAccount.connectAccountId
    }
  );

  if (!session.url) {
    throw new Error("Failed to create payment session URL.");
  }

  await supabase
    .schema("commerce").from("payment_link_payments")
    .upsert(
      {
        payment_link_id: paymentLink.id,
        org_id: input.orgId,
        stripe_checkout_session_id: session.id,
        status: "open",
        payer_email: input.customerEmail ?? null,
        amount_total_cents: paymentLink.amountCents,
        currency: paymentLink.currency
      },
      {
        onConflict: "stripe_checkout_session_id"
      }
    );

  return session.url;
}

export async function listOrgPaymentTransactions(input: { orgId: string; limit?: number }): Promise<OrgPaymentTransaction[]> {
  const supabase = await getBillingSupabaseClient();
  const limit = Math.max(1, Math.min(input.limit ?? 200, 1000));
  const [legacyPaymentsResult, linkPaymentsResult] = await Promise.all([
    supabase
      .schema("commerce").from("payments")
      .select(
        "id, order_id, source_payment_key, source_event_id, payment_status, payment_date, payment_amount, paid_registration_fee, paid_cc_fee, payer_user_id, registration_id, player_id, created_at"
      )
      .eq("org_id", input.orgId)
      .order("payment_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .schema("commerce").from("payment_link_payments")
      .select("id, stripe_checkout_session_id, stripe_payment_intent_id, status, amount_total_cents, currency, paid_at, created_at")
      .eq("org_id", input.orgId)
      .order("paid_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limit)
  ]);

  if (legacyPaymentsResult.error) {
    throw new Error(`Failed to load payment transactions: ${legacyPaymentsResult.error.message}`);
  }

  if (linkPaymentsResult.error) {
    throw new Error(`Failed to load payment link transactions: ${linkPaymentsResult.error.message}`);
  }

  const combined = [
    ...(legacyPaymentsResult.data ?? []).map((row) => mapPaymentTransaction(row as OrgPaymentTransactionRow)),
    ...(linkPaymentsResult.data ?? []).map((row) => mapPaymentLinkPaymentToTransaction(row as PaymentLinkPaymentRow))
  ];

  combined.sort((left, right) => {
    const leftDateRaw = Date.parse(left.paymentDate ?? left.createdAt);
    const rightDateRaw = Date.parse(right.paymentDate ?? right.createdAt);
    const leftDate = Number.isFinite(leftDateRaw) ? leftDateRaw : 0;
    const rightDate = Number.isFinite(rightDateRaw) ? rightDateRaw : 0;
    return rightDate - leftDate;
  });

  return combined.slice(0, limit);
}

export async function removeAccountPaymentMethod(input: {
  userId: string;
  paymentMethodId: string;
}) {
  const supabase = await getBillingSupabaseClient();
  const stripe = getStripeClient();

  const { data: methodRow, error: methodError } = await supabase
    .schema("commerce").from("account_payment_methods")
    .select("id, stripe_payment_method_id, payment_profile_id, is_default")
    .eq("id", input.paymentMethodId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (methodError) {
    throw new Error(`Failed to load payment method: ${methodError.message}`);
  }

  if (!methodRow) {
    throw new Error("Payment method not found.");
  }

  try {
    await stripe.paymentMethods.detach(methodRow.stripe_payment_method_id);
  } catch {
    // Ignore detach failures to allow local state cleanup.
  }

  const { error: updateError } = await supabase
    .schema("commerce").from("account_payment_methods")
    .update({
      status: "deleted",
      is_default: false
    })
    .eq("id", methodRow.id)
    .eq("user_id", input.userId);

  if (updateError) {
    throw new Error(`Failed to remove payment method: ${updateError.message}`);
  }

  await ensureSingleDefaultMethod({
    userId: input.userId,
    paymentProfileId: methodRow.payment_profile_id
  });
}

export async function setDefaultAccountPaymentMethod(input: {
  userId: string;
  paymentMethodId: string;
}) {
  const supabase = await getBillingSupabaseClient();
  const stripe = getStripeClient();

  const { data: methodRow, error: methodError } = await supabase
    .schema("commerce").from("account_payment_methods")
    .select("id, payment_profile_id, stripe_payment_method_id")
    .eq("id", input.paymentMethodId)
    .eq("user_id", input.userId)
    .eq("status", "active")
    .maybeSingle();

  if (methodError) {
    throw new Error(`Failed to load default payment method: ${methodError.message}`);
  }

  if (!methodRow) {
    throw new Error("Payment method not found.");
  }

  await ensureSingleDefaultMethod({
    userId: input.userId,
    paymentProfileId: methodRow.payment_profile_id,
    preferredMethodId: methodRow.id
  });

  const { data: profileRow, error: profileError } = await supabase
    .schema("commerce").from("account_payment_profiles")
    .select("stripe_customer_id")
    .eq("id", methodRow.payment_profile_id)
    .eq("user_id", input.userId)
    .single();

  if (profileError) {
    throw new Error(`Failed to load payment profile: ${profileError.message}`);
  }

  await stripe.customers.update(profileRow.stripe_customer_id, {
    invoice_settings: {
      default_payment_method: methodRow.stripe_payment_method_id
    }
  });
}

export async function resolvePortablePaymentMethod(input: {
  userId: string;
  orgId: string;
  sourcePaymentMethodId: string;
}): Promise<{ connectAccountId: string; connectedPaymentMethodId: string }> {
  const supabase = await getBillingSupabaseClient();
  const stripe = getStripeClient();

  const [{ data: sourceMethod, error: sourceError }, { data: orgPaymentAccount, error: accountError }, { data: paymentProfile, error: profileError }] = await Promise.all([
    supabase
      .schema("commerce").from("account_payment_methods")
      .select("id, stripe_payment_method_id")
      .eq("id", input.sourcePaymentMethodId)
      .eq("user_id", input.userId)
      .eq("status", "active")
      .single(),
    supabase
      .schema("commerce").from("org_payment_accounts")
      .select("connect_account_id")
      .eq("org_id", input.orgId)
      .single(),
    supabase
      .schema("commerce").from("account_payment_profiles")
      .select("id, stripe_customer_id")
      .eq("user_id", input.userId)
      .single()
  ]);

  if (sourceError || !sourceMethod) {
    throw new Error(`Unable to load source payment method: ${sourceError?.message ?? "Missing source payment method."}`);
  }

  if (accountError || !orgPaymentAccount) {
    throw new Error(`Unable to load organization payment account: ${accountError?.message ?? "Missing connected account."}`);
  }

  if (profileError || !paymentProfile) {
    throw new Error(`Unable to load account payment profile: ${profileError?.message ?? "Missing payment profile."}`);
  }

  const connectAccountId = orgPaymentAccount.connect_account_id;

  const { data: existingMap } = await supabase
    .schema("commerce").from("payment_method_portability_map")
    .select("id, connected_account_payment_method_id")
    .eq("org_id", input.orgId)
    .eq("source_stripe_payment_method_id", sourceMethod.stripe_payment_method_id)
    .eq("connect_account_id", connectAccountId)
    .eq("status", "active")
    .maybeSingle();

  if (existingMap) {
    try {
      await stripe.paymentMethods.retrieve(existingMap.connected_account_payment_method_id, {
        stripeAccount: connectAccountId
      });

      await supabase
        .schema("commerce").from("payment_method_portability_map")
        .update({ last_validated_at: new Date().toISOString() })
        .eq("id", existingMap.id);

      return {
        connectAccountId,
        connectedPaymentMethodId: existingMap.connected_account_payment_method_id
      };
    } catch {
      await supabase
        .schema("commerce").from("payment_method_portability_map")
        .update({ status: "invalid" })
        .eq("id", existingMap.id);
    }
  }

  const cloned = await stripe.paymentMethods.create(
    {
      customer: paymentProfile.stripe_customer_id,
      payment_method: sourceMethod.stripe_payment_method_id
    },
    {
      stripeAccount: connectAccountId
    }
  );

  const now = new Date().toISOString();
  await supabase
    .schema("commerce").from("payment_method_portability_map")
    .upsert(
      {
        user_id: input.userId,
        org_id: input.orgId,
        source_payment_method_id: sourceMethod.id,
        source_stripe_payment_method_id: sourceMethod.stripe_payment_method_id,
        connect_account_id: connectAccountId,
        connected_account_payment_method_id: cloned.id,
        status: "active",
        last_validated_at: now
      },
      {
        onConflict: "org_id,source_stripe_payment_method_id,connect_account_id"
      }
    );

  return {
    connectAccountId,
    connectedPaymentMethodId: cloned.id
  };
}

export async function recordStripeWebhookEvent(input: {
  eventId: string;
  eventType: string;
  payload: unknown;
}): Promise<{ shouldProcess: boolean; webhookRowId?: string }> {
  const supabase = await getBillingSupabaseClient();
  const { data: existing, error: existingError } = await supabase
    .schema("commerce").from("payment_webhook_events")
    .select("id")
    .eq("event_id", input.eventId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to check webhook event: ${existingError.message}`);
  }

  if (existing?.id) {
    return {
      shouldProcess: false,
      webhookRowId: existing.id
    };
  }

  const { data: inserted, error } = await supabase
    .schema("commerce").from("payment_webhook_events")
    .insert({
      provider: "stripe",
      event_id: input.eventId,
      event_type: input.eventType,
      payload_json: input.payload,
      status: "received"
    })
    .select("id")
    .single();

  if (error || !inserted) {
    throw new Error(`Failed to insert webhook event: ${error?.message ?? "Unknown error"}`);
  }

  return {
    shouldProcess: true,
    webhookRowId: inserted.id
  };
}

export async function markStripeWebhookEventProcessed(input: {
  webhookRowId?: string;
}) {
  if (!input.webhookRowId) {
    return;
  }

  const supabase = await getBillingSupabaseClient();
  await supabase
    .schema("commerce").from("payment_webhook_events")
    .update({
      status: "processed",
      processed_at: new Date().toISOString(),
      error_text: null
    })
    .eq("id", input.webhookRowId);
}

export async function markStripeWebhookEventFailed(input: {
  webhookRowId?: string;
  error: string;
}) {
  if (!input.webhookRowId) {
    return;
  }

  const supabase = await getBillingSupabaseClient();
  await supabase
    .schema("commerce").from("payment_webhook_events")
    .update({
      status: "failed",
      processed_at: new Date().toISOString(),
      error_text: input.error
    })
    .eq("id", input.webhookRowId);
}

export async function syncAccountPaymentMethodFromStripeCustomer(input: {
  stripeCustomerId: string;
  stripePaymentMethodId: string;
}): Promise<void> {
  const supabase = await getBillingSupabaseClient();
  const stripe = getStripeClient();

  const { data: profile, error: profileError } = await supabase
    .schema("commerce").from("account_payment_profiles")
    .select("id, user_id, stripe_customer_id")
    .eq("stripe_customer_id", input.stripeCustomerId)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Failed to load payment profile by customer: ${profileError.message}`);
  }

  if (!profile) {
    return;
  }

  const paymentMethod = await stripe.paymentMethods.retrieve(input.stripePaymentMethodId);

  if (!paymentMethod.customer || paymentMethod.customer !== profile.stripe_customer_id) {
    return;
  }

  const { data: existingMethods, error: existingMethodsError } = await supabase
    .schema("commerce").from("account_payment_methods")
    .select("id")
    .eq("payment_profile_id", profile.id)
    .eq("status", "active")
    .limit(1);

  if (existingMethodsError) {
    throw new Error(`Failed to load payment methods for defaulting: ${existingMethodsError.message}`);
  }

  await upsertAccountPaymentMethod({
    paymentProfile: profile as AccountPaymentProfileRow,
    userId: profile.user_id,
    paymentMethod,
    setDefault: (existingMethods ?? []).length === 0
  });
}

export async function syncAccountPaymentMethodFromSetupIntent(setupIntentId: string): Promise<void> {
  const stripe = getStripeClient();
  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);

  if (typeof setupIntent.customer !== "string" || typeof setupIntent.payment_method !== "string") {
    return;
  }

  await syncAccountPaymentMethodFromStripeCustomer({
    stripeCustomerId: setupIntent.customer,
    stripePaymentMethodId: setupIntent.payment_method
  });
}

export async function syncPaymentLinkCheckoutSession(input: {
  checkoutSessionId: string;
  status: "open" | "complete" | "expired" | "failed";
  paymentIntentId?: string | null;
  payerEmail?: string | null;
  amountTotalCents?: number | null;
  currency?: string | null;
  paymentLinkId?: string | null;
  orgId?: string | null;
}): Promise<void> {
  const supabase = await getBillingSupabaseClient();
  const now = new Date().toISOString();

  const updatePayload: Record<string, unknown> = {
    status: input.status,
    stripe_payment_intent_id: input.paymentIntentId ?? null,
    payer_email: input.payerEmail ?? null,
    amount_total_cents: input.amountTotalCents ?? null,
    currency: input.currency ?? null,
    paid_at: input.status === "complete" ? now : null
  };

  const { data: existing, error: existingError } = await supabase
    .schema("commerce").from("payment_link_payments")
    .select("id")
    .eq("stripe_checkout_session_id", input.checkoutSessionId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to lookup payment link session: ${existingError.message}`);
  }

  if (existing?.id) {
    const { error: updateError } = await supabase
      .schema("commerce").from("payment_link_payments")
      .update(updatePayload)
      .eq("id", existing.id);

    if (updateError) {
      throw new Error(`Failed to update payment link session: ${updateError.message}`);
    }

    return;
  }

  if (!input.paymentLinkId || !input.orgId) {
    return;
  }

  const { error: insertError } = await supabase
    .schema("commerce").from("payment_link_payments")
    .insert({
      payment_link_id: input.paymentLinkId,
      org_id: input.orgId,
      stripe_checkout_session_id: input.checkoutSessionId,
      stripe_payment_intent_id: input.paymentIntentId ?? null,
      status: input.status,
      payer_email: input.payerEmail ?? null,
      amount_total_cents: input.amountTotalCents ?? null,
      currency: input.currency ?? null,
      paid_at: input.status === "complete" ? now : null
    });

  if (insertError) {
    throw new Error(`Failed to insert payment link session: ${insertError.message}`);
  }
}

export function constructStripeEvent(rawBody: string, signature: string): Stripe.Event {
  const stripe = getStripeClient();
  const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();

  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET_NOT_CONFIGURED");
  }

  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}
