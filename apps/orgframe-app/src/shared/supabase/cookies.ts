import type { NextRequest } from "next/server";
import { extractOrgSlugFromSubdomain, getTenantBaseHosts, normalizeHost } from "@/src/shared/domains/customDomains";

type SupabaseCookieOptions = {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: "lax" | "strict" | "none";
  secure?: boolean;
};

export type SupabaseCookieToSet = {
  name: string;
  value: string;
  options?: SupabaseCookieOptions;
};

function normalizeCookieDomain(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^\./, "");

  return normalized || null;
}

function isIpHost(host: string) {
  if (host === "127.0.0.1" || host === "::1") {
    return true;
  }

  return /^\d+\.\d+\.\d+\.\d+$/.test(host);
}

function looksLikeTenantSubdomain(host: string, candidates: string[]) {
  for (const candidate of candidates) {
    if (candidate === host) {
      continue;
    }

    if (extractOrgSlugFromSubdomain(host, candidate)) {
      return true;
    }
  }

  return false;
}

function getDefaultSharedCookieDomain(requestHost: string | null | undefined) {
  const host = normalizeHost(requestHost);
  if (!host || isIpHost(host)) {
    return null;
  }

  const tenantBaseHosts = Array.from(getTenantBaseHosts());
  const candidates = tenantBaseHosts.filter((candidate) => {
    if (!candidate || isIpHost(candidate)) {
      return false;
    }

    return !looksLikeTenantSubdomain(candidate, tenantBaseHosts);
  });

  let bestMatch: string | null = null;

  for (const candidate of candidates) {
    if (host !== candidate && !host.endsWith(`.${candidate}`)) {
      continue;
    }

    if (!bestMatch || candidate.length > bestMatch.length) {
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

function getSharedAuthCookieDomain(requestHost: string | null | undefined) {
  const explicit = normalizeCookieDomain(process.env.AUTH_COOKIE_DOMAIN ?? "");
  if (explicit) {
    return explicit;
  }

  return getDefaultSharedCookieDomain(requestHost);
}

function getForwardedProtoValue(value: string | null) {
  return value?.split(",")[0]?.trim().toLowerCase();
}

export function isHttpsRequest(request: Pick<NextRequest, "headers" | "nextUrl">) {
  const forwardedProto = getForwardedProtoValue(request.headers.get("x-forwarded-proto"));
  return forwardedProto === "https" || request.nextUrl.protocol === "https:";
}

export function normalizeSupabaseCookieOptions(options: SupabaseCookieOptions | undefined, isHttps: boolean, requestHost?: string | null) {
  const sharedCookieDomain = getSharedAuthCookieDomain(requestHost);
  const normalized: SupabaseCookieOptions = {
    ...options,
    path: "/",
    sameSite: "lax",
    secure: isHttps
  };

  if (sharedCookieDomain) {
    normalized.domain = sharedCookieDomain;
  } else {
    delete normalized.domain;
  }

  if (normalized.httpOnly === false) {
    delete normalized.httpOnly;
  }

  return normalized;
}
