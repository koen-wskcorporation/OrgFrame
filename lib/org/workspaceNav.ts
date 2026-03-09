import {
  orgWorkspaceEventsPath,
  orgWorkspaceFacilitiesPath,
  orgWorkspaceFormsPath,
  orgWorkspacePath,
  orgWorkspaceProgramsPath,
  orgWorkspaceSettingsPath,
  orgWorkspaceSettingsSectionPath
} from "@/lib/org/routes";
import { isOrgFeatureEnabled, type OrgFeatures } from "@/lib/org/features";

export type OrgWorkspaceNavIcon =
  | "briefcase"
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
  | "sliders";

export type OrgWorkspaceNavItem = {
  key: string;
  label: string;
  href: string;
  description: string;
  icon: OrgWorkspaceNavIcon;
  parentKey?: string;
  showInHome?: boolean;
};

export function getOrgWorkspaceNavItems(orgSlug: string, features?: OrgFeatures): OrgWorkspaceNavItem[] {
  const items: OrgWorkspaceNavItem[] = [
    {
      key: "workspace-overview",
      label: "Overview",
      href: orgWorkspacePath(orgSlug),
      description: "Open the organization workspace overview.",
      icon: "layout",
      showInHome: false
    },
    {
      key: "settings-general",
      label: "General",
      href: orgWorkspaceSettingsSectionPath(orgSlug, "general"),
      description: "View organization metadata and governing body settings.",
      icon: "building",
      parentKey: "settings",
      showInHome: false
    },
    {
      key: "settings-domains",
      label: "Domains",
      href: orgWorkspaceSettingsSectionPath(orgSlug, "domains"),
      description: "Connect and manage your custom organization domain.",
      icon: "globe",
      parentKey: "settings",
      showInHome: false
    },
    {
      key: "settings-branding",
      label: "Branding",
      href: orgWorkspaceSettingsSectionPath(orgSlug, "branding"),
      description: "Update logo, icon, and organization accent color.",
      icon: "palette",
      parentKey: "settings",
      showInHome: false
    },
    {
      key: "settings-access",
      label: "Access",
      href: orgWorkspaceSettingsSectionPath(orgSlug, "access"),
      description: "Invite users and manage organization roles.",
      icon: "users",
      parentKey: "settings",
      showInHome: false
    },
    {
      key: "settings-features",
      label: "Features",
      href: orgWorkspaceSettingsSectionPath(orgSlug, "features"),
      description: "Enable or disable org modules and future monetization controls.",
      icon: "sliders",
      parentKey: "settings",
      showInHome: false
    },
    {
      key: "settings-billing",
      label: "Billing",
      href: orgWorkspaceSettingsSectionPath(orgSlug, "billing"),
      description: "Review subscription and billing controls.",
      icon: "credit-card",
      parentKey: "settings",
      showInHome: false
    },
    {
      key: "programs",
      label: "Programs",
      href: orgWorkspaceProgramsPath(orgSlug),
      description: "Create and edit programs, divisions, and schedules.",
      icon: "briefcase",
      showInHome: true
    },
    {
      key: "events",
      label: "Events",
      href: orgWorkspaceEventsPath(orgSlug),
      description: "Manage events, practices, games, facility bookings, and team invites.",
      icon: "calendar",
      showInHome: true
    },
    {
      key: "facilities",
      label: "Facilities",
      href: orgWorkspaceFacilitiesPath(orgSlug),
      description: "Manage facility types, hierarchy, maps, and calendar allocations.",
      icon: "map",
      showInHome: true
    },
    {
      key: "forms",
      label: "Forms",
      href: orgWorkspaceFormsPath(orgSlug),
      description: "Build forms and process submissions.",
      icon: "file-text",
      showInHome: true
    },
    {
      key: "settings",
      label: "Settings",
      href: orgWorkspaceSettingsPath(orgSlug),
      description: "Organization settings and access controls.",
      icon: "settings",
      showInHome: true
    }
  ];

  return items.filter((item) => {
    if (!features) {
      return true;
    }

    if (item.key === "programs") {
      return isOrgFeatureEnabled(features, "programs");
    }

    if (item.key === "events") {
      return isOrgFeatureEnabled(features, "calendar");
    }

    if (item.key === "facilities") {
      return isOrgFeatureEnabled(features, "facilities");
    }

    if (item.key === "forms") {
      return isOrgFeatureEnabled(features, "forms");
    }

    return true;
  });
}
