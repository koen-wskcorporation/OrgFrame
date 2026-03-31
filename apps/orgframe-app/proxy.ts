import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  normalizeHost,
  getPlatformHost,
  getPlatformHosts,
  getTenantBaseHosts,
  shouldSkipCustomDomainRoutingPath,
  resolveOrgSubdomain,
  isReservedSubdomain
} from "@/src/shared/domains/customDomains";
import { parseHostWithPort } from "@/src/shared/domains/hostHeaders";
import { createDataApiPublicClient } from "@/src/shared/data-api/client";
import { updateDataApiSessionFromProxy } from "@/src/shared/data-api/proxy";

function applyRedirectHostname(url: URL, hostname: string, port: string) {
  url.hostname = hostname;
  if (port) {
    url.port = port;
  }
}

async function resolveOrgSlugForDomain(host: string) {
  const supabase = createDataApiPublicClient();
  const candidates = getDomainLookupCandidates(host);

  for (const candidate of candidates) {
    const { data, error } = await supabase.rpc("resolve_org_slug_for_domain", {
      target_domain: candidate
    });

    if (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Custom domain lookup failed:", error.message);
      }

      continue;
    }

    if (typeof data === "string" && data.trim().length > 0) {
      return data.trim();
    }
  }

  return null;
}

export async function proxy(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const hostHeader = forwardedHost || request.headers.get("host");
  const parsedHost = parseHostWithPort(hostHeader);
  const host = parsedHost.host;
  const tenantBaseHosts = getTenantBaseHosts();
  const platformHosts = getPlatformHosts();
  const orgSubdomain = resolveOrgSubdomain(host, tenantBaseHosts);

  const legacyOrgPathRedirect = getLegacyOrgPathRedirect(host, request.nextUrl.pathname, tenantBaseHosts);
  if (legacyOrgPathRedirect) {
    const redirectUrl = request.nextUrl.clone();
    applyRedirectHostname(redirectUrl, `${legacyOrgPathRedirect.orgSlug}.${legacyOrgPathRedirect.baseHost}`, parsedHost.port);
    redirectUrl.pathname = legacyOrgPathRedirect.pathname;
    return NextResponse.redirect(redirectUrl, { status: 301 });
  }

  let rewriteUrl: URL | null = null;

  if (orgSubdomain) {
    const redirectHost = getPlatformRedirectHostForSubdomain(request.nextUrl.pathname, orgSubdomain.baseHost);

    if (redirectHost && normalizeHost(redirectHost) !== host) {
      const protocol = getRequestProtocol(request);
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.protocol = `${protocol}:`;
      applyRedirectHostname(redirectUrl, redirectHost, parsedHost.port);
      return NextResponse.redirect(redirectUrl, { status: 307 });
    }

    if (!shouldSkipCustomDomainRoutingPath(request.nextUrl.pathname)) {
      const prefix = `/${orgSubdomain.orgSlug}`;
      const currentPathname = request.nextUrl.pathname;
      const alreadyOrgPrefixed = currentPathname === prefix || currentPathname.startsWith(`${prefix}/`);

      if (alreadyOrgPrefixed) {
        const redirectUrl = request.nextUrl.clone();
        applyRedirectHostname(redirectUrl, host, parsedHost.port);
        redirectUrl.pathname = stripOrgPrefixPath(currentPathname, prefix);
        return NextResponse.redirect(redirectUrl, { status: 308 });
      }

      rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = currentPathname === "/" ? prefix : `${prefix}${currentPathname}`;
    }
  } else if (host && !platformHosts.has(host)) {
    const orgSlug = await resolveOrgSlugForDomain(host);

    if (orgSlug) {
      const redirectHost = getCustomDomainRedirectHost(request.nextUrl.pathname, orgSlug);

      if (redirectHost && normalizeHost(redirectHost) !== host) {
        const protocol = getRequestProtocol(request);
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.protocol = `${protocol}:`;
        applyRedirectHostname(redirectUrl, redirectHost, parsedHost.port);
        return NextResponse.redirect(redirectUrl, { status: 307 });
      }

      if (!shouldSkipCustomDomainRoutingPath(request.nextUrl.pathname)) {
        const prefix = `/${orgSlug}`;
        const currentPathname = request.nextUrl.pathname;
        const alreadyOrgPrefixed = currentPathname === prefix || currentPathname.startsWith(`${prefix}/`);

        if (alreadyOrgPrefixed) {
          const redirectUrl = request.nextUrl.clone();
          applyRedirectHostname(redirectUrl, host, parsedHost.port);
          redirectUrl.pathname = stripOrgPrefixPath(currentPathname, prefix);
          return NextResponse.redirect(redirectUrl, { status: 308 });
        }

        rewriteUrl = request.nextUrl.clone();
        rewriteUrl.pathname = currentPathname === "/" ? prefix : `${prefix}${currentPathname}`;
      }
    }
  }

  return updateDataApiSessionFromProxy(request, {
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

function getRequestProtocol(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwardedProto === "http" || forwardedProto === "https") {
    return forwardedProto;
  }

  return request.nextUrl.protocol === "https:" ? "https" : "http";
}

const PLATFORM_ONLY_ROOT_SEGMENTS = new Set(["account", "auth", "brand", "forbidden", "x"]);

export function getPlatformRedirectHostForSubdomain(pathname: string, baseHost: string) {
  const trimmedPath = pathname.replace(/^\/+/, "");
  if (!trimmedPath) {
    return null;
  }

  const [firstSegment] = trimmedPath.split("/");
  if (firstSegment && PLATFORM_ONLY_ROOT_SEGMENTS.has(firstSegment)) {
    return baseHost;
  }

  return null;
}

export function getCustomDomainRedirectHost(pathname: string, _orgSlug: string) {
  const trimmedPath = pathname.replace(/^\/+/, "");
  if (!trimmedPath) {
    return null;
  }

  const [firstSegment] = trimmedPath.split("/");
  const platformHost = getPlatformHost();

  if (firstSegment && PLATFORM_ONLY_ROOT_SEGMENTS.has(firstSegment)) {
    return platformHost;
  }

  return null;
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
