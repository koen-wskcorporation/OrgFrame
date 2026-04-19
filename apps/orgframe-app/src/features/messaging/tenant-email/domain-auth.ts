import "server-only";

import { createSupabaseServiceRoleClient } from "@/src/shared/data-api/server";

// SendGrid Domain Authentication API wrapper. Docs:
// https://www.twilio.com/docs/sendgrid/api-reference/domain-authentication

const SENDGRID_API = "https://api.sendgrid.com/v3";

type SendGridDnsRecord = {
  host: string;
  type: string;
  data: string;
  valid?: boolean;
};

type SendGridDomainResponse = {
  id: number;
  domain: string;
  subdomain?: string;
  valid: boolean;
  dns: {
    mail_cname?: SendGridDnsRecord;
    mail_server?: SendGridDnsRecord;
    dkim?: SendGridDnsRecord;
    dkim1?: SendGridDnsRecord;
    dkim2?: SendGridDnsRecord;
    spf?: SendGridDnsRecord;
  };
};

function getApiKey(): string {
  const key = process.env.SENDGRID_API_KEY?.trim();
  if (!key) throw new Error("SENDGRID_API_KEY not set");
  return key;
}

async function sgFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SENDGRID_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SendGrid ${path} failed (${res.status}): ${body}`);
  }
  return (await res.json()) as T;
}

function flattenDnsRecords(dns: SendGridDomainResponse["dns"]): SendGridDnsRecord[] {
  return Object.values(dns).filter((r): r is SendGridDnsRecord => !!r && typeof r === "object");
}

export async function createDomainAuthentication(input: {
  orgId: string;
  domain: string;
  subdomain?: string;
}): Promise<{ domainRowId: string; sendgridDomainId: number; dnsRecords: SendGridDnsRecord[] }> {
  const supabase = createSupabaseServiceRoleClient();

  const body = await sgFetch<SendGridDomainResponse>("/whitelabel/domains", {
    method: "POST",
    body: JSON.stringify({
      domain: input.domain,
      subdomain: input.subdomain ?? "em",
      automatic_security: true,
      custom_spf: false,
      default: false
    })
  });

  const dnsRecords = flattenDnsRecords(body.dns);

  const { data, error } = await supabase
    .schema("messaging")
    .from("org_email_domains")
    .upsert(
      {
        org_id: input.orgId,
        domain: input.domain,
        sendgrid_domain_id: body.id,
        dns_records: dnsRecords,
        dkim_verified: false,
        spf_verified: false
      },
      { onConflict: "org_id,domain" }
    )
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to persist domain: ${error.message}`);
  }

  return { domainRowId: data.id, sendgridDomainId: body.id, dnsRecords };
}

export async function validateDomainAuthentication(domainRowId: string): Promise<{
  valid: boolean;
  dnsRecords: SendGridDnsRecord[];
}> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: domain, error: loadError } = await supabase
    .schema("messaging")
    .from("org_email_domains")
    .select("id, sendgrid_domain_id")
    .eq("id", domainRowId)
    .maybeSingle();

  if (loadError || !domain?.sendgrid_domain_id) {
    throw new Error("Domain not found or missing sendgrid_domain_id");
  }

  const validation = await sgFetch<{ id: number; valid: boolean; validation_results: Record<string, { valid: boolean; reason: string | null }> }>(
    `/whitelabel/domains/${domain.sendgrid_domain_id}/validate`,
    { method: "POST" }
  );

  const current = await sgFetch<SendGridDomainResponse>(`/whitelabel/domains/${domain.sendgrid_domain_id}`);
  const dnsRecords = flattenDnsRecords(current.dns);

  const dkimValid = !!validation.validation_results?.dkim1?.valid && !!validation.validation_results?.dkim2?.valid;
  const spfValid = !!validation.validation_results?.mail_cname?.valid;

  const { error: updateError } = await supabase
    .schema("messaging")
    .from("org_email_domains")
    .update({
      dns_records: dnsRecords,
      dkim_verified: dkimValid,
      spf_verified: spfValid,
      verified_at: validation.valid ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    })
    .eq("id", domainRowId);

  if (updateError) {
    throw new Error(`Failed to persist validation: ${updateError.message}`);
  }

  return { valid: validation.valid, dnsRecords };
}

export async function deleteDomainAuthentication(domainRowId: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: domain } = await supabase
    .schema("messaging")
    .from("org_email_domains")
    .select("sendgrid_domain_id")
    .eq("id", domainRowId)
    .maybeSingle();

  if (domain?.sendgrid_domain_id) {
    await sgFetch(`/whitelabel/domains/${domain.sendgrid_domain_id}`, { method: "DELETE" });
  }

  await supabase
    .schema("messaging")
    .from("org_email_domains")
    .delete()
    .eq("id", domainRowId);
}
