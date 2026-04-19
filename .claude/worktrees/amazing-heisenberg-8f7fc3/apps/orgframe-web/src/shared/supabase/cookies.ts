import type { NextRequest } from "next/server";

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

function getSharedAuthCookieDomain() {
  const raw = process.env.AUTH_COOKIE_DOMAIN;
  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^\./, "");

  return normalized || null;
}

function getForwardedProtoValue(value: string | null) {
  return value?.split(",")[0]?.trim().toLowerCase();
}

export function isHttpsRequest(request: Pick<NextRequest, "headers" | "nextUrl">) {
  const forwardedProto = getForwardedProtoValue(request.headers.get("x-forwarded-proto"));
  return forwardedProto === "https" || request.nextUrl.protocol === "https:";
}

export function normalizeSupabaseCookieOptions(options: SupabaseCookieOptions | undefined, isHttps: boolean) {
  const sharedCookieDomain = getSharedAuthCookieDomain();
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
