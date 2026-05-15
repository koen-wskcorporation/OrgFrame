import type { NextRequest } from "next/server";

type SupabaseCookieOptions = {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: boolean | "lax" | "strict" | "none";
  secure?: boolean;
};

export type SupabaseCookieToSet = {
  name: string;
  value: string;
  options?: SupabaseCookieOptions;
};

// The auth cookie scope is always the platform host (so cookies set on
// `auth.<platform>` are visible from `<platform>` and any tenant subdomain).
// Derived from the same NEXT_PUBLIC_PLATFORM_HOST env var as everything else.
function getPlatformHost(): string | null {
  const raw = process.env.NEXT_PUBLIC_PLATFORM_HOST?.trim().toLowerCase();
  if (!raw) return null;
  const normalized = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.+$/, "");
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
  const platformHost = getPlatformHost();
  const normalized: SupabaseCookieOptions = {
    ...options,
    path: "/",
    sameSite: "lax",
    secure: isHttps
  };

  if (platformHost) {
    normalized.domain = platformHost;
  } else {
    delete normalized.domain;
  }

  if (normalized.httpOnly === false) {
    delete normalized.httpOnly;
  }

  return normalized;
}
