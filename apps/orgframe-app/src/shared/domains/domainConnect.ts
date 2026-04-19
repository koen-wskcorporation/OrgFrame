import { resolveTxt } from "node:dns/promises";
import { normalizeDomain } from "@/src/shared/domains/customDomains";

type DomainConnectSettings = {
  providerId: string;
  providerName?: string;
  providerDisplayName?: string;
  urlSyncUX: string;
  urlAPI: string;
};

type DomainConnectServiceConfig = {
  providerId: string;
  serviceId: string;
  redirectUri: string | null;
  varCnameTargetKey: string;
  varTxtHostKey: string;
  varTxtValueKey: string;
  providerIdSource: "env" | "derived";
  serviceIdSource: "env" | "default";
};

export type GoDaddyQuickConnect = {
  available: boolean;
  reason: string | null;
  applyUrl: string | null;
  providerLabel: string;
};

export type GoDaddyQuickConnectDiagnostics = {
  rootDomain: string;
  provider: {
    detected: boolean;
    providerHost: string | null;
    providerId: string | null;
    providerLabel: string | null;
    isGoDaddy: boolean;
  };
  template: {
    providerId: string;
    serviceId: string;
    providerIdSource: "env" | "derived";
    serviceIdSource: "env" | "default";
    supportedByProvider: boolean;
    filename: string;
  };
  apply: {
    ready: boolean;
    url: string | null;
    reason: string | null;
  };
};

function getEnv(name: string) {
  return (process.env[name] ?? "").trim();
}

function flattenTxtRecords(records: string[][]) {
  return records.map((entry) => entry.join("").trim()).filter(Boolean);
}

function toRootDomain(domain: string) {
  const normalized = normalizeDomain(domain);
  if (normalized.startsWith("www.")) {
    return normalized.slice("www.".length);
  }

  return normalized;
}

function parseHostFromUrl(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return value.replace(/^https?:\/\//, "").split("/")[0] ?? "";
  }
}

function deriveProviderIdFromSiteUrl() {
  const siteUrl = getEnv("NEXT_PUBLIC_SITE_URL") || getEnv("SITE_URL");
  const host = normalizeDomain(parseHostFromUrl(siteUrl));

  if (!host) {
    return "sportssaas.local";
  }

  return host.startsWith("www.") ? host.slice("www.".length) : host;
}

function getDomainConnectServiceConfig(): DomainConnectServiceConfig {
  const envProviderId = getEnv("DOMAIN_CONNECT_PROVIDER_ID");
  const envServiceId = getEnv("DOMAIN_CONNECT_SERVICE_ID");

  return {
    providerId: envProviderId || deriveProviderIdFromSiteUrl(),
    serviceId: envServiceId || "customdomain",
    redirectUri: getEnv("DOMAIN_CONNECT_REDIRECT_URI") || null,
    varCnameTargetKey: getEnv("DOMAIN_CONNECT_VAR_CNAME_TARGET_KEY") || "cname_target",
    varTxtHostKey: getEnv("DOMAIN_CONNECT_VAR_TXT_HOST_KEY") || "verification_host",
    varTxtValueKey: getEnv("DOMAIN_CONNECT_VAR_TXT_VALUE_KEY") || "verification_value",
    providerIdSource: envProviderId ? "env" : "derived",
    serviceIdSource: envServiceId ? "env" : "default"
  };
}

function readProviderHostFromTxtValue(value: string) {
  return value.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

async function discoverDomainConnectSettings(
  domain: string
): Promise<{ settings: DomainConnectSettings | null; providerHost: string | null }> {
  const rootDomain = toRootDomain(domain);
  if (!rootDomain) {
    return { settings: null, providerHost: null };
  }

  let txtValues: string[] = [];
  try {
    txtValues = flattenTxtRecords(await resolveTxt(`_domainconnect.${rootDomain}`));
  } catch {
    txtValues = [];
  }

  if (txtValues.length === 0) {
    return { settings: null, providerHost: null };
  }

  const providerHost = readProviderHostFromTxtValue(txtValues[0] ?? "");
  if (!providerHost) {
    return { settings: null, providerHost: null };
  }

  try {
    const response = await fetch(`https://${providerHost}/v2/${rootDomain}/settings`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(6000)
    });

    if (!response.ok) {
      return { settings: null, providerHost };
    }

    const payload = (await response.json()) as Partial<DomainConnectSettings>;
    if (!payload.providerId || !payload.urlAPI || !payload.urlSyncUX) {
      return { settings: null, providerHost };
    }

    return {
      settings: {
        providerId: payload.providerId,
        providerName: payload.providerName,
        providerDisplayName: payload.providerDisplayName,
        urlAPI: payload.urlAPI,
        urlSyncUX: payload.urlSyncUX
      },
      providerHost
    };
  } catch {
    return { settings: null, providerHost };
  }
}

