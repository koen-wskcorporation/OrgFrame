import { resolveCname, resolveTxt } from "node:dns/promises";
import { getPlatformHost, normalizeDomain } from "@/lib/domains/customDomains";

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

export async function verifyCustomDomainDns(domain: string, verificationToken: string): Promise<DomainVerificationResult> {
  const normalizedDomain = normalizeDomain(domain);
  const expectedTxtHost = `_sports-saas-verification.${normalizedDomain}`;
  const expectedToken = verificationToken.trim();

  if (!normalizedDomain || !expectedToken) {
    return {
      verified: false,
      status: "failed",
      message: "Domain verification inputs are invalid."
    };
  }

  let txtValues: string[] = [];

  try {
    txtValues = flattenTxtRecords(await resolveTxt(expectedTxtHost));
  } catch {
    txtValues = [];
  }

  const txtMatched = txtValues.includes(expectedToken);

  if (!txtMatched) {
    return {
      verified: false,
      status: "failed",
      message: `TXT record not found for ${expectedTxtHost}.`
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

  return {
    verified: true,
    status: "verified",
    message: "Domain verified successfully."
  };
}
