import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  normalizeHost,
  getPlatformHosts,
  getTenantBaseHosts,
  shouldSkipCustomDomainRoutingPath,
  resolveOrgSubdomain,
  isReservedSubdomain
} from "@/lib/domains/customDomains";
import { updateSupabaseSessionFromProxy } from "@/lib/supabase/proxy";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

let lookupClient: ReturnType<typeof createClient<any>> | null = null;

function getLookupClient() {
  if (lookupClient) {
    return lookupClient;
  }

  const { supabaseUrl, supabasePublishableKey } = getSupabasePublicConfig();

  lookupClient = createClient<any>(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return lookupClient;
}

async function resolveOrgSlugForDomain(host: string) {
  const supabase = getLookupClient();
  const { data, error } = await supabase.rpc("resolve_org_slug_for_domain", {
    target_domain: host
  });

  if (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Custom domain lookup failed:", error.message);
    }

    return null;
  }

  return typeof data === "string" && data.trim().length > 0 ? data.trim() : null;
}

export async function proxy(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = normalizeHost(forwardedHost || request.headers.get("host"));
  const tenantBaseHosts = getTenantBaseHosts();
  const platformHosts = getPlatformHosts();
  const orgSubdomain = resolveOrgSubdomain(host, tenantBaseHosts);

  const legacyOrgPathRedirect = getLegacyOrgPathRedirect(host, request.nextUrl.pathname, tenantBaseHosts);
  if (legacyOrgPathRedirect) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.hostname = `${legacyOrgPathRedirect.orgSlug}.${legacyOrgPathRedirect.baseHost}`;
    redirectUrl.pathname = legacyOrgPathRedirect.pathname;
    return NextResponse.redirect(redirectUrl, { status: 301 });
  }

  let rewriteUrl: URL | null = null;

  if (orgSubdomain && !shouldSkipCustomDomainRoutingPath(request.nextUrl.pathname)) {
    const prefix = `/${orgSubdomain.orgSlug}`;
    const currentPathname = request.nextUrl.pathname;
    const alreadyOrgPrefixed = currentPathname === prefix || currentPathname.startsWith(`${prefix}/`);

    if (alreadyOrgPrefixed) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.hostname = host;
      redirectUrl.pathname = stripOrgPrefixPath(currentPathname, prefix);
      return NextResponse.redirect(redirectUrl, { status: 308 });
    }

    rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = currentPathname === "/" ? prefix : `${prefix}${currentPathname}`;
  } else if (host && !platformHosts.has(host) && !shouldSkipCustomDomainRoutingPath(request.nextUrl.pathname)) {
    const orgSlug = await resolveOrgSlugForDomain(host);

    if (orgSlug) {
      const prefix = `/${orgSlug}`;
      const currentPathname = request.nextUrl.pathname;
      const alreadyOrgPrefixed = currentPathname === prefix || currentPathname.startsWith(`${prefix}/`);

      if (alreadyOrgPrefixed) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.hostname = host;
        redirectUrl.pathname = stripOrgPrefixPath(currentPathname, prefix);
        return NextResponse.redirect(redirectUrl, { status: 308 });
      }

      rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = currentPathname === "/" ? prefix : `${prefix}${currentPathname}`;
    }
  }

  return updateSupabaseSessionFromProxy(request, {
    rewriteUrl
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|heic|heif|ico)$).*)"]
};

const NON_ORG_PATH_SEGMENTS = new Set(["account", "api", "auth", "brand", "forbidden", "x"]);
const ORG_SEGMENT_PATTERN = /^[a-z0-9-]+$/;

export function getLegacyOrgPathRedirect(host: string, pathname: string, tenantBaseHosts: Set<string>) {
  if (!tenantBaseHosts.has(host)) {
    return null;
  }

  const trimmed = pathname.replace(/^\/+|\/+$/g, "");
  if (!trimmed) {
    return null;
  }

  const [firstSegment, ...restSegments] = trimmed.split("/");
  if (
    !firstSegment ||
    NON_ORG_PATH_SEGMENTS.has(firstSegment) ||
    isReservedSubdomain(firstSegment) ||
    !ORG_SEGMENT_PATTERN.test(firstSegment)
  ) {
    return null;
  }

  return {
    baseHost: host,
    orgSlug: firstSegment,
    pathname: restSegments.length > 0 ? `/${restSegments.join("/")}` : "/"
  };
}

function stripOrgPrefixPath(pathname: string, prefix: string) {
  if (pathname === prefix) {
    return "/";
  }

  const stripped = pathname.slice(prefix.length);
  return stripped.startsWith("/") ? stripped : `/${stripped}`;
}
