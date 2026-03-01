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
  | "map";

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
      key: "tools-overview",
      label: "Overview",
      href: `/${orgSlug}/tools`,
      description: "Open the organization admin overview.",
      icon: "layout",
      showInHome: false
    },
    {
      key: "manage-general",
      label: "General",
      href: `/${orgSlug}/tools/manage/info`,
      description: "View organization metadata and governing body settings.",
      icon: "building",
      parentKey: "manage",
      showInHome: false
    },
    {
      key: "manage-domains",
      label: "Domains",
      href: `/${orgSlug}/tools/manage/domains`,
      description: "Connect and manage your custom organization domain.",
      icon: "globe",
      parentKey: "manage",
      showInHome: false
    },
    {
      key: "manage-branding",
      label: "Branding",
      href: `/${orgSlug}/tools/manage/branding`,
      description: "Update logo, icon, and organization accent color.",
      icon: "palette",
      parentKey: "manage",
      showInHome: false
    },
    {
      key: "manage-accounts",
      label: "Accounts",
      href: `/${orgSlug}/tools/manage/access`,
      description: "Invite users and manage organization roles.",
      icon: "users",
      parentKey: "manage",
      showInHome: false
    },
    {
      key: "manage-billing",
      label: "Billing",
      href: `/${orgSlug}/tools/manage/billing`,
      description: "Review subscription and billing controls.",
      icon: "credit-card",
      parentKey: "manage",
      showInHome: false
    },
    {
      key: "programs",
      label: "Programs",
      href: `/${orgSlug}/tools/programs`,
      description: "Create and edit programs, divisions, and schedules.",
      icon: "wrench",
      showInHome: true
    },
    {
      key: "events",
      label: "Events",
      href: `/${orgSlug}/tools/events`,
      description: "Create and publish events for lists and calendar blocks.",
      icon: "calendar",
      showInHome: true
    },
    {
      key: "facilities",
      label: "Facilities",
      href: `/${orgSlug}/tools/facilities`,
      description: "Manage spaces, bookings, blackouts, and facility availability.",
      icon: "map",
      showInHome: true
    },
    {
      key: "forms",
      label: "Forms",
      href: `/${orgSlug}/tools/forms`,
      description: "Build forms and process submissions.",
      icon: "file-text",
      showInHome: true
    },
    {
      key: "manage",
      label: "Manage",
      href: `/${orgSlug}/tools/manage`,
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
