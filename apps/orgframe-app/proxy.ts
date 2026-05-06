import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  normalizeHost,
  getCanonicalAuthHost,
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

const AUTH_PASS_THROUGH_PATHS = new Set(["/auth/handoff"]);

function shouldRedirectAuthToCanonical(pathname: string) {
  if (!pathname.startsWith("/auth")) {
    return false;
  }

  if (AUTH_PASS_THROUGH_PATHS.has(pathname)) {
    return false;
  }

  for (const prefix of AUTH_PASS_THROUGH_PATHS) {
    if (pathname.startsWith(`${prefix}/`)) {
      return false;
    }
  }

  return true;
}

function buildCanonicalAuthRedirect(request: NextRequest, parsedHost: ParsedHostHeader, protocol: string) {
  const canonicalHost = normalizeHost(getCanonicalAuthHost());
  if (!canonicalHost || !parsedHost.host || parsedHost.host === canonicalHost) {
    return null;
  }

  const currentAuthority = parsedHost.port ? `${parsedHost.host}:${parsedHost.port}` : parsedHost.host;
  const currentOrigin = `${protocol}://${currentAuthority}`;
  const canonicalAuthority = parsedHost.port ? `${canonicalHost}:${parsedHost.port}` : canonicalHost;
  const targetUrl = new URL(request.nextUrl.pathname, `${protocol}://${canonicalAuthority}`);

  request.nextUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });

  if (!targetUrl.searchParams.has("return_to")) {
    targetUrl.searchParams.set("return_to", `${currentOrigin}${request.nextUrl.pathname}`);
  }

  return targetUrl;
}

const CANONICAL_AUTH_ALLOWED_PREFIXES = ["/auth", "/api", "/_next", "/favicon", "/brand"];

function isPathAllowedOnCanonicalAuthHost(pathname: string) {
  for (const prefix of CANONICAL_AUTH_ALLOWED_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return true;
    }
  }
  return false;
}

