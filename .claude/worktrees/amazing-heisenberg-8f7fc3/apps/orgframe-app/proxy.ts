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
import { parseHostWithPort, type ParsedHostHeader } from "@/src/shared/domains/hostHeaders";
import { createDataApiPublicClient } from "@/src/shared/data-api/client";
import { updateDataApiSessionFromProxy } from "@/src/shared/data-api/proxy";

function applyRedirectHostname(url: URL, hostname: string, port: string) {
  url.hostname = hostname;
  if (port) {
    url.port = port;
  }
}

function redirectAbsolute(url: URL, status: number) {
  return new NextResponse(null, {
    status,
    headers: {
      location: url.toString()
    }
  });
}

function buildAbsoluteRequestUrl(protocol: string, host: string, port: string, pathname: string, search: string) {
  const authority = port ? `${host}:${port}` : host;
  return new URL(`${pathname}${search}`, `${protocol}://${authority}`);
}

function isSameUrlTargetForRequest(request: NextRequest, parsedHost: ParsedHostHeader, protocol: string, target: URL) {
  const current = buildAbsoluteRequestUrl(protocol, parsedHost.host || request.nextUrl.hostname, parsedHost.port, request.nextUrl.pathname, request.nextUrl.search);
  return current.toString() === target.toString();
}

export function resolveProxyRequestHost(request: NextRequest) {
  const forwardedHost = parseHostWithPort(request.headers.get("x-forwarded-host"));
  const headerHost = parseHostWithPort(request.headers.get("host"));
  const urlHost = parseHostWithPort(request.nextUrl.host);
  const isLocalUrlHost = !urlHost.host || urlHost.host === "localhost" || urlHost.host === "127.0.0.1";

  if (isLocalUrlHost) {
    if (forwardedHost.host) {
      return forwardedHost;
    }

    if (headerHost.host) {
      return headerHost;
    }

    return urlHost;
  }

  if (headerHost.host) {
    return headerHost;
  }

  return urlHost;
}

export function resolveProxyRequestHostForRouting(request: NextRequest, tenantBaseHosts: Set<string>) {
  const candidates = [
    parseHostWithPort(request.headers.get("x-forwarded-host")),
    parseHostWithPort(request.headers.get("host")),
    parseHostWithPort(request.nextUrl.host)
  ];

  for (const candidate of candidates) {
    if (!candidate.host) {
      continue;
    }

    if (resolveOrgSubdomain(candidate.host, tenantBaseHosts)) {
      return candidate;
    }
  }

  return resolveProxyRequestHost(request);
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

function getGlobalPlatformRedirectHost(pathname: string) {
  const trimmedPath = pathname.replace(/^\/+/, "");
  if (!trimmedPath) {
    return null;
  }

  const [firstSegment] = trimmedPath.split("/");
  if (firstSegment && PLATFORM_ONLY_ROOT_SEGMENTS.has(firstSegment)) {
    return getPlatformHost();
  }

  return null;
}

export async function proxy(request: NextRequest) {
  const tenantBaseHosts = getTenantBaseHosts();
  const parsedHost = resolveProxyRequestHostForRouting(request, tenantBaseHosts);
  const host = parsedHost.host;
  const platformHosts = getPlatformHosts();
  const orgSubdomain = resolveOrgSubdomain(host, tenantBaseHosts);
  const globalPlatformRedirectHost = getGlobalPlatformRedirectHost(request.nextUrl.pathname);
  const protocol = getRequestProtocol(request);

  if (globalPlatformRedirectHost && normalizeHost(globalPlatformRedirectHost) !== host) {
    const redirectUrl = buildAbsoluteRequestUrl(protocol, globalPlatformRedirectHost, parsedHost.port, request.nextUrl.pathname, request.nextUrl.search);
    if (!isSameUrlTargetForRequest(request, parsedHost, protocol, redirectUrl)) {
      return redirectAbsolute(redirectUrl, 307);
    }
  }

  const legacyOrgPathRedirect = getLegacyOrgPathRedirect(host, request.nextUrl.pathname, tenantBaseHosts);
  if (legacyOrgPathRedirect) {
    const redirectUrl = buildAbsoluteRequestUrl(
      protocol,
      `${legacyOrgPathRedirect.orgSlug}.${legacyOrgPathRedirect.baseHost}`,
      parsedHost.port,
      request.nextUrl.pathname,
      request.nextUrl.search
    );
    redirectUrl.pathname = legacyOrgPathRedirect.pathname;
    return redirectAbsolute(redirectUrl, 301);
  }

  let rewriteUrl: URL | null = null;

  if (orgSubdomain) {
    const redirectHost = getPlatformRedirectHostForSubdomain(request.nextUrl.pathname, orgSubdomain.baseHost);

    if (redirectHost && normalizeHost(redirectHost) !== host) {
      const redirectUrl = buildAbsoluteRequestUrl(protocol, redirectHost, parsedHost.port, request.nextUrl.pathname, request.nextUrl.search);
      return redirectAbsolute(redirectUrl, 307);
    }

    if (!shouldSkipCustomDomainRoutingPath(request.nextUrl.pathname)) {
      const prefix = `/${orgSubdomain.orgSlug}`;
      const currentPathname = request.nextUrl.pathname;
      const alreadyOrgPrefixed = currentPathname === prefix || currentPathname.startsWith(`${prefix}/`);

      if (alreadyOrgPrefixed) {
        const redirectUrl = request.nextUrl.clone();
        applyRedirectHostname(redirectUrl, host, parsedHost.port);
        redirectUrl.pathname = stripOrgPrefixPath(currentPathname, prefix);
        return redirectAbsolute(redirectUrl, 308);
      }

      rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = currentPathname === "/" ? prefix : `${prefix}${currentPathname}`;
    }
  } else if (host && !platformHosts.has(host)) {
    const orgSlug = await resolveOrgSlugForDomain(host);

    if (orgSlug) {
      const redirectHost = getCustomDomainRedirectHost(request.nextUrl.pathname, orgSlug);

      if (redirectHost && normalizeHost(redirectHost) !== host) {
        const redirectUrl = buildAbsoluteRequestUrl(protocol, redirectHost, parsedHost.port, request.nextUrl.pathname, request.nextUrl.search);
        return redirectAbsolute(redirectUrl, 307);
      }

      if (!shouldSkipCustomDomainRoutingPath(request.nextUrl.pathname)) {
        const prefix = `/${orgSlug}`;
        const currentPathname = request.nextUrl.pathname;
        const alreadyOrgPrefixed = currentPathname === prefix || currentPathname.startsWith(`${prefix}/`);

        if (alreadyOrgPrefixed) {
          const redirectUrl = request.nextUrl.clone();
          applyRedirectHostname(redirectUrl, host, parsedHost.port);
          redirectUrl.pathname = stripOrgPrefixPath(currentPathname, prefix);
          return redirectAbsolute(redirectUrl, 308);
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
  const canonicalOrgHost = `${_orgSlug}.${platformHost}`;

  if (firstSegment && PLATFORM_ONLY_ROOT_SEGMENTS.has(firstSegment)) {
    return platformHost;
  }

  if (firstSegment === "tools") {
    return canonicalOrgHost;
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
