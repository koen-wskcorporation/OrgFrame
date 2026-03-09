"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { normalizeDomain, getPlatformHost } from "@/lib/domains/customDomains";
import { verifyCustomDomainDns } from "@/lib/domains/verification";
import { rethrowIfNavigationError } from "@/lib/actions/rethrowIfNavigationError";
import { requireOrgPermission } from "@/lib/permissions/requireOrgPermission";
import { createSupabaseServer } from "@/lib/supabase/server";

const domainSchema = z.object({
  domain: z.string().trim().min(1).max(253)
});

const domainPattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const ipV4Pattern = /^(?:\d{1,3}\.){3}\d{1,3}$/;

function getField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isValidCustomDomain(domain: string) {
  if (!domain || domain.length > 253 || domain.includes(" ")) {
    return false;
  }

  if (domain === "localhost" || domain.endsWith(".localhost")) {
    return false;
  }

  if (ipV4Pattern.test(domain)) {
    return false;
  }

  return domainPattern.test(domain);
}

function toSaveErrorCode(error: unknown): string {
  if (!(error instanceof Error)) {
    return "save_failed";
  }

  const message = error.message.toLowerCase();

  if (message.includes("org_custom_domains_domain_key") || message.includes("duplicate key")) {
    return "domain_taken";
  }

  return "save_failed";
}

export async function saveOrgCustomDomainAction(orgSlug: string, formData: FormData) {
  try {
    const parsed = domainSchema.safeParse({
      domain: getField(formData, "domain")
    });

    if (!parsed.success) {
      redirect(`/${orgSlug}/tools/manage/domains?error=invalid_domain`);
    }

    const orgContext = await requireOrgPermission(orgSlug, "org.manage.read");
    const domain = normalizeDomain(parsed.data.domain);
    const platformHost = getPlatformHost();

    if (!isValidCustomDomain(domain) || domain === platformHost) {
      redirect(`/${orgSlug}/tools/manage/domains?error=invalid_domain`);
    }

    const supabase = await createSupabaseServer();

    const { data: existing, error: existingError } = await supabase
      .from("org_custom_domains")
      .select("domain, status, verification_token")
      .eq("org_id", orgContext.orgId)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    const domainChanged = !existing || existing.domain !== domain;

    const { error } = await supabase.from("org_custom_domains").upsert(
      {
        org_id: orgContext.orgId,
        domain,
        status: domainChanged ? "pending" : existing.status,
        verification_token: domainChanged ? crypto.randomUUID().replace(/-/g, "") : existing.verification_token,
        verified_at: domainChanged ? null : undefined,
        last_error: null
      },
      {
        onConflict: "org_id"
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(`/${orgSlug}/manage/domains`);
    revalidatePath(`/${orgSlug}/tools/manage/domains`);
    redirect(`/${orgSlug}/tools/manage/domains?saved=1`);
  } catch (error) {
    rethrowIfNavigationError(error);
    redirect(`/${orgSlug}/tools/manage/domains?error=${toSaveErrorCode(error)}`);
  }
}

export async function verifyOrgCustomDomainAction(orgSlug: string) {
  try {
    const orgContext = await requireOrgPermission(orgSlug, "org.manage.read");
    const supabase = await createSupabaseServer();

    const { data: existing, error: existingError } = await supabase
      .from("org_custom_domains")
      .select("domain, verification_token")
      .eq("org_id", orgContext.orgId)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (!existing) {
      redirect(`/${orgSlug}/tools/manage/domains?error=missing_domain`);
    }

    const result = await verifyCustomDomainDns(existing.domain, existing.verification_token);

    const { error: updateError } = await supabase
      .from("org_custom_domains")
      .update({
        status: result.status,
        verified_at: result.verified ? new Date().toISOString() : null,
        last_error: result.verified ? null : result.message
      })
      .eq("org_id", orgContext.orgId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    revalidatePath(`/${orgSlug}/manage/domains`);
    revalidatePath(`/${orgSlug}/tools/manage/domains`);

    if (!result.verified) {
      redirect(`/${orgSlug}/tools/manage/domains?error=verification_failed`);
    }

    redirect(`/${orgSlug}/tools/manage/domains?verified=1`);
  } catch (error) {
    rethrowIfNavigationError(error);
    redirect(`/${orgSlug}/tools/manage/domains?error=verification_failed`);
  }
}

export async function removeOrgCustomDomainAction(orgSlug: string) {
  try {
    const orgContext = await requireOrgPermission(orgSlug, "org.manage.read");
    const supabase = await createSupabaseServer();

    const { error } = await supabase.from("org_custom_domains").delete().eq("org_id", orgContext.orgId);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(`/${orgSlug}/manage/domains`);
    revalidatePath(`/${orgSlug}/tools/manage/domains`);
    redirect(`/${orgSlug}/tools/manage/domains?removed=1`);
  } catch (error) {
    rethrowIfNavigationError(error);
    redirect(`/${orgSlug}/tools/manage/domains?error=remove_failed`);
  }
}
