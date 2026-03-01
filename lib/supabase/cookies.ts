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

function getForwardedProtoValue(value: string | null) {
  return value?.split(",")[0]?.trim().toLowerCase();
}

export function isHttpsRequest(request: Pick<NextRequest, "headers" | "nextUrl">) {
  const forwardedProto = getForwardedProtoValue(request.headers.get("x-forwarded-proto"));
  return forwardedProto === "https" || request.nextUrl.protocol === "https:";
}

export function normalizeSupabaseCookieOptions(options: SupabaseCookieOptions | undefined, isHttps: boolean) {
  const normalized: SupabaseCookieOptions = {
    ...options,
    path: "/",
    sameSite: "lax",
    secure: isHttps
  };

  delete normalized.domain;

  if (normalized.httpOnly === false) {
    delete normalized.httpOnly;
  }

  return normalized;
}
