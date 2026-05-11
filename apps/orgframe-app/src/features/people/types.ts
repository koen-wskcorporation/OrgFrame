export type PeopleProfileType = "player" | "staff";
export type PeopleProfileStatus = "draft" | "pending_claim" | "active" | "archived";
export type PeopleRelationshipType = "self" | "guardian" | "delegated_manager";
export type PeopleInviteStatus = "none" | "pending" | "accepted" | "expired" | "cancelled";

export type PeopleProfileAddress = {
  /** Free-text autocompleted description from Google Places. Preferred display value. */
  description?: string;
  /** Google Places `place_id` if the user picked a prediction. */
  placeId?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

export type PeopleProfile = {
  id: string;
  personUserId: string | null;
  orgId: string | null;
  profileType: PeopleProfileType;
  status: PeopleProfileStatus;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  dob: string | null;
  email: string | null;
  sex: string | null;
  school: string | null;
  grade: string | null;
  avatarPath: string | null;
  addressJson: PeopleProfileAddress;
  metadataJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PeopleProfileLink = {
  id: string;
  orgId: string | null;
  accountUserId: string | null;
  profileId: string;
  relationshipType: PeopleRelationshipType;
  canManage: boolean;
  pendingInviteEmail: string | null;
  inviteStatus: PeopleInviteStatus;
  metadataJson: Record<string, unknown>;
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
