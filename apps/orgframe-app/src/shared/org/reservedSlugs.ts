const reservedSlugs = new Set([
  "account",
  "auth",
  "debug",
  "forbidden",
  "_next",
  "api",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "not-found"
]);

export function isReservedOrgSlug(orgSlug: string) {
  return reservedSlugs.has(orgSlug.toLowerCase());
}
