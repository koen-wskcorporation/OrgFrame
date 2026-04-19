import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerForRequest } from "@/src/shared/data-api/server";
import { consumeHandoffToken } from "@/src/shared/auth/handoff";

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

function getRequestOriginFromHeaders(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const hostHeader = request.headers.get("host")?.split(",")[0]?.trim();
  const host = forwardedHost || hostHeader || request.nextUrl.host;

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const protocol = forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : request.nextUrl.protocol.replace(":", "");

  return `${protocol}://${host}`;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const nextFromQuery = normalizeNextPath(request.nextUrl.searchParams.get("next"));

  if (!token) {
    return NextResponse.redirect(new URL("/auth?error=handoff_failed", request.url), { status: 303 });
  }

  const expectedOrigin = getRequestOriginFromHeaders(request);

  let consumed;
  try {
    consumed = await consumeHandoffToken(token, expectedOrigin);
  } catch {
    return NextResponse.redirect(new URL("/auth?error=handoff_failed", request.url), { status: 303 });
  }

  const nextPath = nextFromQuery !== "/" ? nextFromQuery : normalizeNextPath(consumed.nextPath);
  const response = NextResponse.redirect(new URL(nextPath, request.url), { status: 303 });
  const supabase = createSupabaseServerForRequest(request, response);

  const { error } = await supabase.auth.setSession({
    access_token: consumed.session.accessToken,
    refresh_token: consumed.session.refreshToken
  });

  if (error) {
    return NextResponse.redirect(new URL("/auth?error=handoff_failed", request.url), { status: 303 });
  }

  return response;
}
