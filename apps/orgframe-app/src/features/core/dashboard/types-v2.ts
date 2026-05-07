import type { OrgCapabilities } from "@/src/shared/permissions/orgCapabilities";
import type { OrgRole, Permission } from "@/src/features/core/access";
import type { OrgToolAvailability } from "@/src/features/core/config/tools";
import type { OrgType } from "@/src/shared/org/orgTypes";

export const personalHubModuleKeys = ["notifications", "schedule", "registrations", "inbox"] as const;

export type PersonalHubModuleKey = (typeof personalHubModuleKeys)[number];

export type DashboardUserPreferences = {
  hiddenModules: PersonalHubModuleKey[];
  moduleOrder: PersonalHubModuleKey[];
  pinnedOrgIds: string[];
  orgOrder: string[];
  compactMode: boolean;
};

export type DashboardV2OrgMembership = {
  orgId: string;
  orgSlug: string;
  orgName: string;
  orgType: OrgType | null;
  displayHost: string;
  role: OrgRole;
  iconUrl: string | null;
  logoUrl: string | null;
  toolAvailability: OrgToolAvailability;
  membershipPermissions: Permission[];
  capabilities: OrgCapabilities;
};

export type DashboardNotificationItem = {
  id: string;
  orgId: string;
  orgSlug: string;
  orgName: string;
  itemType: string;
  title: string;
  body: string | null;
  href: string | null;
  isRead: boolean;
  createdAt: string;
};

export type DashboardScheduleItem = {
  occurrenceId: string;
  orgId: string;
  orgSlug: string;
  orgName: string;
  title: string;
  summary: string | null;
  entryType: string;
  startsAtUtc: string;
  endsAtUtc: string;
  href: string | null;
};

export type DashboardRegistrationItem = {
  submissionId: string;
  orgId: string;
  orgSlug: string;
  orgName: string;
  formId: string;
  formName: string;
  formSlug: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  href: string;
};

export type DashboardInboxItem = {
  conversationId: string;
  orgId: string;
  orgSlug: string;
  orgName: string;
  channelType: string;
  resolutionStatus: string;
  subject: string | null;
  previewText: string | null;
  lastMessageAt: string;
  href: string;
};

type PersonalHubModuleBase<T extends PersonalHubModuleKey> = {
  key: T;
  title: string;
  description: string;
  error: string | null;
};

export type NotificationsPersonalHubModule = PersonalHubModuleBase<"notifications"> & {
  unreadCount: number;
  items: DashboardNotificationItem[];
};

export type SchedulePersonalHubModule = PersonalHubModuleBase<"schedule"> & {
  items: DashboardScheduleItem[];
};

export type RegistrationsPersonalHubModule = PersonalHubModuleBase<"registrations"> & {
  items: DashboardRegistrationItem[];
};

export type InboxPersonalHubModule = PersonalHubModuleBase<"inbox"> & {
  unreadLikeCount: number;
  items: DashboardInboxItem[];
};

export type PersonalHubModule =
  | NotificationsPersonalHubModule
  | SchedulePersonalHubModule
  | RegistrationsPersonalHubModule
  | InboxPersonalHubModule;

export type DashboardAdminQuickLink = {
  key: string;
  label: string;
  href: string;
  description: string;
};

export type AdminRailOrgSection = {
  orgId: string;
  orgSlug: string;
  orgName: string;
  role: OrgRole;
  iconUrl: string | null;
  quickLinks: DashboardAdminQuickLink[];
  statuses: {
    unreadNotifications: number;
    upcomingEvents: number;
    registrationTasks: number;
    openInboxConversations: number;
  };
};

export type DashboardV2Context = {
  user: {
    userId: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  };
  organizations: DashboardV2OrgMembership[];
  personalHub: {
    modules: PersonalHubModule[];
  };
  adminRail: {
    sections: AdminRailOrgSection[];
  };
  preferences: DashboardUserPreferences;
};
