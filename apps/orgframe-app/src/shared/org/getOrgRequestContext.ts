import { cache } from "react";
import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";
import { getOrgPublicContext } from "@/src/shared/org/getOrgPublicContext";
import { getOptionalOrgMembershipAccess, type OrgMembershipAccess } from "@/src/shared/org/getOptionalOrgMembershipAccess";
import { getOrgCapabilities, type OrgCapabilities } from "@/src/shared/permissions/orgCapabilities";
import type { OrgPublicContext } from "@/src/shared/org/types";

export type OrgRequestContext = {
  org: OrgPublicContext;
  membership: OrgMembershipAccess | null;
  capabilities: OrgCapabilities | null;
};

const getOrgRequestContextCached = cache(async (orgSlug: string): Promise<OrgRequestContext> => {
  const org = await getOrgPublicContext(orgSlug);
  const sessionUser = await getSessionUser();
  const membership = await getOptionalOrgMembershipAccess(org.orgId, {
    sessionUser,
    toolAvailability: org.toolAvailability
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
