import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerForRequest } from "@/src/shared/data-api/server";
import { getPlatformHost, normalizeHost } from "@/src/shared/domains/customDomains";

function normalizeNextPath(nextPath: string | null, fallbackPath: string) {
  const candidate = nextPath?.trim();

  if (!candidate || !candidate.startsWith("/")) {
    return fallbackPath;
  }

  // Reject protocol-relative, malformed, and absolute-style redirects.
  if (candidate.startsWith("//") || candidate.startsWith("/\\") || candidate.includes("://")) {
    return fallbackPath;
  }

  if (candidate.includes("\n") || candidate.includes("\r") || candidate.includes("\0")) {
    return fallbackPath;
  }

  return candidate;
}

export async function GET(request: NextRequest) {
  const canonicalHost = normalizeHost(getPlatformHost());
  const currentHost = normalizeHost(request.nextUrl.hostname);
  if (canonicalHost && currentHost && canonicalHost !== currentHost) {
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
    const protocol = forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : request.nextUrl.protocol.replace(":", "");
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.protocol = `${protocol}:`;
    canonicalUrl.hostname = canonicalHost;
    canonicalUrl.port = "";
    return NextResponse.redirect(canonicalUrl, { status: 307 });
  }

  const nextPath = normalizeNextPath(request.nextUrl.searchParams.get("next"), "/");
  const successResponse = NextResponse.redirect(new URL(nextPath, request.url), { status: 303 });
  const supabase = createSupabaseServerForRequest(request, successResponse);

  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return successResponse;
    }
  }

  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash
    });

    if (!error) {
      return successResponse;
    }
  }

  return NextResponse.redirect(new URL("/auth/reset?error=callback_failed", request.url), { status: 303 });
}
