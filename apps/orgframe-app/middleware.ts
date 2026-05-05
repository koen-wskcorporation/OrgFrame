import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCanonicalAuthHost, normalizeHost } from "@/src/shared/domains/customDomains";

// Serve the auth UI at the root of the canonical auth host (e.g.
// `auth.orgframe.app/`) instead of `/auth`. This middleware:
//
// - Rewrites `GET /` to `/auth` on the canonical host so the existing
//   `app/auth/page.tsx` renders without changing the visible URL.
// - Permanently redirects `/auth` (with any query) to `/` on the canonical
//   host so legacy links and form posts converge on the clean URL.
//
// Subroutes (`/auth/callback`, `/auth/handoff`, `/auth/reset`, `/auth/login`)
// are intentionally untouched — they remain reachable at their full paths.
//
// Off the canonical host (platform host, custom domains, dev/localhost) the
// middleware is a no-op; `/auth` continues to behave as it does today.
export function middleware(request: NextRequest) {
  const canonicalHost = normalizeHost(getCanonicalAuthHost());
  if (!canonicalHost) {
    return NextResponse.next();
  }

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const hostHeader = request.headers.get("host")?.split(",")[0]?.trim() ?? "";
  const currentHost = normalizeHost(forwardedHost || hostHeader);

  if (currentHost !== canonicalHost) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;

  if (pathname === "/auth") {
    const target = new URL(`/${search}`, request.url);
    return NextResponse.redirect(target, 308);
  }

  if (pathname === "/") {
    const rewriteUrl = new URL(`/auth${search}`, request.url);
    return NextResponse.rewrite(rewriteUrl);
  }

  return NextResponse.next();
}

// Only intercept requests that could collide with the auth-host root rewrite.
// Anything else passes through untouched.
export const config = {
  matcher: ["/", "/auth"]
};