export async function proxy(request: NextRequest) {
  const tenantBaseHosts = getTenantBaseHosts();
  const parsedHost = resolveProxyRequestHostForRouting(request, tenantBaseHosts);
  const host = parsedHost.host;
  const platformHosts = getPlatformHosts();
  const canonicalAuthHost = normalizeHost(getCanonicalAuthHost());

  if (canonicalAuthHost && host === canonicalAuthHost) {
    const { pathname, search } = request.nextUrl;

    if (pathname === "/auth") {
      const target = new URL(`/${search}`, request.url);
      return NextResponse.redirect(target, 308);
    }

    if (pathname === "/") {
      const rewriteUrl = new URL(`/auth${search}`, request.url);
      return NextResponse.rewrite(rewriteUrl);
    }

    if (!isPathAllowedOnCanonicalAuthHost(pathname)) {
      const protocol = getRequestProtocol(request);
      const platformHost = getPlatformHost();
      if (platformHost && platformHost !== host) {
        const redirectUrl = buildAbsoluteRequestUrl(protocol, platformHost, parsedHost.port, pathname, search);
        return redirectAbsolute(redirectUrl, 307);
      }
    }
  }

  if (shouldRedirectAuthToCanonical(request.nextUrl.pathname)) {
    const protocol = getRequestProtocol(request);
    const canonicalRedirect = buildCanonicalAuthRedirect(request, parsedHost, protocol);
    if (canonicalRedirect) {
      return redirectAbsolute(canonicalRedirect, 307);
    }
  }
  const orgSubdomain = resolveOrgSubdomain(host, tenantBaseHosts);

  if (!orgSubdomain && (!canonicalAuthHost || host !== canonicalAuthHost)) {
    for (const baseHost of tenantBaseHosts) {
      if (host !== baseHost && host.endsWith(`.${baseHost}`)) {
        const protocol = getRequestProtocol(request);
        const redirectUrl = buildAbsoluteRequestUrl(protocol, baseHost, parsedHost.port, request.nextUrl.pathname, request.nextUrl.search);
        return redirectAbsolute(redirectUrl, 307);
      }
    }
  }

  const manageRouteDecision = getManageRouteDecision(request.nextUrl.pathname);
  if (manageRouteDecision.redirectPathname) {
    const redirectUrl = request.nextUrl.clone();
    applyRedirectHostname(redirectUrl, host, parsedHost.port);
    redirectUrl.pathname = manageRouteDecision.redirectPathname;
    return redirectAbsolute(redirectUrl, 308);
  }

  const routedPathname = manageRouteDecision.rewritePathname ?? request.nextUrl.pathname;
  const globalPlatformRedirectHost = getGlobalPlatformRedirectHost(routedPathname);
  const protocol = getRequestProtocol(request);

  if (globalPlatformRedirectHost && normalizeHost(globalPlatformRedirectHost) !== host) {
    const redirectUrl = buildAbsoluteRequestUrl(protocol, globalPlatformRedirectHost, parsedHost.port, routedPathname, request.nextUrl.search);
    if (!isSameUrlTargetForRequest(request, parsedHost, protocol, redirectUrl)) {
      return redirectAbsolute(redirectUrl, 307);
    }
  }

  const legacyOrgPathRedirect = getLegacyOrgPathRedirect(host, routedPathname, tenantBaseHosts);
  if (legacyOrgPathRedirect) {
    const redirectUrl = buildAbsoluteRequestUrl(
      protocol,
      `${legacyOrgPathRedirect.orgSlug}.${legacyOrgPathRedirect.baseHost}`,
      parsedHost.port,
      routedPathname,
      request.nextUrl.search
    );
    redirectUrl.pathname = legacyOrgPathRedirect.pathname;
    return redirectAbsolute(redirectUrl, 307);
  }

  let rewriteUrl: URL | null = null;

  if (orgSubdomain) {
    const redirectHost = getPlatformRedirectHostForSubdomain(routedPathname, orgSubdomain.baseHost);

    if (redirectHost && normalizeHost(redirectHost) !== host) {
      const redirectUrl = buildAbsoluteRequestUrl(protocol, redirectHost, parsedHost.port, routedPathname, request.nextUrl.search);
      return redirectAbsolute(redirectUrl, 307);
    }

    if (!shouldSkipCustomDomainRoutingPath(routedPathname)) {
      const prefix = `/${orgSubdomain.orgSlug}`;
      const visiblePathname = request.nextUrl.pathname;
      const currentPathname = routedPathname;
      const visibleAlreadyOrgPrefixed = visiblePathname === prefix || visiblePathname.startsWith(`${prefix}/`);

      if (visibleAlreadyOrgPrefixed) {
        const redirectUrl = request.nextUrl.clone();
        applyRedirectHostname(redirectUrl, host, parsedHost.port);
        redirectUrl.pathname = stripOrgPrefixPath(visiblePathname, prefix);
        return redirectAbsolute(redirectUrl, 308);
      }

      rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = currentPathname === "/" ? prefix : `${prefix}${currentPathname}`;
    }
  } else if (host && !platformHosts.has(host)) {
    const orgSlug = await resolveOrgSlugForDomain(host);

    if (orgSlug) {
      const redirectHost = getCustomDomainRedirectHost(routedPathname, orgSlug);

      if (redirectHost && normalizeHost(redirectHost) !== host) {
        const redirectUrl = buildAbsoluteRequestUrl(protocol, redirectHost, parsedHost.port, routedPathname, request.nextUrl.search);
        return redirectAbsolute(redirectUrl, 307);
      }

      if (!shouldSkipCustomDomainRoutingPath(routedPathname)) {
        const prefix = `/${orgSlug}`;
        const visiblePathname = request.nextUrl.pathname;
        const currentPathname = routedPathname;
        const visibleAlreadyOrgPrefixed = visiblePathname === prefix || visiblePathname.startsWith(`${prefix}/`);

        if (visibleAlreadyOrgPrefixed) {
          const redirectUrl = request.nextUrl.clone();
          applyRedirectHostname(redirectUrl, host, parsedHost.port);
          redirectUrl.pathname = stripOrgPrefixPath(visiblePathname, prefix);
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

const NON_ORG_PATH_SEGMENTS = new Set(["account", "api", "auth", "brand", "create", "forbidden", "inbox", "profiles", "settings", "x"]);
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

const PLATFORM_ONLY_ROOT_SEGMENTS = new Set(["account", "brand", "create", "forbidden", "inbox", "profiles", "settings", "x"]);

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

  if (firstSegment === "manage" || firstSegment === "tools" || firstSegment === "workspace") {
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

type ManageRouteDecision = {
  redirectPathname?: string;
  rewritePathname?: string;
};

function getManageRouteDecision(pathname: string): ManageRouteDecision {
  const segments = pathname.replace(/^\/+/, "").split("/").filter(Boolean);
  if (segments.length === 0) {
    return {};
  }

  const first = segments[0] ?? "";
  const hasOrgPrefix =
    segments.length > 1 &&
    first !== "manage" &&
    first !== "tools" &&
    first !== "workspace" &&
    !PLATFORM_ONLY_ROOT_SEGMENTS.has(first) &&
    !NON_ORG_PATH_SEGMENTS.has(first) &&
    ORG_SEGMENT_PATTERN.test(first) &&
    !isReservedSubdomain(first);
  const rootIndex = hasOrgPrefix ? 1 : 0;
  const root = segments[rootIndex];

  if (root === "tools" || root === "workspace") {
    const redirected = [...segments];
    redirected[rootIndex] = "manage";
    return { redirectPathname: `/${redirected.join("/")}` };
  }

  return {};
}
