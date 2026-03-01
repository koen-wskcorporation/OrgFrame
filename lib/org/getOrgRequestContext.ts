import { cache } from "react";
import { getSessionUser } from "@/lib/auth/getSessionUser";
import { getOrgPublicContext } from "@/lib/org/getOrgPublicContext";
import { getOptionalOrgMembershipAccess, type OrgMembershipAccess } from "@/lib/org/getOptionalOrgMembershipAccess";
import { getOrgCapabilities, type OrgCapabilities } from "@/lib/permissions/orgCapabilities";
import type { OrgPublicContext } from "@/lib/org/types";

export type OrgRequestContext = {
  org: OrgPublicContext;
  membership: OrgMembershipAccess | null;
  capabilities: OrgCapabilities | null;
};

const getOrgRequestContextCached = cache(async (orgSlug: string): Promise<OrgRequestContext> => {
  const org = await getOrgPublicContext(orgSlug);
  const sessionUser = await getSessionUser();
  const membership = await getOptionalOrgMembershipAccess(org.orgId, {
    sessionUser
  });

  return {
    org,
    membership,
    capabilities: membership ? getOrgCapabilities(membership.permissions) : null
  };
});

export async function getOrgRequestContext(orgSlug: string): Promise<OrgRequestContext> {
  return getOrgRequestContextCached(orgSlug);
}
