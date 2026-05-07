// Marketing → app routing. Reads the same single env var as the app to
// build the entry URL.
//
//   NEXT_PUBLIC_PLATFORM_HOST  →  "orgframe.app" | "staging.orgframe.app"
//
// All previous URL env vars (NEXT_PUBLIC_APP_ORIGIN, ORGFRAME_APP_ORIGIN,
// NEXT_PUBLIC_WEB_ORIGIN, etc.) are gone. Marketing's own host is
// NEXT_PUBLIC_MARKETING_HOST and is consumed elsewhere — this module
// only deals with where to send users when they leave marketing.

const DEFAULT_PLATFORM_HOST = "orgframe.app";

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.+$/, "");
}

function isLocalHost(host: string): boolean {
  return (
    host === "localhost" ||
    host.startsWith("127.") ||
    host === "0.0.0.0" ||
    host.endsWith(".test") ||
    host.endsWith(".local")
  );
}

function getPlatformHost(): string {
  const raw = process.env.NEXT_PUBLIC_PLATFORM_HOST?.trim();
  if (!raw) return DEFAULT_PLATFORM_HOST;
  const normalized = normalizeHost(raw);
  return normalized || DEFAULT_PLATFORM_HOST;
}

export function getAppOrigin(): string {
  const host = getPlatformHost();
  const protocol = isLocalHost(host) ? "http" : "https";
  return `${protocol}://${host}`;
}

/**
 * Single entrypoint URL for any marketing CTA that should land the user in
 * the app — whether they're signed in or not. The app handles the rest.
 */
export function getAppEntryUrl(): string {
  return `${getAppOrigin()}/`;
}
