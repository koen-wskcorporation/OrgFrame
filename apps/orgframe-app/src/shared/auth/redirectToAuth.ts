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

function isLocalDevHost(host: string): boolean {
  // Treat hostnames without a dot (or explicit localhost / 127.x / 0.0.0.0) as
  // dev/CI. We don't want to bounce dev traffic to the production auth host.
  if (!host) return true;
  if (host === "localhost" || host.startsWith("127.") || host === "0.0.0.0") return true;
  if (host.endsWith(".local") || host.endsWith(".test")) return true;
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

  if (isLocalDevHost(currentHost)) {
    redirect(`/auth${search}`);
  }

  redirect(`${protocol}://${canonicalHost}/${search}`);
}
