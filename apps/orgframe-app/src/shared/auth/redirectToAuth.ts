import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCanonicalAuthHost, normalizeHost } from "@/src/shared/domains/customDomains";

function resolveProtocol(headerStore: Headers): "http" | "https" {
  const forwarded = headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwarded === "http" || forwarded === "https") {
    return forwarded;
  }
  return process.env.NODE_ENV === "production" ? "https" : "http";
}

function isEphemeralHost(host: string): boolean {
  // Hosts where we should NOT cross-origin redirect to the canonical auth
  // host because:
  //   - localhost / 127.x — no DNS entry for the canonical host.
  //   - `*.vercel.app` — Vercel preview/branch deploys with random URLs.
  //     Bouncing them to the production canonical host either crosses
  //     environments (staging preview → production auth) or hits Vercel's
  //     deployment protection wall and returns a 403.
  //
  // For all of these we keep the redirect same-origin and serve `/auth`
  // locally instead.
  if (!host) return true;
  if (host === "localhost" || host.startsWith("127.") || host === "0.0.0.0") return true;
  if (host.endsWith(".vercel.app")) return true;
  return !host.includes(".");
}

/**
 * Redirect the user to the auth page on the canonical auth host (e.g.
 * `auth.orgframe.app/`). Eliminates the previous marketing-site bounce and
 * keeps the URL bar at root — the middleware rewrites `/` → `/auth/page.tsx`
 * on the canonical host.
 *
 * - On the canonical auth host: redirect to root (clean URL).
 * - On any other recognised platform host: cross-origin redirect to the
 *   canonical auth host root.
 * - On localhost / dev hosts: fall back to the local `/auth` route since the
 *   middleware rewrite only fires on the canonical host.
 */
export async function redirectToAuth(nextPath?: string): Promise<never> {
  const headerStore = await headers();
  const protocol = resolveProtocol(headerStore);
  const forwardedHost = headerStore.get("x-forwarded-host")?.split(",")[0]?.trim();
  const hostHeader = headerStore.get("host")?.split(",")[0]?.trim() ?? "";
  const currentHost = normalizeHost(forwardedHost || hostHeader);
  const canonicalHost = normalizeHost(getCanonicalAuthHost());

  const trimmedNext = typeof nextPath === "string" ? nextPath.trim() : "";
  const search = trimmedNext && trimmedNext !== "/" ? `?next=${encodeURIComponent(trimmedNext)}` : "";

  if (!canonicalHost || currentHost === canonicalHost) {
    redirect(`/${search}`);
  }

  if (isEphemeralHost(currentHost)) {
    redirect(`/auth${search}`);
  }

  // Preserve the current request port so dev (e.g. `orgframe.test:3000` →
  // `auth.orgframe.test:3000`) doesn't collapse to the default 80/443.
  const portIdx = hostHeader.indexOf(":");
  const port = portIdx >= 0 ? hostHeader.slice(portIdx) : "";
  redirect(`${protocol}://${canonicalHost}${port}/${search}`);
}
