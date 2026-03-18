export type OrgAdminNavIcon =
  | "wrench"
  | "settings"
  | "building"
  | "globe"
  | "palette"
  | "users"
  | "credit-card"
  | "layout"
  | "calendar"
  | "file-text"
  | "map"
  | "inbox";

export type OrgAdminNavItem = {
  key: string;
  label: string;
  href: string;
  description: string;
  icon: OrgAdminNavIcon;
  parentKey?: string;
  showInHome?: boolean;
};

export function getOrgAdminNavItems(orgSlug: string): OrgAdminNavItem[] {
  return [
    {
      key: "manage-general",
      label: "General",
      href: `/${orgSlug}/manage/info`,
      description: "View organization metadata and governing body settings.",
      icon: "building",
      parentKey: "manage",
      showInHome: false
    },
    {
      key: "manage-domains",
      label: "Domains",
      href: `/${orgSlug}/manage/domains`,
      description: "Connect and manage your custom organization domain.",
      icon: "globe",
      parentKey: "manage",
      showInHome: false
    },
    {
      key: "manage-branding",
      label: "Branding",
      href: `/${orgSlug}/manage/branding`,
      description: "Update logo, icon, and organization accent color.",
      icon: "palette",
      parentKey: "manage",
      showInHome: false
    },
    {
      key: "manage-accounts",
      label: "Accounts",
      href: `/${orgSlug}/manage/access`,
      description: "Invite users and manage organization roles.",
      icon: "users",
      parentKey: "manage",
      showInHome: false
    },
    {
      key: "manage-billing",
      label: "Billing",
      href: `/${orgSlug}/manage/billing`,
      description: "Review subscription and billing controls.",
      icon: "credit-card",
      parentKey: "manage",
      showInHome: false
    },
    {
      key: "manage-sportsconnect",
      label: "SportsConnect Transfer",
      href: `/${orgSlug}/manage/sportsconnect`,
      description: "Import SportsConnect enrollments, players, and order history.",
      icon: "file-text",
      parentKey: "manage",
      showInHome: false
    },
    {
      key: "programs",
      label: "Programs",
      href: `/${orgSlug}/manage/programs`,
      description: "Create and edit programs, divisions, and schedules.",
      icon: "wrench",
      showInHome: true
    },
    {
      key: "calendar",
      label: "Calendar",
      href: `/${orgSlug}/manage/calendar`,
      description: "Manage events, practices, games, facility bookings, and team invites.",
      icon: "calendar",
      showInHome: true
    },
    {
      key: "facilities",
      label: "Facilities",
      href: `/${orgSlug}/manage/facilities`,
      description: "Manage spaces, bookings, blackouts, and facility availability.",
      icon: "map",
      showInHome: true
    },
    {
      key: "forms",
      label: "Forms",
      href: `/${orgSlug}/manage/forms`,
      description: "Build forms and process submissions.",
      icon: "file-text",
      showInHome: true
    },
    {
      key: "inbox",
      label: "Inbox",
      href: `/${orgSlug}/manage/inbox`,
      description: "Resolve and manage unified conversations across channels.",
      icon: "inbox",
      showInHome: true
    },
    {
      key: "manage",
      label: "Manage",
      href: `/${orgSlug}/manage`,
      description: "Organization management settings and access controls.",
      icon: "settings",
      showInHome: true
    }
  ];
}

export type OrgToolsNavIcon = OrgAdminNavIcon;
export type OrgToolsNavItem = OrgAdminNavItem;

// Backward-compat alias while callsites migrate.
export const getOrgToolsNavItems = getOrgAdminNavItems;
