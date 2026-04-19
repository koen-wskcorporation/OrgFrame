import { resolveCname, resolveTxt } from "node:dns/promises";
import { getPlatformHost, normalizeDomain } from "@/src/shared/domains/customDomains";

type DomainVerificationResult = {
  verified: boolean;
  status: "verified" | "failed";
  message: string;
};

function flattenTxtRecords(records: string[][]) {
  return records.map((entry) => entry.join("").trim()).filter(Boolean);
}

function normalizeCnameRecord(value: string) {
  return normalizeDomain(value);
}

async function checkHttpRouting(domain: string): Promise<DomainVerificationResult | null> {
  try {
    const response = await fetch(`https://${domain}`, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(8000)
    });

    const vercelError = (response.headers.get("x-vercel-error") ?? "").trim().toLowerCase();

    if (vercelError === "deployment_not_found") {
      return {
        verified: false,
        status: "failed",
        message:
          "DNS is connected, but Vercel does not have this domain mapped to the app yet. Add the exact domain in Vercel Project Settings > Domains, then verify again."
      };
    }

    if (response.status === 404) {
      const body = await response.text().catch(() => "");
      if (body.includes("DEPLOYMENT_NOT_FOUND")) {
        return {
          verified: false,
          status: "failed",
          message:
            "DNS is connected, but Vercel routing is not configured for this host. Add the domain in Vercel Project Settings > Domains, then verify again."
        };
      }
    }
  } catch {
    // Ignore HTTP probe errors because DNS propagation and TLS provisioning can be transient.
  }

  return null;
}

export async function verifyCustomDomainDns(domain: string, verificationToken: string): Promise<DomainVerificationResult> {
  const normalizedDomain = normalizeDomain(domain);
  const primaryTxtHost = `_orgframe-verification.${normalizedDomain}`;
  const legacyTxtHost = `_sports-saas-verification.${normalizedDomain}`;
  const expectedToken = verificationToken.trim();

  if (!normalizedDomain || !expectedToken) {
    return {
      verified: false,
      status: "failed",
      message: "Domain verification inputs are invalid."
    };
  }

  let txtValues: string[] = [];
  let txtMatched = false;

  try {
    txtValues = flattenTxtRecords(await resolveTxt(primaryTxtHost));
    txtMatched = txtValues.includes(expectedToken);
  } catch {
    txtValues = [];
  }

  if (!txtMatched) {
    try {
      txtValues = flattenTxtRecords(await resolveTxt(legacyTxtHost));
      txtMatched = txtValues.includes(expectedToken);
    } catch {
      txtValues = [];
    }
  }

  if (!txtMatched) {
    return {
      verified: false,
      status: "failed",
      message: `TXT record not found for ${primaryTxtHost}.`
    };
  }

  let cnameValues: string[] = [];

  try {
    cnameValues = (await resolveCname(normalizedDomain)).map(normalizeCnameRecord);
  } catch {
    cnameValues = [];
  }

  const platformHost = normalizeDomain(getPlatformHost());

  if (cnameValues.length > 0 && !cnameValues.some((value) => value === platformHost)) {
    return {
      verified: false,
      status: "failed",
      message: `CNAME must point to ${platformHost}.`
    };
  }

  const routingResult = await checkHttpRouting(normalizedDomain);
  if (routingResult) {
    return routingResult;
  }

  return {
    verified: true,
    status: "verified",
    message: "Domain verified successfully."
  };
}
