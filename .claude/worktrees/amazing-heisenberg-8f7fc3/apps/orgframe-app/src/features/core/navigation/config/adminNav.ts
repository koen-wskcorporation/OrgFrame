import type { OrgCapabilities } from "@/src/shared/permissions/orgCapabilities";
import { isOrgToolEnabled, type OrgToolAvailability } from "@/src/shared/org/features";

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

type OrgAdminNavVisibility = {
  capabilities: OrgCapabilities | null;
  toolAvailability: OrgToolAvailability;
};

function hasAnyVisibleChild(items: OrgAdminNavItem[], parentKey: string) {
  return items.some((item) => item.parentKey === parentKey);
}

function isNavItemVisible(item: OrgAdminNavItem, visibility?: OrgAdminNavVisibility) {
  if (!visibility) {
    return true;
  }

  const { capabilities, toolAvailability } = visibility;

  switch (item.key) {
    case "manage-general":
      return isOrgToolEnabled(toolAvailability, "info") && Boolean(capabilities?.manage.canRead);
    case "manage-domains":
      return isOrgToolEnabled(toolAvailability, "domains") && Boolean(capabilities?.manage.canRead);
    case "manage-branding":
      return isOrgToolEnabled(toolAvailability, "branding") && Boolean(capabilities?.manage.canRead);
    case "people":
      return isOrgToolEnabled(toolAvailability, "people") && Boolean(capabilities?.people.canAccess || capabilities?.manage.canRead);
    case "people-overview":
      return isOrgToolEnabled(toolAvailability, "people") && Boolean(capabilities?.people.canAccess || capabilities?.manage.canRead);
    case "people-groups":
      return isOrgToolEnabled(toolAvailability, "people") && Boolean(capabilities?.people.canAccess || capabilities?.manage.canRead);
    case "manage-billing":
      return isOrgToolEnabled(toolAvailability, "billing") && Boolean(capabilities?.manage.canRead);
    case "payments":
      return isOrgToolEnabled(toolAvailability, "billing") && Boolean(capabilities?.manage.canRead);
    case "payments-overview":
      return isOrgToolEnabled(toolAvailability, "billing") && Boolean(capabilities?.manage.canRead);
    case "payments-settings":
      return isOrgToolEnabled(toolAvailability, "billing") && Boolean(capabilities?.manage.canRead);
    case "payments-links":
      return isOrgToolEnabled(toolAvailability, "billing") && Boolean(capabilities?.manage.canRead);
    case "manage-imports":
      return isOrgToolEnabled(toolAvailability, "imports") && Boolean(capabilities?.manage.canRead);
    case "programs":
      return isOrgToolEnabled(toolAvailability, "programs") && Boolean(capabilities?.programs.canAccess);
    case "calendar":
      return isOrgToolEnabled(toolAvailability, "calendar") && Boolean(capabilities?.calendar.canAccess || capabilities?.programs.canAccess);
    case "facilities":
      return isOrgToolEnabled(toolAvailability, "facilities") && Boolean(capabilities?.facilities.canAccess);
    case "forms":
      return isOrgToolEnabled(toolAvailability, "forms") && Boolean(capabilities?.forms.canAccess);
    case "inbox":
      return isOrgToolEnabled(toolAvailability, "inbox") && Boolean(capabilities?.communications.canAccess);
    case "manage":
      return Boolean(capabilities?.manage.canRead);
    default:
      return true;
  }
}

export function getOrgAdminNavItems(_orgSlug: string, visibility?: OrgAdminNavVisibility): OrgAdminNavItem[] {
  const items: OrgAdminNavItem[] = [
    {
      key: "manage-general",
      label: "General",
      href: "/tools/info",
      description: "View organization metadata and governing body settings.",
      icon: "building",
      parentKey: "manage",
      showInHome: false
    },
    {
      key: "manage-domains",
      label: "Domains",
      href: "/tools/domains",
      description: "Connect and manage your custom organization domain.",
      icon: "globe",
      parentKey: "manage",
      showInHome: false
    },
    {
      key: "manage-branding",
      label: "Branding",
      href: "/tools/branding",
      description: "Update logo, icon, and organization accent color.",
      icon: "palette",
      parentKey: "manage",
      showInHome: false
    },
    {
      key: "manage-imports",
      label: "Smart Import",
      href: "/tools/imports",
      description: "Run staged imports for people, programs, and commerce data.",
      icon: "file-text",
      parentKey: "manage",
      showInHome: false
    },
    {
      key: "people",
      label: "People",
      href: "/tools/people",
      description: "Manage accounts, linked player/staff profiles, and relationships.",
      icon: "users",
      showInHome: true
    },
    {
      key: "people-overview",
      label: "Overview",
      href: "/tools/people",
      description: "Accounts and linked profiles.",
      icon: "users",
      parentKey: "people",
      showInHome: false
    },
    {
      key: "people-groups",
      label: "Groups",
      href: "/tools/people/groups",
      description: "Relationship groups and reusable sets.",
      icon: "users",
      parentKey: "people",
      showInHome: false
    },
    {
      key: "programs",
      label: "Programs",
      href: "/tools/programs",
      description: "Create and edit programs, divisions, and schedules.",
      icon: "wrench",
      showInHome: true
    },
    {
      key: "calendar",
      label: "Calendar",
      href: "/tools/calendar",
      description: "Manage events, practices, games, facility bookings, and team invites.",
      icon: "calendar",
      showInHome: true
    },
    {
      key: "facilities",
      label: "Facilities",
      href: "/tools/facilities",
      description: "Manage spaces, bookings, blackouts, and facility availability.",
      icon: "map",
      showInHome: true
    },
    {
      key: "forms",
      label: "Forms",
      href: "/tools/forms",
      description: "Build forms and process submissions.",
      icon: "file-text",
      showInHome: true
    },
    {
      key: "inbox",
      label: "Inbox",
      href: "/tools/inbox",
      description: "Resolve and manage unified conversations across channels.",
      icon: "inbox",
      showInHome: true
    },
    {
      key: "payments",
      label: "Payments",
      href: "/tools/payments",
      description: "Review transactions and manage Stripe payment settings.",
      icon: "credit-card",
      showInHome: true
    },
    {
      key: "payments-overview",
      label: "Overview",
      href: "/tools/payments",
      description: "All payment transactions for this organization.",
      icon: "credit-card",
      parentKey: "payments",
      showInHome: false
    },
    {
      key: "payments-settings",
      label: "Settings",
      href: "/tools/payments/settings",
      description: "Stripe Connect onboarding and tax compliance defaults.",
      icon: "settings",
      parentKey: "payments",
      showInHome: false
    },
    {
      key: "payments-links",
      label: "Links",
      href: "/tools/payments/links",
      description: "Generate and manage ad hoc payment links.",
      icon: "credit-card",
      parentKey: "payments",
      showInHome: false
    },
    {
      key: "manage",
      label: "Manage",
      href: "/tools",
      description: "Organization management settings and access controls.",
      icon: "settings",
      showInHome: true
    }
  ];

  const visibleItems = items.filter((item) => isNavItemVisible(item, visibility));

  return visibleItems.filter((item) => {
    if (item.key !== "manage") {
      return true;
    }

    return hasAnyVisibleChild(visibleItems, "manage");
  });
}

export type OrgToolsNavIcon = OrgAdminNavIcon;
export type OrgToolsNavItem = OrgAdminNavItem;

// Backward-compat alias while callsites migrate.
export const getOrgToolsNavItems = getOrgAdminNavItems;