async function isTemplateSupported(urlAPI: string, providerId: string, serviceId: string) {
  try {
    const url = new URL(`/v2/domainTemplates/providers/${encodeURIComponent(providerId)}/services/${encodeURIComponent(serviceId)}`, urlAPI);
    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(6000)
    });

    return response.status >= 200 && response.status < 300;
  } catch {
    return false;
  }
}

function isGoDaddyProvider(settings: DomainConnectSettings) {
  const haystack = `${settings.providerId} ${settings.providerName ?? ""} ${settings.providerDisplayName ?? ""} ${settings.urlSyncUX} ${settings.urlAPI}`.toLowerCase();
  return haystack.includes("godaddy") || haystack.includes("domaincontrol");
}

export function getDomainConnectTemplateDefinition() {
  const config = getDomainConnectServiceConfig();

  return {
    providerId: config.providerId,
    serviceId: config.serviceId,
    serviceName: "OrgFrame Custom Domain",
    providerName: "OrgFrame",
    version: 1,
    variableDescription: {
      [config.varCnameTargetKey]: "CNAME target host",
      [config.varTxtHostKey]: "Verification TXT host",
      [config.varTxtValueKey]: "Verification TXT value"
    },
    records: [
      {
        type: "CNAME",
        host: "@",
        pointsTo: `%${config.varCnameTargetKey}%`,
        ttl: 3600
      },
      {
        type: "TXT",
        host: `%${config.varTxtHostKey}%`,
        data: `%${config.varTxtValueKey}%`,
        ttl: 3600
      }
    ]
  };
}

export async function getGoDaddyQuickConnectDiagnostics(params: {
  domain: string;
  platformHost: string;
  verificationHost: string;
  verificationToken: string;
  orgSlug: string;
}): Promise<GoDaddyQuickConnectDiagnostics> {
  const rootDomain = toRootDomain(params.domain);
  const config = getDomainConnectServiceConfig();
  const discovery = await discoverDomainConnectSettings(rootDomain);
  const settings = discovery.settings;
  const providerLabel = settings ? settings.providerDisplayName ?? settings.providerName ?? settings.providerId : null;
  const goDaddyDetected = Boolean(settings && isGoDaddyProvider(settings));

  const supported = settings ? await isTemplateSupported(settings.urlAPI, config.providerId, config.serviceId) : false;

  const redirectUri = config.redirectUri || `https://${params.platformHost}/${params.orgSlug}/manage/domains?setup=1&step=3&method=godaddy`;

  let applyUrl: string | null = null;
  let reason: string | null = null;

  if (!rootDomain) {
    reason = "Invalid domain.";
  } else if (!settings) {
    reason = "Could not detect DNS provider via _domainconnect TXT.";
  } else if (!goDaddyDetected) {
    reason = "Detected provider is not GoDaddy DNS.";
  } else if (!supported) {
    reason = "GoDaddy did not report this template as supported.";
  } else {
    const url = new URL(
      `/v2/domainTemplates/providers/${encodeURIComponent(config.providerId)}/services/${encodeURIComponent(config.serviceId)}/apply`,
      settings.urlSyncUX
    );
    url.searchParams.set("domain", rootDomain);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set(config.varCnameTargetKey, params.platformHost);
    url.searchParams.set(config.varTxtHostKey, params.verificationHost);
    url.searchParams.set(config.varTxtValueKey, params.verificationToken);
    applyUrl = url.toString();
  }

  return {
    rootDomain,
    provider: {
      detected: Boolean(settings),
      providerHost: discovery.providerHost,
      providerId: settings?.providerId ?? null,
      providerLabel,
      isGoDaddy: goDaddyDetected
    },
    template: {
      providerId: config.providerId,
      serviceId: config.serviceId,
      providerIdSource: config.providerIdSource,
      serviceIdSource: config.serviceIdSource,
      supportedByProvider: supported,
      filename: `${config.providerId.toLowerCase()}.${config.serviceId.toLowerCase()}.json`
    },
    apply: {
      ready: Boolean(applyUrl),
      url: applyUrl,
      reason
    }
  };
}

export async function buildGoDaddyQuickConnect(params: {
  domain: string;
  platformHost: string;
  verificationHost: string;
  verificationToken: string;
  orgSlug: string;
}): Promise<GoDaddyQuickConnect> {
  const diagnostics = await getGoDaddyQuickConnectDiagnostics(params);

  return {
    available: diagnostics.apply.ready,
    reason: diagnostics.apply.reason,
    applyUrl: diagnostics.apply.url,
    providerLabel: diagnostics.provider.providerLabel ?? "GoDaddy"
  };
}
