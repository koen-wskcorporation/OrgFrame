import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerForRequest } from "@/src/shared/data-api/server";
import { getCanonicalAuthHost, getPlatformHost, normalizeHost } from "@/src/shared/domains/customDomains";
import { mintHandoffToken, resolveAllowedReturnOrigin } from "@/src/shared/auth/handoff";

function normalizeNextPath(nextPath: string | null, fallbackPath = "/") {
  const candidate = nextPath?.trim();

  if (!candidate || !candidate.startsWith("/")) {
    return fallbackPath;
  }

  if (candidate.startsWith("//") || candidate.startsWith("/\\") || candidate.includes("://")) {
    return fallbackPath;
  }

  if (candidate.includes("\n") || candidate.includes("\r") || candidate.includes("\0")) {
    return fallbackPath;
  }

  return candidate;
}

function resolveProtocol(request: NextRequest): string {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : request.nextUrl.protocol.replace(":", "");
}

export async function GET(request: NextRequest) {
  const canonicalHost = normalizeHost(getCanonicalAuthHost());
  const currentHost = normalizeHost(request.nextUrl.hostname);

  if (canonicalHost && currentHost && canonicalHost !== currentHost) {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.protocol = `${resolveProtocol(request)}:`;
    canonicalUrl.hostname = canonicalHost;
    canonicalUrl.port = "";
    return NextResponse.redirect(canonicalUrl, { status: 307 });
  }

  const nextPath = normalizeNextPath(request.nextUrl.searchParams.get("next"));
  const returnToRaw = request.nextUrl.searchParams.get("return_to");

  const platformHost = normalizeHost(getPlatformHost());
  const protocol = resolveProtocol(request);
  const platformPort = request.nextUrl.port;
  const platformHostWithPort = platformPort ? `${platformHost}:${platformPort}` : platformHost;
  const fallbackTarget = platformHost && platformHost !== canonicalHost
    ? new URL(nextPath, `${protocol}://${platformHostWithPort}`)
    : new URL(nextPath, request.url);

  const fallbackResponse = NextResponse.redirect(fallbackTarget, { status: 303 });
  const supabase = createSupabaseServerForRequest(request, fallbackResponse);

  let exchangeSucceeded = false;

  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      exchangeSucceeded = true;
    }
  }

  if (!exchangeSucceeded) {
    const tokenHash = request.nextUrl.searchParams.get("token_hash");
    const type = request.nextUrl.searchParams.get("type");
    if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({
        type: type as EmailOtpType,
        token_hash: tokenHash
      });

      if (!error) {
        exchangeSucceeded = true;
      }
    }
  }

  if (!exchangeSucceeded) {
    return NextResponse.redirect(new URL("/auth/reset?error=callback_failed", request.url), { status: 303 });
  }

  if (returnToRaw) {
    const allowed = await resolveAllowedReturnOrigin(returnToRaw);
    if (allowed && allowed.host !== canonicalHost) {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;

      if (session) {
        try {
          const { url } = await mintHandoffToken({
            session: {
              accessToken: session.access_token,
              refreshToken: session.refresh_token
            },
            targetOrigin: allowed.origin,
            nextPath,
            userId: session.user.id
          });

          return NextResponse.redirect(url, { status: 302 });
        } catch {
          // Fall through to canonical next.
        }
      }
    }
  }

  return fallbackResponse;
}
