function normalizePathname(pathname: string) {
  if (!pathname) {
    return "/";
  }
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function toOrgPathSuffix(pathname: string, currentOrgSlug: string, hasTenantBaseHost: boolean) {
  const normalizedPath = normalizePathname(pathname);

  if (normalizedPath === "/") {
    return "/";
  }

  const segments = normalizedPath.split("/").filter(Boolean);
  if (segments.length === 0) {
    return "/";
  }

  if (currentOrgSlug && segments[0] === currentOrgSlug) {
    return segments.length === 1 ? "/" : `/${segments.slice(1).join("/")}`;
  }

  if (!hasTenantBaseHost) {
    return "/";
  }

  const first = segments[0]?.toLowerCase() ?? "";
  if (first === "account" || first === "auth" || first === "api") {
    return "/";
  }

  return `/${segments.join("/")}`;
}

function collapseToClosestOrgPath(pathSuffix: string) {
  const normalizedSuffix = normalizePathname(pathSuffix);
  if (normalizedSuffix === "/") {
    return "/";
  }

  const segments = normalizedSuffix.split("/").filter(Boolean);
  if (segments.length === 0) {
    return "/";
  }

  const first = segments[0]?.toLowerCase();
  const second = segments[1]?.toLowerCase();

  const collectionModules = new Set(["facility", "facilities", "forms", "programs"]);
  if ((first === "tools" || first === "manage") && second && collectionModules.has(second) && segments.length >= 3) {
    return `/${segments.slice(0, 2).join("/")}`;
  }

  const publicCollections = new Set(["calendar", "events", "programs", "register"]);
  if (first && publicCollections.has(first) && segments.length >= 2) {
    return `/${first}`;
  }

  return normalizedSuffix;
}

export function getTenantBaseHost(tenantBaseOrigin?: string | null) {
  if (!tenantBaseOrigin) return "";
  try {
    return new URL(tenantBaseOrigin).hostname;
  } catch {
    return "";
  }
}

export function getTenantBaseAuthority(tenantBaseOrigin?: string | null) {
  if (!tenantBaseOrigin) return "";
  try {
    return new URL(tenantBaseOrigin).host;
  } catch {
    return "";
  }
}

export function getTenantBaseProtocol(tenantBaseOrigin?: string | null) {
  if (!tenantBaseOrigin) return "";
  try {
    return new URL(tenantBaseOrigin).protocol;
  } catch {
    return "";
  }
}

export function buildOrgSwitchHref(input: {
  targetOrgSlug: string;
  pathname: string;
  currentOrgSlug: string;
  tenantBaseHost: string;
  tenantBaseAuthority: string;
  tenantBaseProtocol: string;
  currentProtocol: string;
}) {
  const { targetOrgSlug, pathname, currentOrgSlug, tenantBaseHost, tenantBaseAuthority, tenantBaseProtocol, currentProtocol } = input;
  const protocol = tenantBaseProtocol || currentProtocol;
  const pathSuffix = collapseToClosestOrgPath(toOrgPathSuffix(pathname, currentOrgSlug, Boolean(tenantBaseHost)));

  if (tenantBaseAuthority) {
    return `${protocol}//${targetOrgSlug}.${tenantBaseAuthority}${pathSuffix}`;
  }

  if (pathSuffix === "/") {
    return `/${targetOrgSlug}`;
  }

  return `/${targetOrgSlug}${pathSuffix}`;
}
