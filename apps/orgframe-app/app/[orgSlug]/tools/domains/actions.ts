"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { normalizeDomain, getPlatformHost } from "@/src/shared/domains/customDomains";
import { verifyCustomDomainDns } from "@/src/shared/domains/verification";
import { attachDomainToVercelProject } from "@/src/shared/domains/vercelProjectDomains";
import { rethrowIfNavigationError } from "@/src/shared/navigation/rethrowIfNavigationError";
import { requireOrgToolEnabled } from "@/src/shared/org/requireOrgToolEnabled";
import { requireOrgPermission } from "@/src/shared/permissions/requireOrgPermission";
import { createSupabaseServer } from "@/src/shared/data-api/server";

const domainSchema = z.object({
  domain: z.string().trim().min(1).max(253)
});

const domainPattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const ipV4Pattern = /^(?:\d{1,3}\.){3}\d{1,3}$/;

function getField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function buildDomainsRedirect(
  orgSlug: string,
  params: Record<string, string | number | boolean | null | undefined>
) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === false || value === "") {
      continue;
    }

    query.set(key, String(value));
  }

  const queryString = query.toString();
  return `/tools/domains${queryString ? `?${queryString}` : ""}`;
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

  if (message.includes("org_custom_domains_domain_key") || message.includes("custom_domains_domain_key") || message.includes("duplicate key")) {
    return "domain_taken";
  }

  return "save_failed";
}

export async function saveOrgCustomDomainAction(orgSlug: string, formData: FormData) {
  try {
    const setup = getField(formData, "setup") === "1";
    const nextStep = getField(formData, "next_step") || "2";

    const parsed = domainSchema.safeParse({
      domain: getField(formData, "domain")
    });

    if (!parsed.success) {
      redirect(
        buildDomainsRedirect(orgSlug, {
          error: "invalid_domain",
          setup,
          step: setup ? "1" : null
        })
      );
    }

    const orgContext = await requireOrgPermission(orgSlug, "org.manage.read");
    requireOrgToolEnabled(orgContext.toolAvailability, "domains");
    const domain = normalizeDomain(parsed.data.domain);
    const platformHost = getPlatformHost();

    if (!isValidCustomDomain(domain) || domain === platformHost) {
      redirect(
        buildDomainsRedirect(orgSlug, {
          error: "invalid_domain",
          setup,
          step: setup ? "1" : null
        })
      );
    }

    const supabase = await createSupabaseServer();

    const { data: existing, error: existingError } = await supabase
      .schema("orgs").from("custom_domains")
      .select("domain, status, verification_token")
      .eq("org_id", orgContext.orgId)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    const domainChanged = !existing || existing.domain !== domain;

    if (domainChanged) {
      const attachResult = await attachDomainToVercelProject(domain);
      if (!attachResult.ok) {
        redirect(
          buildDomainsRedirect(orgSlug, {
            error: attachResult.reason === "not_configured" ? "vercel_not_configured" : "vercel_attach_failed",
            detail: attachResult.message,
            setup,
            step: setup ? "1" : null
          })
        );
      }
    }

    const { error } = await supabase.schema("orgs").from("custom_domains").upsert(
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

    revalidatePath(`/${orgSlug}/tools/domains`);
    revalidatePath(`/${orgSlug}/tools/domains`);
    redirect(
      buildDomainsRedirect(orgSlug, {
        saved: 1,
        setup,
        step: setup ? nextStep : null
      })
    );
  } catch (error) {
    rethrowIfNavigationError(error);
    redirect(
      buildDomainsRedirect(orgSlug, {
        error: toSaveErrorCode(error),
        setup: getField(formData, "setup") === "1",
        step: getField(formData, "setup") === "1" ? "1" : null
      })
    );
  }
}

export async function verifyOrgCustomDomainAction(orgSlug: string, formData?: FormData) {
  try {
    const setup = formData ? getField(formData, "setup") === "1" : false;
    const step = formData ? getField(formData, "step") || "3" : "3";
    const method = formData ? getField(formData, "method") : "";
    const orgContext = await requireOrgPermission(orgSlug, "org.manage.read");
    requireOrgToolEnabled(orgContext.toolAvailability, "domains");
    const supabase = await createSupabaseServer();

    const { data: existing, error: existingError } = await supabase
      .schema("orgs").from("custom_domains")
      .select("domain, verification_token")
      .eq("org_id", orgContext.orgId)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (!existing) {
      redirect(
        buildDomainsRedirect(orgSlug, {
          error: "missing_domain",
          setup,
          step: setup ? step : null,
          method: setup ? method : null
        })
      );
    }

    const result = await verifyCustomDomainDns(existing.domain, existing.verification_token);

    const { error: updateError } = await supabase
      .schema("orgs").from("custom_domains")
      .update({
        status: result.status,
        verified_at: result.verified ? new Date().toISOString() : null,
        last_error: result.verified ? null : result.message
      })
      .eq("org_id", orgContext.orgId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    revalidatePath(`/${orgSlug}/tools/domains`);
    revalidatePath(`/${orgSlug}/tools/domains`);

    if (!result.verified) {
      redirect(
        buildDomainsRedirect(orgSlug, {
          error: "verification_failed",
          detail: result.message,
          setup,
          step: setup ? step : null,
          method: setup ? method : null
        })
      );
    }

    redirect(buildDomainsRedirect(orgSlug, { verified: 1 }));
  } catch (error) {
    rethrowIfNavigationError(error);
    const errorMessage = error instanceof Error && error.message.trim() ? error.message.trim() : null;
    redirect(
      buildDomainsRedirect(orgSlug, {
        error: "verification_failed",
        detail: errorMessage,
        setup: formData ? getField(formData, "setup") === "1" : false,
        step: formData && getField(formData, "setup") === "1" ? getField(formData, "step") || "3" : null,
        method: formData && getField(formData, "setup") === "1" ? getField(formData, "method") || null : null
      })
    );
  }
}

export async function removeOrgCustomDomainAction(orgSlug: string) {
  try {
    const orgContext = await requireOrgPermission(orgSlug, "org.manage.read");
    requireOrgToolEnabled(orgContext.toolAvailability, "domains");
    const supabase = await createSupabaseServer();

    const { error } = await supabase.schema("orgs").from("custom_domains").delete().eq("org_id", orgContext.orgId);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(`/${orgSlug}/tools/domains`);
    revalidatePath(`/${orgSlug}/tools/domains`);
    redirect(`/tools/domains?removed=1`);
  } catch (error) {
    rethrowIfNavigationError(error);
    redirect(`/tools/domains?error=remove_failed`);
  }
}
