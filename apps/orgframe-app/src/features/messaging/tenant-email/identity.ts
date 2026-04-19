import "server-only";

import { createSupabaseServiceRoleClient } from "@/src/shared/data-api/server";

export type ResolvedSenderIdentity = {
  identityId: string | null;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  domainVerified: boolean;
  usingFallbackDomain: boolean;
};

function getFallbackDomain(): string {
  return (process.env.EMAIL_DEFAULT_TENANT_DOMAIN?.trim() || "orgframe.app").toLowerCase();
}

function buildFallbackFrom(orgSlug: string | null, orgName: string | null): { email: string; name: string } {
  const domain = getFallbackDomain();
  const local = (orgSlug || "org").replace(/[^a-z0-9-]/gi, "").toLowerCase() || "org";
  return {
    email: `${local}@${domain}`,
    name: orgName?.trim() || "OrgFrame"
  };
}

export async function resolveOrgSenderIdentity(orgId: string): Promise<ResolvedSenderIdentity> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: identity } = await supabase
    .schema("messaging")
    .from("org_email_identities")
    .select("id, from_email, from_name, reply_to, domain_id, is_default")
    .eq("org_id", orgId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: org } = await supabase
    .schema("orgs")
    .from("orgs")
    .select("slug, name")
    .eq("id", orgId)
    .maybeSingle();

  if (!identity) {
    const fallback = buildFallbackFrom(org?.slug ?? null, org?.name ?? null);
    return {
      identityId: null,
      fromEmail: fallback.email,
      fromName: fallback.name,
      domainVerified: false,
      usingFallbackDomain: true
    };
  }

  let domainVerified = false;
  if (identity.domain_id) {
    const { data: domain } = await supabase
      .schema("messaging")
      .from("org_email_domains")
      .select("dkim_verified, spf_verified")
      .eq("id", identity.domain_id)
      .maybeSingle();
    domainVerified = !!(domain?.dkim_verified && domain?.spf_verified);
  }

  if (!domainVerified) {
    // Domain not yet verified — ship via fallback subdomain, preserve org reply-to.
    const fallback = buildFallbackFrom(org?.slug ?? null, identity.from_name);
    return {
      identityId: identity.id,
      fromEmail: fallback.email,
      fromName: identity.from_name,
      replyTo: identity.reply_to ?? identity.from_email,
      domainVerified: false,
      usingFallbackDomain: true
    };
  }

  return {
    identityId: identity.id,
    fromEmail: identity.from_email,
    fromName: identity.from_name,
    replyTo: identity.reply_to ?? undefined,
    domainVerified: true,
    usingFallbackDomain: false
  };
}
