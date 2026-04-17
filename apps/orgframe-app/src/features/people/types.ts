export type PeopleProfileType = "player" | "staff";
export type PeopleProfileStatus = "draft" | "pending_claim" | "active" | "archived";
export type PeopleRelationshipType = "self" | "guardian" | "delegated_manager";
export type PeopleInviteStatus = "none" | "pending" | "accepted" | "expired" | "cancelled";

export type PeopleProfile = {
  id: string;
  personUserId: string | null;
  orgId: string;
  profileType: PeopleProfileType;
  status: PeopleProfileStatus;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  dob: string | null;
  metadataJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PeopleProfileLink = {
  id: string;
  orgId: string;
  accountUserId: string | null;
  profileId: string;
  relationshipType: PeopleRelationshipType;
  canManage: boolean;
  pendingInviteEmail: string | null;
  inviteStatus: PeopleInviteStatus;
  createdAt: string;
  updatedAt: string;
};

export type PeopleAccountRow = {
  userId: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarPath: string | null;
  avatarUrl: string | null;
  role: string;
  status: "active" | "pending";
  joinedAt: string | null;
  lastActivityAt: string | null;
};

export type PeopleDirectoryAccount = PeopleAccountRow & {
  profiles: Array<{
    profile: PeopleProfile;
    links: PeopleProfileLink[];
  }>;
};

export type PeopleDirectoryResult = {
  accounts: PeopleDirectoryAccount[];
  totalAccounts: number;
  page: number;
  pageSize: number;
};
