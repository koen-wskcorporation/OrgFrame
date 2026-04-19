import type { OrgRole, Permission } from "@/src/features/core/access";
import type { OrgToolAvailability } from "@/src/features/core/config/tools";
import type { OrgType } from "@/src/shared/org/orgTypes";

export type OrgBranding = {
  logoPath: string | null;
  iconPath: string | null;
  accent: string | null;
};

export type OrgGoverningBody = {
  id: string;
  slug: string;
  name: string;
  logoPath: string;
  logoUrl: string;
};

export type OrgPublicContext = {
  orgId: string;
  orgSlug: string;
  orgName: string;
  orgType: OrgType | null;
  customDomain: string | null;
  displayHost: string;
  branding: OrgBranding;
  governingBody: OrgGoverningBody | null;
  toolAvailability: OrgToolAvailability;
};

export type OrgAuthContext = OrgPublicContext & {
  membershipRole: OrgRole;
  membershipPermissions: Permission[];
  userId: string;
};
