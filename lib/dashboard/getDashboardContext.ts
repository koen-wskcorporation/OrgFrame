import { getOrgAssetPublicUrl } from "@/lib/branding/getOrgAssetPublicUrl";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/getCurrentUser";
import { requireAuth } from "@/lib/auth/requireAuth";
import { listUserOrgs } from "@/lib/org/listUserOrgs";
import type { OrgRole } from "@/modules/core/access";

export type DashboardUser = Pick<CurrentUser, "userId" | "email" | "firstName" | "lastName" | "avatarUrl">;

export type DashboardOrgMembership = {
  orgId: string;
  orgName: string;
  orgSlug: string;
  role: OrgRole;
  iconUrl: string | null;
};

export type DashboardContext = {
  user: DashboardUser;
  organizations: DashboardOrgMembership[];
};

export async function getDashboardContext(): Promise<DashboardContext> {
  const sessionUser = await requireAuth();

  const [currentUser, orgMemberships] = await Promise.all([getCurrentUser({ sessionUser }), listUserOrgs()]);

  const organizations = orgMemberships.map((membership) => {
    const assetPath = membership.iconPath ?? membership.logoPath;
    const iconUrl = getOrgAssetPublicUrl(assetPath);

    return {
      orgId: membership.orgId,
      orgName: membership.orgName,
      orgSlug: membership.orgSlug,
      role: membership.role,
      iconUrl
    };
  });

  if (!currentUser) {
    return {
      user: {
        userId: sessionUser.id,
        email: sessionUser.email,
        firstName: null,
        lastName: null,
        avatarUrl: null
      },
      organizations
    };
  }

  return {
    user: {
      userId: currentUser.userId,
      email: currentUser.email,
      firstName: currentUser.firstName,
      lastName: currentUser.lastName,
      avatarUrl: currentUser.avatarUrl
    },
    organizations
  };
}
