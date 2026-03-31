import type { OrgRole, Permission } from "@/src/features/core/access";
import type { OrgToolAvailability } from "@/src/shared/org/features";

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
  toolAvailability: OrgToolAvailability;
};

export type OrgAuthContext = OrgPublicContext & {
  membershipRole: OrgRole;
  membershipPermissions: Permission[];
  userId: string;
};
