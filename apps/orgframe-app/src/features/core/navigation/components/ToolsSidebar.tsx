"use client";

import { useMemo } from "react";
import { OrgAreaSidebarNav, OrgAreaSidebarNavMobile, type OrgAreaSidebarConfig } from "@/src/features/core/navigation/components/OrgAreaSidebarNav";
import { getOrgAdminNavTree } from "@/src/features/core/navigation/config/adminNav";
import { ORG_ADMIN_ICON_MAP } from "@/src/features/core/navigation/config/iconRegistry";
import type { OrgCapabilities } from "@/src/shared/permissions/orgCapabilities";
import type { OrgToolAvailability } from "@/src/features/core/config/tools";

type ManageSidebarProps = {
  orgSlug: string;
  capabilities: OrgCapabilities | null;
  toolAvailability: OrgToolAvailability;
  roleLabel?: string;
  mobile?: boolean;
  showHeader?: boolean;
};

function navConfig(
  orgSlug: string,
  capabilities: OrgCapabilities | null,
  toolAvailability: OrgToolAvailability,
  roleLabel?: string
): OrgAreaSidebarConfig {
  const tree = getOrgAdminNavTree(orgSlug, { capabilities, toolAvailability });

  const manageNode = tree.find((node) => node.key === "manage");
  const orderedTree = manageNode
    ? [...tree.filter((node) => node.key !== "manage"), manageNode]
    : tree;

  const items: OrgAreaSidebarConfig["items"] = orderedTree.map((node) => {
    const icon = ORG_ADMIN_ICON_MAP[node.icon];
    const base = {
      key: node.key,
      label: node.label,
      icon,
      href: node.href,
      match: node.match ?? "prefix"
    } as const;

    if (node.children.length === 0) {
      return base;
    }

    return {
      ...base,
      subtreePrefixes: node.children.map((child) => child.href),
      children: node.children.map((child) => ({
        key: child.key,
        label: child.label,
        icon: ORG_ADMIN_ICON_MAP[child.icon],
        href: child.href,
        match: child.match ?? "prefix"
      }))
    };
  });

  return {
    title: "Manage",
    subtitle: "",
    roleChipLabel: roleLabel,
    mobileLabel: "Manage",
    ariaLabel: "Manage area navigation",
    collapseStorageKey: `manage-sidebar:${orgSlug}:collapsed`,
    autoCollapse: {
      enabled: true,
      includeChildItemHrefs: true,
      minAdditionalSegments: 1
    },
    items
  };
}

export function ManageSidebar({ orgSlug, capabilities, toolAvailability, roleLabel, mobile = false, showHeader = true }: ManageSidebarProps) {
  const config = useMemo(() => navConfig(orgSlug, capabilities, toolAvailability, roleLabel), [capabilities, orgSlug, roleLabel, toolAvailability]);
  return <OrgAreaSidebarNav config={config} mobile={mobile} showHeader={showHeader} />;
}

type ManageSidebarMobileProps = {
  orgSlug: string;
  capabilities: OrgCapabilities | null;
  toolAvailability: OrgToolAvailability;
  roleLabel?: string;
};

export function ManageSidebarMobile({ orgSlug, capabilities, toolAvailability, roleLabel }: ManageSidebarMobileProps) {
  const config = useMemo(() => navConfig(orgSlug, capabilities, toolAvailability, roleLabel), [capabilities, orgSlug, roleLabel, toolAvailability]);
  return <OrgAreaSidebarNavMobile config={config} />;
}

// Backward-compat aliases while imports migrate.
export const ToolsSidebar = ManageSidebar;
export const ToolsSidebarMobile = ManageSidebarMobile;
