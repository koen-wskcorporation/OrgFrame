const reservedSlugs = new Set([
  "account",
  "auth",
  "create",
  "debug",
  "forbidden",
  "_next",
  "api",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "not-found",
  "inbox",
  "profiles",
  "settings"
]);

export function isReservedOrgSlug(orgSlug: string) {
  return reservedSlugs.has(orgSlug.toLowerCase());
}
