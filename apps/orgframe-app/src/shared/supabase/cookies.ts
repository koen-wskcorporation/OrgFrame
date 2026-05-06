import type { NextRequest } from "next/server";
import { getTenantBaseHosts, normalizeHost } from "@/src/shared/domains/customDomains";

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

function isIpHost(host: string) {
  if (host === "127.0.0.1" || host === "::1") {
    return true;
  }

  return /^\d+\.\d+\.\d+\.\d+$/.test(host);
}

function getPlatformSharedCookieDomain(requestHost: string | null | undefined) {
  const host = normalizeHost(requestHost);
  if (!host || isIpHost(host)) {
    return null;
  }

  for (const baseHost of getTenantBaseHosts()) {
    if (host === baseHost || host.endsWith(`.${baseHost}`)) {
      return baseHost;
    }
  }

  return null;
}

function getSharedAuthCookieDomain(requestHost: string | null | undefined) {
  // Cookie scope = the platform host, derived from NEXT_PUBLIC_PLATFORM_HOST.
  // Custom-domain requests (org's own domain) get host-only cookies because
  // the platform host doesn't apply to them.
  return getPlatformSharedCookieDomain(requestHost);
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
