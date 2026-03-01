function parseHostFromUrl(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return value.replace(/^https?:\/\//, "").split("/")[0] ?? "";
  }
}

export function normalizeHost(host: string | null | undefined) {
  if (!host) {
    return "";
  }

  const trimmed = host.trim().toLowerCase().replace(/\.+$/, "");
  const withoutPort = trimmed.includes(":") ? (trimmed.split(":")[0] ?? "") : trimmed;
  return withoutPort;
}

export function getPlatformHost() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;

  if (!siteUrl) {
    return "localhost";
  }

  return normalizeHost(parseHostFromUrl(siteUrl));
}

export function getPlatformHosts() {
  const hosts = new Set<string>(["localhost", "127.0.0.1"]);
  const primary = getPlatformHost();

  if (primary) {
    hosts.add(primary);
  }

  return hosts;
}

export function normalizeDomain(value: string) {
  let normalized = value.trim().toLowerCase();

  normalized = normalized.replace(/^https?:\/\//, "");
  normalized = normalized.split("/")[0] ?? "";
  normalized = normalized.split("?")[0] ?? "";
  normalized = normalized.split("#")[0] ?? "";

  if (normalized.includes(":")) {
    normalized = normalized.split(":")[0] ?? "";
  }

  return normalized.replace(/\.+$/, "");
}

export function shouldSkipCustomDomainRoutingPath(pathname: string) {
  if (pathname === "/") {
    return false;
  }

  return (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/account") ||
    pathname.startsWith("/forbidden")
  );
}
