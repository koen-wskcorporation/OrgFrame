import type { OrgRole, Permission } from "@/modules/core/access";
import type { OrgFeatures } from "@/lib/org/features";

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
  branding: OrgBranding;
  governingBody: OrgGoverningBody | null;
  features: OrgFeatures;
};

export type OrgAuthContext = OrgPublicContext & {
  membershipRole: OrgRole;
  membershipPermissions: Permission[];
  userId: string;
};
