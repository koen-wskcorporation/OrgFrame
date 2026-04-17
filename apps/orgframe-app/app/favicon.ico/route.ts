import { NextResponse } from "next/server";
import { getOrgAssetPublicUrl } from "@/src/shared/branding/getOrgAssetPublicUrl";
import { createDataApiPublicClient } from "@/src/shared/data-api/client";
import { getPlatformHosts, getTenantBaseHosts, normalizeHost, resolveOrgSubdomain } from "@/src/shared/domains/customDomains";

export async function GET(request: Request) {
  const orgSlug = await resolveRequestOrgSlug(request);

  if (orgSlug) {
    const orgIconUrl = await getOrgIconUrl(orgSlug);

    if (orgIconUrl) {
      const response = NextResponse.redirect(orgIconUrl, { status: 307 });
      response.headers.set("Cache-Control", "public, max-age=120, stale-while-revalidate=600");
      return response;
    }
  }

  return NextResponse.redirect(new URL("/brand/favicon.svg", request.url), { status: 307 });
}

let lookupClient: ReturnType<typeof createDataApiPublicClient> | null | undefined;

function getLookupClient() {
  if (lookupClient !== undefined) {
    return lookupClient;
  }

  try {
    lookupClient = createDataApiPublicClient();
  } catch {
    lookupClient = null;
  }

  return lookupClient;
}

function parseRequestHost(request: Request) {
  const headers = request.headers;
  const hostHeader = headers.get("x-forwarded-host") || headers.get("host");
  const rawHost = hostHeader?.split(",")[0]?.trim() ?? "";
  return normalizeHost(rawHost);
}

function getDomainLookupCandidates(host: string) {
  const candidates = new Set<string>([host]);

  if (host.startsWith("www.")) {
    candidates.add(host.slice("www.".length));
  } else {
    candidates.add(`www.${host}`);
  }

  return Array.from(candidates).filter(Boolean);
}

async function resolveRequestOrgSlug(request: Request) {
  const host = parseRequestHost(request);
  if (!host) {
    return null;
  }

  const tenantBaseHosts = getTenantBaseHosts();
  const subdomain = resolveOrgSubdomain(host, tenantBaseHosts);
  if (subdomain?.orgSlug) {
    return subdomain.orgSlug;
  }

  if (getPlatformHosts().has(host)) {
    return null;
  }

  const supabase = getLookupClient();
  if (!supabase) {
    return null;
  }

  const candidates = getDomainLookupCandidates(host);
  for (const candidate of candidates) {
    const { data, error } = await supabase.rpc("resolve_org_slug_for_domain", {
      target_domain: candidate
    });

    if (!error && typeof data === "string" && data.trim().length > 0) {
      return data.trim();
    }
  }

  return null;
}

async function getOrgIconUrl(orgSlug: string) {
  const supabase = getLookupClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .schema("orgs").from("orgs")
    .select("icon_path")
    .eq("slug", orgSlug)
    .maybeSingle();

  if (error) {
    return null;
  }

  return getOrgAssetPublicUrl(typeof data?.icon_path === "string" ? data.icon_path : null);
}
