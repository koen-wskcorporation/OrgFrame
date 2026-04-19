import { getPlatformHost, normalizeHost } from "@/src/shared/domains/customDomains";

export function getOrgDisplayHost(orgSlug: string, customDomain: string | null | undefined): string {
  const verified = normalizeHost(customDomain ?? "");
  if (verified) {
    return verified;
  }

  return `${orgSlug}.${getPlatformHost()}`;
}
