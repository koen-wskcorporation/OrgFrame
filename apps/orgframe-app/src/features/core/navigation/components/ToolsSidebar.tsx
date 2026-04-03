"use client";

import { useMemo } from "react";
import { OrgAreaSidebarNav, OrgAreaSidebarNavMobile, type OrgAreaSidebarConfig } from "@/src/features/core/navigation/components/OrgAreaSidebarNav";
import { getOrgAdminNavItems } from "@/src/features/core/navigation/config/adminNav";
import { ORG_ADMIN_ICON_MAP } from "@/src/features/core/navigation/config/iconRegistry";
import type { OrgCapabilities } from "@/src/shared/permissions/orgCapabilities";
import type { OrgToolAvailability } from "@/src/shared/org/features";

type ManageSidebarProps = {
  orgSlug: string;
  capabilities: OrgCapabilities | null;
  toolAvailability: OrgToolAvailability;
  mobile?: boolean;
  showHeader?: boolean;
};

function navConfig(orgSlug: string, capabilities: OrgCapabilities | null, toolAvailability: OrgToolAvailability): OrgAreaSidebarConfig {
  const items = getOrgAdminNavItems(orgSlug, { capabilities, toolAvailability });

  const topLevel = items.filter((item) => !item.parentKey);
  const manageItem = topLevel.find((item) => item.key === "manage");

  if (!manageItem) {
    throw new Error("Org admin navigation is missing a manage item.");
  }

  const otherTopLevel = topLevel.filter((item) => item.key !== manageItem.key);
  const orderedTopLevel = [...otherTopLevel, manageItem];

  const sidebarItems: OrgAreaSidebarConfig["items"] = orderedTopLevel.map((item) => {
    const children = items.filter((candidate) => candidate.parentKey === item.key);
    const icon = ORG_ADMIN_ICON_MAP[item.icon];

    if (children.length === 0) {
      return {
        key: item.key,
        label: item.label,
        icon,
        href: item.href,
        match: item.key === "manage" ? ("exact" as const) : ("prefix" as const)
      };
    }

    return {
      key: item.key,
      label: item.label,
      icon,
      href: item.href,
      match: item.key === "manage" ? ("exact" as const) : ("prefix" as const),
      subtreePrefixes: children.map((child) => child.href),
      children: children.map((child) => ({
        key: child.key,
        label: child.label,
        icon: ORG_ADMIN_ICON_MAP[child.icon],
        href: child.href,
        match: "prefix" as const
      }))
    };
  });

  return {
    title: "Manage",
    subtitle: "Manage Your Org",
    mobileLabel: "Manage",
    ariaLabel: "Manage area navigation",
    collapseStorageKey: `manage-sidebar:${orgSlug}:collapsed`,
    autoCollapse: {
      enabled: true,
      includeChildItemHrefs: true,
      minAdditionalSegments: 1
    },
    items: sidebarItems
  };
}

export function ManageSidebar({ orgSlug, capabilities, toolAvailability, mobile = false, showHeader = true }: ManageSidebarProps) {
  const config = useMemo(() => navConfig(orgSlug, capabilities, toolAvailability), [capabilities, orgSlug, toolAvailability]);
  return <OrgAreaSidebarNav config={config} mobile={mobile} showHeader={showHeader} />;
}

type ManageSidebarMobileProps = {
  orgSlug: string;
  capabilities: OrgCapabilities | null;
  toolAvailability: OrgToolAvailability;
};

export function ManageSidebarMobile({ orgSlug, capabilities, toolAvailability }: ManageSidebarMobileProps) {
  const config = useMemo(() => navConfig(orgSlug, capabilities, toolAvailability), [capabilities, orgSlug, toolAvailability]);
  return <OrgAreaSidebarNavMobile config={config} />;
}

// Backward-compat aliases while imports migrate.
export const ToolsSidebar = ManageSidebar;
export const ToolsSidebarMobile = ManageSidebarMobile;
